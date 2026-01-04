#!/usr/bin/env bash
#
# Antigravity For Loop - Stop Hook
# 當 AI 代理嘗試結束時觸發，決定是否繼續迴圈或允許退出
#

set -euo pipefail

# 狀態檔案路徑
STATE_FILE="${ANTIGRAVITY_PROJECT_ROOT:-.}/.antigravity/for-loop-state.json"

# 日誌函數 (輸出到 stderr，不影響 AI 對話)
log() {
    echo "[for-loop] $*" >&2
}

# 如果沒有活動的迴圈，允許正常退出
if [[ ! -f "$STATE_FILE" ]]; then
    exit 0
fi

log "Stop Hook 觸發，檢查迴圈狀態..."

# 讀取狀態 (使用 jq 解析 JSON)
if ! command -v jq &> /dev/null; then
    log "錯誤: 需要安裝 jq 來解析 JSON"
    exit 1
fi

iteration=$(jq -r ".iteration // 0" "$STATE_FILE")
max_iterations=$(jq -r ".max_iterations // 10" "$STATE_FILE")
completion_promise=$(jq -r ".completion_promise // \"\"" "$STATE_FILE")
original_prompt=$(jq -r ".original_prompt // \"\"" "$STATE_FILE")
test_command=$(jq -r ".test_command // \"npm test\"" "$STATE_FILE")
last_error_hash=$(jq -r ".last_error_hash // \"\"" "$STATE_FILE")
stuck_count=$(jq -r ".stuck_count // 0" "$STATE_FILE")
stuck_threshold=$(jq -r ".stuck_threshold // 3" "$STATE_FILE")

log "當前迭代: $iteration / $max_iterations"

# ============================================
# 檢查停止條件
# ============================================

# 1. 檢查完成標記
if [[ -n "$completion_promise" && -n "${AGENT_LAST_OUTPUT:-}" ]]; then
    if echo "$AGENT_LAST_OUTPUT" | grep -q "$completion_promise"; then
        log "✅ 偵測到完成標記: $completion_promise"
        rm -f "$STATE_FILE"
        exit 0
    fi
fi

# 2. 檢查是否達到最大迭代次數
if (( iteration >= max_iterations )); then
    log "⚠️ 已達迴圈上限 (iteration=$iteration)，停止迴圈"
    
    # 輸出最終報告
    cat << EOF
{
    "outcome": { "decision": "allow" },
    "message": "已達到最大迭代次數 ($max_iterations)。迴圈已停止。請檢查未完成的任務並手動處理。"
}
EOF
    rm -f "$STATE_FILE"
    exit 0
fi

# ============================================
# 執行測試並收集錯誤資訊
# ============================================

log "執行測試命令: $test_command"

# 捕獲測試輸出
test_output=""
test_exit_code=0
if test_output=$(eval "$test_command" 2>&1); then
    test_exit_code=0
else
    test_exit_code=$?
fi

# 檢查測試是否通過
if [[ $test_exit_code -eq 0 ]]; then
    if echo "$test_output" | grep -qiE "(passed|success|ok|✓)"; then
        log "✅ 所有測試通過！"
        rm -f "$STATE_FILE"
        exit 0
    fi
fi

# ============================================
# 錯誤去重與卡住檢測
# ============================================

# 計算當前錯誤的 hash
current_error_hash=$(echo "$test_output" | grep -iE "(fail|error|exception)" | head -10 | md5sum | cut -d' ' -f1)

if [[ "$current_error_hash" == "$last_error_hash" ]]; then
    stuck_count=$((stuck_count + 1))
    log "⚠️ 偵測到重複錯誤 (stuck_count=$stuck_count)"
    
    if (( stuck_count >= stuck_threshold )); then
        log "🛑 迴圈疑似卡住，停止並請求人工協助"
        cat << EOF
{
    "outcome": { "decision": "allow" },
    "message": "⚠️ 迴圈疑似卡住：連續 $stuck_count 次出現相同錯誤。請人工檢查並調整策略。"
}
EOF
        rm -f "$STATE_FILE"
        exit 0
    fi
else
    stuck_count=0
fi

# ============================================
# 準備下一輪迭代
# ============================================

next_iteration=$((iteration + 1))

# 提取錯誤摘要 (最多 10 行)
error_summary=$(echo "$test_output" | grep -iE "(fail|error|exception|assert)" | head -10 | sed 's/"/\\"/g' | tr '\n' ' ')

# 更新狀態檔案
jq --argjson iter "$next_iteration" \
   --arg hash "$current_error_hash" \
   --argjson stuck "$stuck_count" \
   '.iteration = $iter | .last_error_hash = $hash | .stuck_count = $stuck' \
   "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"

log "準備進入迭代 $next_iteration..."

# ============================================
# 輸出阻斷 JSON，重新注入 prompt
# ============================================

# 構造下一輪的使用者訊息
user_message="【迭代 $next_iteration / $max_iterations】

上一輪測試未通過。錯誤摘要：
\`\`\`
$error_summary
\`\`\`

請根據以上錯誤修正代碼。原始任務要求：

$original_prompt

完成後請確保所有測試通過，並在最終回答中包含完成標記。"

# 輸出 JSON 阻斷退出並注入新訊息
jq -n \
    --arg msg "$user_message" \
    '{
        "outcome": { "decision": "block" },
        "userMessage": $msg
    }'

# 以 exit code 2 結束表示阻斷
exit 2
