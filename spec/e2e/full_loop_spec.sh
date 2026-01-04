# spec/e2e/full_loop_spec.sh  
# 完整迴圈流程 E2E 測試

Describe 'E2E: 完整迴圈流程'
    setup() {
        ANTIGRAVITY_PROJECT_ROOT="${SHELLSPEC_TMPBASE}/test_project"
        export ANTIGRAVITY_PROJECT_ROOT
        mkdir -p "$ANTIGRAVITY_PROJECT_ROOT/.antigravity"
    }
    
    cleanup() {
        rm -rf "${SHELLSPEC_TMPBASE}/test_project"
        unset AGENT_LAST_OUTPUT
    }
    
    create_state_file() {
        iteration="${1:-0}"
        max_iterations="${2:-10}"
        completion_promise="${3:-DONE}"
        
        mkdir -p "$ANTIGRAVITY_PROJECT_ROOT/.antigravity"
        cat > "$ANTIGRAVITY_PROJECT_ROOT/.antigravity/for-loop-state.json" << EOF
{
    "iteration": $iteration,
    "max_iterations": $max_iterations,
    "completion_promise": "$completion_promise",
    "original_prompt": "Test task",
    "test_command": "echo 'test passed'",
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
    
    Describe '啟動與取消流程'
        It '啟動後可成功取消'
            # 啟動迴圈
            source ./commands/for-loop.sh "E2E 測試" --no-branch > /dev/null 2>&1
            
            When run source ./commands/cancel-loop.sh
            The status should be success
            The output should include '修復迴圈已取消'
        End
    End
    
    Describe '迭代次數上限'
        It '達到上限後自動停止'
            create_state_file 10 10 "DONE"
            
            When run source ./hooks/on_stop.sh
            The status should be success
            The stderr should include '[for-loop]'
            The output should include '已達'
        End
    End
    
    Describe '完成標記偵測'
        It '偵測到標記後停止'
            create_state_file 3 10 "MISSION_COMPLETE"
            export AGENT_LAST_OUTPUT="All tests passed! MISSION_COMPLETE"
            
            When run source ./hooks/on_stop.sh
            The status should be success
            The stderr should include '[for-loop]'
        End
    End
End
