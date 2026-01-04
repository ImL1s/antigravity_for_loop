#!/usr/bin/env bash
#
# Antigravity For Loop - 取消迴圈命令
#

set -euo pipefail

# 專案根目錄
PROJECT_ROOT="${ANTIGRAVITY_PROJECT_ROOT:-.}"
STATE_FILE="$PROJECT_ROOT/.antigravity/for-loop-state.json"

# 檢查是否有進行中的迴圈
if [[ ! -f "$STATE_FILE" ]]; then
    echo "ℹ️ 目前沒有進行中的修復迴圈。"
    exit 0
fi

# 讀取狀態資訊
if command -v jq &> /dev/null; then
    iteration=$(jq -r ".iteration // 0" "$STATE_FILE")
    max_iterations=$(jq -r ".max_iterations // 0" "$STATE_FILE")
    started_at=$(jq -r ".started_at // \"unknown\"" "$STATE_FILE")
    branch=$(jq -r ".branch // \"\"" "$STATE_FILE")
else
    iteration="unknown"
    max_iterations="unknown"
    started_at="unknown"
    branch=""
fi

# 刪除狀態檔案
rm -f "$STATE_FILE"

# 輸出確認訊息
cat << EOF

🛑 **修復迴圈已取消**

📊 **執行摘要:**
- 已完成迭代: $iteration / $max_iterations
- 開始時間: $started_at
EOF

if [[ -n "$branch" ]]; then
    cat << EOF
- 工作分支: $branch

💡 **提示:** 您可以使用以下命令查看變更：
   \`git diff main..$branch\`
   
   或切換回主分支：
   \`git checkout main\`
EOF
fi

echo ""
echo "您可以隨時使用 \`/for-loop\` 啟動新的修復迴圈。"
