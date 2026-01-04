# shellcheck shell=sh
# spec/spec_helper.sh
# ShellSpec 測試輔助函數

# 專案根目錄 (使用 ShellSpec 提供的暫存目錄)
: "${SHELLSPEC_TMPBASE:=/tmp}"
ANTIGRAVITY_PROJECT_ROOT="${SHELLSPEC_TMPBASE}/test_project"
export ANTIGRAVITY_PROJECT_ROOT

# 設定測試環境
spec_helper_configure() {
    mkdir -p "$ANTIGRAVITY_PROJECT_ROOT/.antigravity"
}

# 清理測試環境
spec_helper_cleanup() {
    rm -rf "$ANTIGRAVITY_PROJECT_ROOT"
}

# 建立測試用狀態檔案
create_test_state_file() {
    iteration="${1:-0}"
    max_iterations="${2:-10}"
    completion_promise="${3:-DONE}"
    original_prompt="${4:-Test task}"
    
    mkdir -p "$ANTIGRAVITY_PROJECT_ROOT/.antigravity"
    cat > "$ANTIGRAVITY_PROJECT_ROOT/.antigravity/for-loop-state.json" << EOF
{
    "iteration": $iteration,
    "max_iterations": $max_iterations,
    "completion_promise": "$completion_promise",
    "original_prompt": "$original_prompt",
    "test_command": "echo 'test passed'",
    "stuck_threshold": 3,
    "stuck_count": 0,
    "last_error_hash": "",
    "branch": "",
    "started_at": "2024-01-01T00:00:00+00:00"
}
EOF
}

# 讀取狀態檔案的值
get_state_value() {
    key="$1"
    jq -r ".$key" "$ANTIGRAVITY_PROJECT_ROOT/.antigravity/for-loop-state.json"
}

# 檢查狀態檔案是否存在
state_file_exists() {
    [ -f "$ANTIGRAVITY_PROJECT_ROOT/.antigravity/for-loop-state.json" ]
}
