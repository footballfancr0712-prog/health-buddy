#!/usr/bin/env bash
# 一键打包安卓正式版（签名）
#   1. 从主分支同步最新页面到 www/index.html
#   2. cap sync 同步进 android 工程
#   3. gradle 构建 release 并签名
#   4. 复制到仓库根目录，文件名带版本号
set -euo pipefail
cd "$(dirname "$0")"

REPO=$(cd .. && pwd)
PAGE="$REPO/健康Buddy-7天身体管理工作台.html"

if [ ! -f "$PAGE" ]; then
  echo "✗ 找不到页面：$PAGE"
  echo "  请确认当前在 android 分支或 main 分支，且页面文件存在"
  exit 1
fi

# 1. 同步页面
mkdir -p www
cp "$PAGE" www/index.html
echo "✓ 页面已同步 → www/index.html"

# 2. 依赖
if [ ! -d node_modules ]; then
  echo "→ 安装依赖…"
  npm i --registry=https://registry.npmmirror.com --no-audit --no-fund
fi

# cap sync 会去删 capacitor-cordova-android-plugins，本机的安全删除拦截大量文件时会失败；
# 只是改页面时用 copy 就够（插件没变的话 update 那步本来也没有实际改动）
if ! npx cap sync android; then
  echo "! cap sync 失败（多半是安全删除拦截），退回 cap copy"
  npx cap copy android
fi
echo "✓ cap 同步完成"

# 3. 工具链（默认用仓库内 tools/，已装则可被环境变量覆盖）
TOOLS="$REPO/tools"
export JAVA_HOME="${JAVA_HOME:-$(ls -d "$TOOLS"/jdk-21* 2>/dev/null | head -1)}"
export ANDROID_HOME="${ANDROID_HOME:-$TOOLS/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$TOOLS/gradle-home}"
unset ELECTRON_RUN_AS_NODE   # 本机环境变量会干扰部分工具

if [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "✗ 找不到 JDK 21（Capacitor 8 要求）"
  echo "  当前 JAVA_HOME=$JAVA_HOME"
  exit 1
fi
"$JAVA_HOME/bin/java" -version 2>&1 | head -1

# 4. 构建
cd android
./gradlew assembleRelease -x lint -Djava.net.preferIPv4Stack=true
cd ..

VER=$(sed -n 's/.*versionName "\(.*\)".*/\1/p' android/app/build.gradle | head -1)
OUT="$REPO/健康Buddy-安卓版-v${VER}.apk"
cp android/app/build/outputs/apk/release/app-release.apk "$OUT"
echo
echo "✓ 打包完成：$OUT"
ls -lh "$OUT" | awk '{print "  体积: " $5}'
