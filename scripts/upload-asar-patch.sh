#!/usr/bin/env bash
# 把小改动作为「补丁」发到已有的 Release 上（只传 app.asar，约 240 KB）
#
# 用法：
#   ./scripts/upload-asar-patch.sh <tag> <app.asar 路径>
#   ./scripts/upload-asar-patch.sh v1.2.22 .tmp/pkg16/HealthBuddy-win32-x64/resources/app.asar
#
# 前提：代理可用（GitHub 需要），Git 凭据里已有 token（推过一次即可）
#
# 为什么要有这个脚本：
#   桌面版完整包 139 MB，其中 99% 是 Electron 运行时；
#   你自己的程序（app.asar）只有 240 KB。
#   改一行文案就重传 139 MB，既慢又浪费 GitHub 存储。
#   小改动只发 app.asar，老用户替换一个文件即可（新用户仍下完整包）。
set -euo pipefail

TAG="${1:-}"
ASAR="${2:-}"

if [ -z "$TAG" ] || [ -z "$ASAR" ]; then
  echo "用法: $0 <tag> <app.asar 路径>"
  exit 1
fi
[ -f "$ASAR" ] || { echo "✗ 找不到文件: $ASAR"; exit 1; }

REPO="footballfancr0712-prog/health-buddy"
PROXY="${HB_PROXY:-http://127.0.0.1:7897}"

# 1) 取 token（不打印）
TOK="$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null | sed -n 's/^password=//p')"
[ -n "$TOK" ] || { echo "✗ 没拿到 GitHub 凭据，先在 Git Bash 里 git push 一次"; exit 1; }

# 2) 探代理
if ! curl -s -o /dev/null --connect-timeout 4 --max-time 8 -x "$PROXY" https://api.github.com; then
  echo "✗ 代理不通（$PROXY）。先看 Clash 是否在运行，端口可能变了："
  echo "   netstat -ano | grep LISTENING | grep 127.0.0.1"
  exit 1
fi

# 3) 找 Release id
RID="$(curl -s -x "$PROXY" \
  -H "Authorization: token $TOK" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/releases/tags/$TAG" \
  | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))")"

[ -n "$RID" ] || { echo "✗ 找不到 Release: $TAG（先把 tag 推上去）"; exit 1; }

NAME="HealthBuddy-desktop-$TAG-app.asar"
SIZE=$(( $(wc -c < "$ASAR") / 1024 ))
echo "上传 $NAME（${SIZE} KB）→ Release $TAG"

# 4) 上传（同名已存在会 422，属于正常：说明已经传过）
OUT="$(curl -s -x "$PROXY" \
  -H "Authorization: token $TOK" -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@$ASAR" \
  "https://uploads.github.com/repos/$REPO/releases/$RID/assets?name=$NAME")"

echo "$OUT" | python -c "
import sys,json
try:
    a=json.load(sys.stdin)
except Exception:
    print('  ✗ 返回非 JSON（上传可能仍成功，去 Release 页面确认）'); sys.exit(0)
if 'browser_download_url' in a:
    print('  ✓', a['browser_download_url'])
elif a.get('message','').startswith('Validation Failed'):
    print('  ! 同名附件已存在，这次不用重传')
else:
    print('  ✗', json.dumps(a,ensure_ascii=False)[:200])
"

echo
echo "提醒：补丁只对「已经装过桌面版」的用户有效，他们需要手动替换"
echo "      %LOCALAPPDATA%\\Programs\\HealthBuddy\\resources\\app.asar"
echo "      完整包不用重传，除非 Electron 版本或图标变了。"
