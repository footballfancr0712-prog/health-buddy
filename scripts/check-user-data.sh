#!/usr/bin/env bash
# 检查用户真实记录里有没有测试数据残留
#   用法：./scripts/check-user-data.sh
#   退出码：0 = 干净；1 = 发现可疑行（必须立刻清理）
set -uo pipefail

# 默认检查桌面上的记录文件；可用 HB_CSV 指定其他路径
: "${USERPROFILE:=${HOME:-.}}"
CSV="${HB_CSV:-$USERPROFILE/Desktop/健康Buddy-我的记录.csv}"

if [ ! -f "$CSV" ]; then
  echo "✗ 找不到记录文件：$CSV"
  exit 2
fi

rows=$(grep -c '^2026-' "$CSV" || true)
last=$(grep -o '^2026-[0-9-]*' "$CSV" | tail -1)
printf "文件：%s\n" "$CSV"
printf "数据行：%s 条，最后一条：%s\n" "$rows" "$last"

bad=0

# 1) 显式测试标记
hit=$(grep -n '__TEST__' "$CSV" || true)
if [ -n "$hit" ]; then
  echo "✗ 发现 __TEST__ 标记行："; echo "$hit" | cut -c1-120; bad=1
fi

# 2) 历史夹具里的字面量备注「测试」
hit=$(grep -n '测试' "$CSV" || true)
if [ -n "$hit" ]; then
  echo "✗ 备注里出现「测试」："; echo "$hit" | cut -c1-120; bad=1
fi

# 3) 夹具特征：00:30 / 07:55 / 7.4 / 1600 / 30 同时出现在一行
hit=$(awk -F, '/^2026-/ && $2=="00:30" && $3=="07:55" && $4=="7.4" && $7=="1600" && $6=="30" {print NR": "$0}' "$CSV")
if [ -n "$hit" ]; then
  echo "✗ 命中测试夹具特征（00:30/07:55/7.4/30min/1600ml）："; echo "$hit" | cut -c1-120; bad=1
fi

# 4) 未来日期（正常不该有）
future=$(grep -o '^2026-[0-9-]*' "$CSV" | awk -v t="$(date +%Y-%m-%d)" '$0 > t')
if [ -n "$future" ]; then
  echo "✗ 存在未来日期："; echo "$future"; bad=1
fi

if [ "$bad" -eq 0 ]; then
  echo "✓ 干净：没有测试标记、没有夹具特征、没有未来日期"
  exit 0
fi
echo "→ 请立刻清理（先备份，再按日期删行），并清空 %APPDATA%/健康Buddy/Local Storage"
exit 1
