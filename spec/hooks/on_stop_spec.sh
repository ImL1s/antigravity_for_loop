# spec/hooks/on_stop_spec.sh
# on_stop.sh Hook 的單元測試 - 針對 Antigravity 插件核心功能

Describe 'on_stop.sh hook'
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
    "original_prompt": "Test task: fix all bugs",
    "test_command": "echo 'All tests passed'",
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
    
    # =============================================
    # 核心功能 1: 無迴圈時直接放行
    # =============================================
    Describe '無迴圈時的行為'
        It '沒有狀態檔案時直接退出 (exit 0)'
            When run source ./hooks/on_stop.sh
            The status should eq 0
        End
    End
    
    # =============================================
    # 核心功能 2: 最大迭代次數檢查
    # =============================================
    Describe '最大迭代次數限制'
        It '達到最大迭代次數時允許退出'
            create_state_file 10 10 "DONE"
            
            When run source ./hooks/on_stop.sh
            The status should eq 0
        End
        
        It '輸出包含 decision: allow'
            create_state_file 10 10 "DONE"
            
            When run source ./hooks/on_stop.sh
            The output should include 'allow'
        End
    End
    
    # =============================================
    # 核心功能 3: 完成標記偵測
    # =============================================
    Describe '完成標記偵測'
        It '偵測到完成標記時允許退出'
            create_state_file 3 10 "MISSION_COMPLETE"
            export AGENT_LAST_OUTPUT="All tests passed! MISSION_COMPLETE"
            
            When run source ./hooks/on_stop.sh
            The status should eq 0
            The stderr should include '[for-loop]'
        End
    End
    
    # =============================================
    # 核心功能 4: 測試通過偵測
    # =============================================
    Describe '測試通過偵測'
        It '測試命令成功時停止迴圈'
            create_state_file 2 10 "DONE"
            
            When run source ./hooks/on_stop.sh
            The status should eq 0
            The stderr should include '[for-loop]'
        End
    End
End
