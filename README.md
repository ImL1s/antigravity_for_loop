# Antigravity For Loop

🔄 **Ralph Loop for Antigravity** - 讓 AI 代理持續執行開發任務直到通過所有測試或達到迭代上限。

靈感來自 Claude Code 的 [Ralph Wiggum](https://awesomeclaude.ai/ralph-wiggum) 技術，專為 **Google Antigravity IDE** 重新設計。

## 功能特色

- **🔁 Ralph Loop** - 自動迴圈：注入 Prompt → 等待 AI → 執行測試 → 重複
- **✅ Auto-Accept** - 自動接受 agent 步驟，無需手動確認
- **🔍 智能偵測** - 自動偵測 20+ 種語言/框架的測試命令
- **📊 即時進度** - 狀態欄顯示當前迭代進度
- **🛡️ 安全限制** - `--max-iterations` 防止無限迴圈

## 核心機制：Ralph Loop

```
┌──────────────────────────────────────────────────────────────┐
│                    RALPH LOOP FOR ANTIGRAVITY                 │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────┐      ┌──────────────┐      ┌───────────┐  │
│   │   Inject    │─────▶│   Submit +   │─────▶│  Wait for │  │
│   │   Prompt    │      │  Auto-Accept │      │ AI Complete│  │
│   └─────────────┘      └──────────────┘      └─────┬─────┘  │
│          ▲                                         │        │
│          │         ┌───────────────────────────────▼────┐   │
│          │         │      Check Completion              │   │
│          │         │  • Test command exit code == 0?    │   │
│          │         │  • AI output contains "DONE"?      │   │
│          │         └─────────────────┬──────────────────┘   │
│          │                           │                      │
│          │      NO ┌─────────────────┴────────────┐ YES     │
│          └────────│  iteration < max_iterations? │────▶ DONE│
│                   └──────────────────────────────┘         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**vs Claude Code Ralph Wiggum:**

| 面向 | Claude Code | Antigravity For Loop |
|------|-------------|---------------------|
| 介面 | CLI | GUI (VSCode-like) |
| 迴圈機制 | Bash loop + Stop hook | CDP + setInterval |
| Prompt 注入 | pipe to CLI | CDP 操作 Lexical Editor |
| 完成檢測 | String match | Test exit code / "DONE" |

## 支援語言 (自動偵測)

| 語言/框架 | 偵測檔案 | 測試命令 |
|-----------|---------|---------|
| JavaScript/TypeScript | package.json | `npm test` |
| Python | pyproject.toml, requirements.txt | `pytest` |
| Rust | Cargo.toml | `cargo test` |
| Go | go.mod | `go test ./...` |
| Java/Kotlin | pom.xml, build.gradle | `mvn test`, `./gradlew test` |
| Ruby | Gemfile | `bundle exec rspec` |
| .NET/C# | *.csproj, *.sln | `dotnet test` |
| PHP | composer.json | `./vendor/bin/phpunit` |
| Swift | Package.swift | `swift test` |
| Dart/Flutter | pubspec.yaml | `dart test`, `flutter test` |
| Elixir | mix.exs | `mix test` |
| Haskell | stack.yaml | `stack test` |
| Scala | build.sbt | `sbt test` |
| C/C++ | CMakeLists.txt | `cmake && ctest` |
| Zig | build.zig | `zig build test` |
| ... | 更多 | 自動偵測 |

## 安裝

```bash
# 打包擴展
npm run package

# 在 Antigravity IDE 中安裝
code --install-extension antigravity-for-loop-*.vsix
```

## CDP 設置（必須！）

Antigravity 需要啟用 CDP (Chrome DevTools Protocol) 才能讓插件運作。

### 自動設置（推薦）

1. 安裝擴展後，會自動顯示提示
2. 點擊 **「Enable CDP」**
3. 按照指示重啟 Antigravity

### 手動設置

**macOS:**
```bash
open -a "Antigravity.app" --args --remote-debugging-port=9000
```

**Windows:**
```
在捷徑目標欄位末尾加上：--remote-debugging-port=9000
```

**Linux:**
```bash
antigravity --remote-debugging-port=9000
```

## 使用方式

### 快速開始

1. 點擊狀態欄的 **「For Loop」** 按鈕
2. 選擇 **「Start Ralph Loop...」**
3. 輸入任務描述（例如：「修復所有 TypeScript 錯誤」）
4. 選擇完成條件（測試通過 / Build 成功 / AI 自行判斷）
5. 選擇最大迭代次數
6. 開始！

### 快捷鍵

| 快捷鍵 | 功能 |
|--------|------|
| `Cmd+Alt+Shift+L` | 開啟選單 |
| `Cmd+Alt+Shift+A` | 切換 Auto-Accept |

### 完成條件

| 選項 | 說明 |
|------|------|
| **測試通過** | 自動偵測測試命令，exit code 0 時停止 |
| **Build 成功** | 編譯成功時停止 |
| **AI 自行判斷** | AI 輸出 "DONE" 時停止 |
| **自訂命令** | 手動輸入驗證命令 |

## 目錄結構

```
antigravity_for_loop/
├── extension.js           # VSCode 擴展主程式
├── package.json           # 擴展清單
├── lib/
│   ├── cdp-manager.js     # CDP 連線管理
│   ├── ralph-loop.js      # Ralph Loop 核心迴圈
│   └── relauncher.js      # CDP 重啟輔助
└── README.md
```

## 技術參考

### 靈感來源

- [Ralph Wiggum](https://awesomeclaude.ai/ralph-wiggum) - Claude Code 的自動迴圈技術
- [Claude Code Hooks](https://docs.anthropic.com/claude-code/hooks) - Anthropic 官方 Hook 機制
- [antigravity-auto-accept](https://github.com/pesoszpesosz/antigravity-auto-accept) - Auto-accept 參考實作

### Antigravity 內部機制

本插件使用 CDP (Chrome DevTools Protocol) 與 Antigravity 的 webview 互動：

- 聊天面板在 iframe `antigravity.agentPanel` 中
- 編輯器使用 Lexical (`[data-lexical-editor="true"]`)
- 文字注入使用 `execCommand('insertText')`
- Accept 按鈕透過 DOM 查詢和點擊

## 安全注意事項

⚠️ **重要提醒：**

- 建議在使用前 `git commit` 當前工作
- 使用 `--max-iterations` 限制迭代次數
- 高風險操作（如刪除文件）請手動確認
- CDP 需要 port 9000，確保沒有衝突

## 授權

MIT License

---

**Made for Google Antigravity IDE** 🚀

*Inspired by Claude Code's Ralph Wiggum technique*
