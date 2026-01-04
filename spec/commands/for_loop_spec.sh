# spec/commands/for_loop_spec.sh
# for-loop.sh 命令的單元測試

Describe 'for-loop.sh command'
    setup() {
        ANTIGRAVITY_PROJECT_ROOT="${SHELLSPEC_TMPBASE}/test_project"
        export ANTIGRAVITY_PROJECT_ROOT
        mkdir -p "$ANTIGRAVITY_PROJECT_ROOT/.antigravity"
    }
    
    cleanup() {
        rm -rf "${SHELLSPEC_TMPBASE}/test_project"
    }
    
    state_file_exists() {
        [ -f "$ANTIGRAVITY_PROJECT_ROOT/.antigravity/for-loop-state.json" ]
    }
    
    get_state_value() {
        jq -r ".$1" "$ANTIGRAVITY_PROJECT_ROOT/.antigravity/for-loop-state.json"
    }
    
    create_existing_state() {
        mkdir -p "$ANTIGRAVITY_PROJECT_ROOT/.antigravity"
        echo '{"iteration": 5}' > "$ANTIGRAVITY_PROJECT_ROOT/.antigravity/for-loop-state.json"
    }
    
    BeforeEach setup
    AfterEach cleanup
    
    Describe '參數解析'
        It '無參數時顯示使用說明'
            When run source ./commands/for-loop.sh
            The status should be failure
            The output should include '用法:'
        End
        
        It '解析 --max-iterations 參數'
            # 模擬 git 命令避免真實操作
            git() { echo "mocked"; }
            
            When run source ./commands/for-loop.sh "測試任務" --max-iterations 20 --no-branch
            The status should be success
            The output should include '最大迭代次數: 20'
        End
        
        It '解析 --completion 參數'
            git() { echo "mocked"; }
            
            When run source ./commands/for-loop.sh "測試任務" --completion "ALL_DONE" --no-branch
            The status should be success
            The output should include '完成標記: ALL_DONE'
        End
    End
    
    Describe '狀態檔案管理'
        It '建立狀態檔案'
            When run source ./commands/for-loop.sh "測試任務" --no-branch
            The status should be success
            The output should include '自動修復迴圈已啟動'
        End
        
        It '已有迴圈時拒絕啟動新迴圈'
            create_existing_state
            
            When run source ./commands/for-loop.sh "新任務" --no-branch
            The status should be failure
            The stderr should include '已有進行中的迴圈'
        End
    End
End
