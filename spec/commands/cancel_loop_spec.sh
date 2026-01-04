# spec/commands/cancel_loop_spec.sh
# cancel-loop.sh 命令的單元測試

Describe 'cancel-loop.sh command'
    setup() {
        # 設定測試環境
        ANTIGRAVITY_PROJECT_ROOT="${SHELLSPEC_TMPBASE}/test_project"
        export ANTIGRAVITY_PROJECT_ROOT
        mkdir -p "$ANTIGRAVITY_PROJECT_ROOT/.antigravity"
    }
    
    cleanup() {
        rm -rf "${SHELLSPEC_TMPBASE}/test_project"
    }
    
    create_state_file() {
        iteration="${1:-0}"
        max_iterations="${2:-10}"
        mkdir -p "$ANTIGRAVITY_PROJECT_ROOT/.antigravity"
        cat > "$ANTIGRAVITY_PROJECT_ROOT/.antigravity/for-loop-state.json" << EOF
{
    "iteration": $iteration,
    "max_iterations": $max_iterations,
    "completion_promise": "DONE",
    "original_prompt": "Test task",
    "test_command": "echo test",
    "stuck_threshold": 3,
    "stuck_count": 0,
    "last_error_hash": "",
    "branch": "",
    "started_at": "2024-01-01T00:00:00+00:00"
}
EOF
    }
    
    state_file_exists() {
        [ -f "$ANTIGRAVITY_PROJECT_ROOT/.antigravity/for-loop-state.json" ]
    }
    
    BeforeEach setup
    AfterEach cleanup
    
    Describe '取消現有迴圈'
        It '成功刪除狀態檔案'
            create_state_file 5 10
            
            When run source ./commands/cancel-loop.sh
            The status should be success
            The output should include '修復迴圈已取消'
        End
        
        It '顯示已完成的迭代次數'
            create_state_file 7 20
            
            When run source ./commands/cancel-loop.sh
            The status should be success
            The output should include '7'
        End
    End
    
    Describe '無迴圈時的行為'
        It '顯示提示訊息'
            When run source ./commands/cancel-loop.sh
            The status should be success
            The output should include '沒有進行中'
        End
    End
End
