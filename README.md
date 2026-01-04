# Antigravity For Loop

**Ralph Loop for Antigravity** - Autonomous AI development loop that keeps the AI agent working until tests pass or max iterations reached.

Inspired by Claude Code's [Ralph Wiggum](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum) plugin, redesigned for **Google Antigravity IDE**.

## How It Works

```
┌──────────────────────────────────────────────────────────────┐
│                    RALPH LOOP FOR ANTIGRAVITY                │
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

## vs Claude Code Ralph Wiggum

| Aspect | Claude Code | Antigravity For Loop |
|--------|-------------|---------------------|
| Interface | CLI | GUI (VSCode-like) |
| Loop Mechanism | Stop Hook intercepts exit | CDP + setInterval |
| Prompt Injection | Hook re-injects prompt | CDP → Lexical Editor |
| Completion Detection | Hook exit code 2 | Test exit code 0 / "DONE" |
| Auto-Accept | Not needed (CLI) | CDP clicks Accept buttons |

## Features

- **Ralph Loop** - Inject Prompt → Wait for AI → Run Tests → Repeat
- **Auto-Accept** - Automatically click Accept/Run buttons via CDP
- **Smart Detection** - Auto-detect test commands for 20+ languages
- **Real-time Progress** - Status bar shows iteration progress
- **Safety Limits** - `maxIterations` prevents infinite loops

## Installation

```bash
# Package the extension
npm run package

# Install in Antigravity IDE
code --install-extension antigravity-for-loop-*.vsix
```

## CDP Setup (Required)

Antigravity must have CDP (Chrome DevTools Protocol) enabled for the extension to work.

### Automatic Setup (Recommended)

1. After installing the extension, a prompt will appear
2. Click **"Enable CDP"**
3. Follow instructions to restart Antigravity

### Manual Setup

**macOS:**
```bash
open -a "Antigravity.app" --args --remote-debugging-port=9000
```

**Windows:**
```
Add to shortcut target: --remote-debugging-port=9000
```

**Linux:**
```bash
antigravity --remote-debugging-port=9000
```

## Usage

### Quick Start

1. Click **"For Loop"** button in the status bar
2. Select **"Start Ralph Loop..."**
3. Enter task description (e.g., "Fix all TypeScript errors")
4. Select completion condition (Tests Pass / Build Succeeds / AI Self-Judgment)
5. Select maximum iterations
6. Go!

### Keyboard Shortcuts

| Shortcut | Function |
|----------|----------|
| `Cmd+Alt+Shift+L` | Open menu |
| `Cmd+Alt+Shift+A` | Toggle Auto-Accept |

### Completion Conditions

| Option | Description |
|--------|-------------|
| **Tests Pass** | Auto-detect test command, stop on exit code 0 |
| **Build Succeeds** | Stop when build completes successfully |
| **AI Self-Judgment** | Stop when AI outputs "DONE" |
| **Custom Command** | Enter a custom validation command |

## Supported Languages (Auto-Detection)

| Language/Framework | Detection File | Test Command |
|-------------------|----------------|--------------|
| JavaScript/TypeScript | package.json | `npm test` |
| Python | pyproject.toml | `pytest` |
| Rust | Cargo.toml | `cargo test` |
| Go | go.mod | `go test ./...` |
| Java/Kotlin | pom.xml, build.gradle | `mvn test`, `./gradlew test` |
| Ruby | Gemfile | `bundle exec rspec` |
| .NET/C# | *.csproj | `dotnet test` |
| PHP | composer.json | `./vendor/bin/phpunit` |
| Swift | Package.swift | `swift test` |
| Dart/Flutter | pubspec.yaml | `dart test`, `flutter test` |
| Elixir | mix.exs | `mix test` |
| Haskell | stack.yaml | `stack test` |
| Scala | build.sbt | `sbt test` |
| C/C++ | CMakeLists.txt | `cmake && ctest` |
| Zig | build.zig | `zig build test` |

## Testing

```bash
# Run unit tests (CI/CD compatible)
npm test

# Run specific test suites
npm run test:unit:ralph    # RalphLoop tests
npm run test:unit:cdp      # CDPManager tests
npm run test:unit:state    # State parser tests

# Run CDP E2E tests (local only, requires Antigravity IDE)
npm run test:e2e:cdp
```

### Test Coverage

| Test Suite | Tests | CI/CD | Description |
|------------|-------|-------|-------------|
| `ralphLoop.test.js` | 35 | ✅ | Loop logic, prompt building, callbacks |
| `cdpManager.test.js` | 29 | ✅ | CDP connection, helper script validation |
| `stateParser.test.js` | 14 | ✅ | State parsing, status bar text |
| `cdp-ralph-loop.e2e.js` | 15 | ❌ | Real CDP E2E (requires Antigravity) |

## Directory Structure

```
antigravity_for_loop/
├── extension.js           # VSCode extension main
├── package.json           # Extension manifest
├── lib/
│   ├── cdp-manager.js     # CDP connection & injection
│   ├── ralph-loop.js      # Ralph Loop core
│   └── relauncher.js      # CDP restart helper
├── test/
│   ├── unit/              # Unit tests (CI/CD)
│   │   ├── ralphLoop.test.js
│   │   ├── cdpManager.test.js
│   │   └── stateParser.test.js
│   └── e2e/               # E2E tests (local only)
│       └── cdp-ralph-loop.e2e.js
└── README.md
```

## Technical Details

### CDP Architecture

The extension uses Chrome DevTools Protocol to interact with Antigravity's webview:

1. **Connect** to CDP on port 9000 (configurable 9000-9003)
2. **Find** the `antigravity.agentPanel` iframe
3. **Locate** the Lexical editor (`[data-lexical-editor="true"]`)
4. **Inject** text using `execCommand('insertText')`
5. **Click** Submit and Accept buttons via DOM queries

### Helper Script Functions

```javascript
window.__antigravityForLoop = {
    findChatInput()      // Find Lexical editor in iframe
    findSubmitButton()   // Find Submit button
    injectPrompt(text)   // Inject text into editor
    submitPrompt()       // Click Submit or press Enter
    isAcceptButton(el)   // Check if element is Accept button
    clickAcceptButtons() // Click all Accept buttons
}
```

## Security Notes

- Recommend `git commit` before using
- Use `maxIterations` to limit iterations
- Manually confirm high-risk operations (e.g., file deletion)
- CDP requires port 9000, ensure no conflicts

## License

MIT License

---

**Made for Google Antigravity IDE**

*Inspired by [Claude Code Ralph Wiggum](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum)*
