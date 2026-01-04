# Antigravity For Loop

🔄 自動迭代修復循環插件 - 讓 AI 代理持續執行開發任務直到通過所有測試或達到迭代上限。

## 功能特色

- **自動迴圈** - AI 自動執行「編碼 → 測試 → 修復」循環
- **Stop Hook 攔截** - 智能攔截 AI 退出，重新注入任務 prompt
- **錯誤去重** - 偵測重複錯誤，避免無效循環
- **卡住偵測** - 自動識別並停止無進展的迴圈
- **Git 分支管理** - 可選自動建立工作分支保護主線代碼
- **完成標記** - 支援自定義完成標記字串

## 安裝

```bash
# 在 Antigravity IDE 中安裝
/plugin install antigravity_for_loop
```

或手動安裝：

```bash
git clone https://github.com/antigravity/antigravity_for_loop.git
cd antigravity_for_loop
# 將此目錄添加到 Antigravity 插件路徑
```

## 使用方式

### 啟動修復迴圈

```bash
/for-loop "<任務描述>" [選項]
```

**選項：**

| 選項 | 預設值 | 說明 |
|------|--------|------|
| `--max-iterations N` | 10 | 最大迭代次數 |
| `--completion "<標記>"` | DONE | 完成標記字串 |
| `--test-command "<cmd>"` | npm test | 測試命令 |
| `--stuck-threshold N` | 3 | 卡住偵測閾值 |
| `--no-branch` | - | 不自動建立 Git 分支 |

### 範例

```bash
# 基本使用
/for-loop "修復所有 ESLint 警告"

# 自定義迭代次數和完成標記
/for-loop "實作使用者登入功能" --max-iterations 20 --completion "ALL_TESTS_PASSED"

# 使用 pytest 作為測試命令
/for-loop "將所有測試遷移到 pytest" --test-command "pytest -v" --max-iterations 30

# 不建立 Git 分支
/for-loop "修復 TypeScript 類型錯誤" --no-branch
```

### 取消迴圈

```bash
/cancel-loop
```

## 目錄結構

```
antigravity_for_loop/
├── plugin.json              # 插件清單
├── README.md                # 本文件
├── hooks/
│   └── on_stop.sh          # Stop Hook 腳本
├── commands/
│   ├── for-loop.sh         # 啟動迴圈命令
│   └── cancel-loop.sh      # 取消迴圈命令
└── skills/
    └── antigravity-for-loop/
        └── SKILL.md        # AI 迭代開發指南
```

## 工作原理

1. **啟動** - 使用者執行 `/for-loop` 命令，插件建立狀態檔案
2. **執行** - AI 代理開始執行任務，編寫/修改代碼
3. **攔截** - 當 AI 嘗試結束時，Stop Hook 被觸發
4. **檢查** - Hook 腳本執行測試，檢查停止條件
5. **決策** - 若未完成則阻止退出，重新注入 prompt 進入下一迭代
6. **迴圈** - 步驟 2-5 重複直到任務完成或達到上限

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  啟動迴圈   │ ──▶ │  AI 執行    │ ──▶ │ Stop Hook  │
└─────────────┘     └─────────────┘     └──────┬──────┘
                           ▲                    │
                           │            ┌───────▼───────┐
                           │            │  檢查條件     │
                           │            └───────┬───────┘
                           │                    │
                    ┌──────┴──────┐      ┌──────▼──────┐
                    │ 重注入 Prompt │◀─── │  未完成?    │
                    └─────────────┘      └──────┬──────┘
                                                │ 完成
                                         ┌──────▼──────┐
                                         │  結束迴圈   │
                                         └─────────────┘
```

## 配置選項

在 `plugin.json` 中可以調整以下預設值：

```json
{
  "configuration": {
    "defaultMaxIterations": 10,
    "autoCreateBranch": true,
    "testCommand": "npm test",
    "stuckDetectionThreshold": 3
  }
}
```

## 安全注意事項

⚠️ **重要提醒：**

- 建議將終端執行權限設為 **Auto** 模式
- 插件不會繞過 Antigravity 的內建安全機制
- 高風險操作仍會請求使用者確認
- 建議在使用前提交當前工作，以便需要時回滾

## 依賴

- `jq` - JSON 處理工具 (必須)
- `git` - 版本控制 (可選，用於分支管理)

## 授權

MIT License

## 貢獻

歡迎提交 Issue 和 Pull Request！
