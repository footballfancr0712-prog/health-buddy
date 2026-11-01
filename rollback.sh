#!/usr/bin/env bash
# 回退到历史版本（从 git tag 重新构建并安装）
#
#   ./rollback.sh                    列出所有可回退的版本
#   ./rollback.sh v1.1.9             构建并安装 v1.1.9
#   ./rollback.sh v1.1.9 --build-only  只构建，不替换已装版本
#   ./rollback.sh --restore          装回最新版（main 分支）
set -euo pipefail

# 本脚本会被 git checkout 删掉（旧版本里没有这个文件），
# 而 bash 边读边执行，文件消失会中断。所以先复制到临时目录再跑。
ROOT="$(cd "$(dirname "$0")" && pwd)"
if [ "${HB_RB_TMP:-}" != "1" ]; then
  TMPD=$(mktemp -d 2>/dev/null || mktemp -d -t hb)
  cp "$ROOT/rollback.sh" "$TMPD/rollback.sh" 2>/dev/null || cp "$0" "$TMPD/rollback.sh"
  HB_RB_TMP=1 HB_RB_ROOT="$ROOT" exec bash "$TMPD/rollback.sh" "$@"
fi
cd "${HB_RB_ROOT:-$(pwd)}"

PROG="$HOME/AppData/Local/Programs/HealthBuddy"
CSV_WIN="$USERPROFILE/Desktop/健康Buddy-我的记录.csv"

say() { printf '%s\n' "$*"; }
die() { say "✗ $*"; exit 1; }

list_versions() {
  say "可回退的版本："
  git for-each-ref --sort=creatordate --format='  %(refname:short)   %(creatordate:format:%m-%d)   %(subject)' refs/tags \
    | grep -v '^  android-' || true
  say ""
  say "注意：只有打过 tag 的版本能回退。未提交过的版本（如 v1.0.0 / v1.1.0 / v1.2.1）代码已不存在。"
}

# ---------- 参数 ----------
TARGET="${1:-}"
BUILD_ONLY=0
if [ "$TARGET" = "--restore" ]; then TARGET="__LATEST__"; fi
if [ "${2:-}" = "--build-only" ]; then BUILD_ONLY=1; fi

if [ -z "$TARGET" ]; then list_versions; exit 0; fi

# ---------- 前置检查 ----------
[ -d .git ] || die "请在项目根目录运行"
[ -d desktop-app/node_modules/electron ] || die "缺少打包依赖，先在 desktop-app 执行 npm i"

if [ -n "$(git status --porcelain | grep -v '^??')" ]; then
  say "✗ 工作区有未提交的改动，回退会把它们带进旧版本，先处理掉："
  git status --short | grep -v '^??' | sed 's/^/    /'
  say ""
  say "  提交：git add -A && git commit -m \"说明\""
  say "  或丢弃：git checkout -- <文件>"
  exit 1
fi

ORIG_BRANCH=$(git rev-parse --abbrev-ref HEAD)
ORIG_COMMIT=$(git rev-parse --short HEAD)
restore_tree() {
  git checkout -q "$ORIG_BRANCH" 2>/dev/null || git checkout -q "$ORIG_COMMIT" 2>/dev/null || true
}
trap restore_tree EXIT

# ---------- 确定目标 ----------
if [ "$TARGET" = "__LATEST__" ]; then
  TARGET="$ORIG_BRANCH"
  say "→ 目标：最新版（$TARGET）"
else
  git rev-parse -q --verify "refs/tags/$TARGET" >/dev/null || die "找不到 tag：$TARGET（不带参数可列出全部）"
  say "→ 目标：$TARGET"
fi

# ---------- 数据风险检查 ----------
cols_of_tag() {
  git show "$1:desktop-app/csv-store.js" 2>/dev/null | python3 -c "
import sys,re
s=sys.stdin.read()
m=re.search(r'const CSV_HEAD = \[(.*?)\];', s, re.S)
print(len(re.findall(r\"'[^']*'\", m.group(1))) if m else 0)
"
}
TAG_COLS=$(cols_of_tag "$TARGET")
FILE_COLS=0
if [ -f "$CSV_WIN" ]; then
  FILE_COLS=$(python3 -c "
import io
t=open(r'$CSV_WIN',encoding='utf-8-sig').readline()
print(len(t.rstrip().split(',')))
" 2>/dev/null || echo 0)
fi

say "  代码版本认识 $TAG_COLS 列；你的记录表有 $FILE_COLS 列"

RISK=0
if [ "$FILE_COLS" -gt 0 ] && [ "$TAG_COLS" -gt 0 ] && [ "$TAG_COLS" -lt "$FILE_COLS" ]; then
  RISK=1
fi

# ---------- 备份记录 ----------
mkdir -p backups
if [ -f "$CSV_WIN" ]; then
  STAMP=$(date +%Y%m%d-%H%M%S)
  BAK="backups/健康Buddy-我的记录-回退到${TARGET}-${STAMP}.csv"
  cp "$CSV_WIN" "$BAK"
  say "✓ 记录已备份：$BAK"
else
  say "  （没找到记录表，跳过备份）"
fi

if [ "$RISK" = "1" ]; then
  say ""
  say "⚠️  数据格式降级警告"
  say "    这一版只认识 $TAG_COLS 列，你的表有 $FILE_COLS 列。"
  say "    它保存任何一天时，会把多出来的列冲掉，之后新版再读还会错位。"
  say "    所以：回退期间只看不改。要改就在别处改，或先升回新版。"
  say ""
fi

# ---------- 构建 ----------
say ""
say "→ 切到 $TARGET 并构建…"
git checkout -q "$TARGET"
VER=$(node -e "console.log(require('./desktop-app/package.json').version)")
say "  版本 $VER"

export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
rm -rf dist-rollback
./desktop-app/node_modules/.bin/electron-packager ./desktop-app HealthBuddy \
  --platform=win32 --arch=x64 --out=dist-rollback --overwrite \
  --icon=desktop-app/build/icon.ico --app-version="$VER" --prune=true \
  --ignore="^/dist" >/dev/null 2>&1

SRC="$PWD/dist-rollback/HealthBuddy-win32-x64"
[ -f "$SRC/HealthBuddy.exe" ] || die "构建失败，产物不存在"

# 精简语言包
for f in "$SRC"/locales/*.pak; do
  b=$(basename "$f")
  case "$b" in en-US.pak|zh-CN.pak|zh-TW.pak) ;; *) rm -f "$f" ;; esac
done

if [ "$BUILD_ONLY" = "1" ]; then
  say ""
  say "✓ 已构建：$SRC"
  say "  （--build-only，没有替换已安装的版本）"
  exit 0
fi

# ---------- 安装 ----------
say "→ 安装到 $PROG"
TARGET_DIR="${LOCALAPPDATA:-$HOME/AppData/Local}/Programs/HealthBuddy"
TARGET_DIR=$(printf '%s' "$TARGET_DIR" | tr '\\' '/')
mkdir -p "$TARGET_DIR"
cp -rf "$SRC/." "$TARGET_DIR/"
rm -rf dist-rollback

[ -f "$TARGET_DIR/HealthBuddy.exe" ] || die "安装后找不到 exe，请检查 $TARGET_DIR"

say ""
say "✓ 已切换到 v$VER"
say "  程序目录：$TARGET_DIR"
if [ "$RISK" = "1" ]; then
  say "  ⚠️ 这一版数据列数较少，改数据请先升回最新版"
fi
say ""
say "装回最新版：./rollback.sh --restore"
