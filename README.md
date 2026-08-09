# Antigravity For Loop

> **⚠️ SUPERSEDED — archived 2026-08**
>
> This extension's purpose is now natively covered by newer tooling, so the repo is archived as a historical reference:
>
> - **Google Antigravity native hooks** (Stop-condition hooks + forced continuation, shipped in Antigravity 2.0 / CLI 1.1.x, May–Jul 2026) — the same "keep working until tests pass" loop without CDP / DOM automation.
> - **[oh-my-agy](https://github.com/ImL1s/oh-my-agy) v0.5** — your Antigravity plugin implementing the Ralph Loop natively in-session (`/oh-my-agy:ralph`, plus `ultrawork` / `ultraqa` / `verify` gates).
> - **Claude Code's [ralph-wiggum](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum) plugin** — the original inspiration, still maintained.
>
> The CDP mechanism this extension relied on (driving the Antigravity IDE Agent Manager webview) targets a UI surface Google announced removing from the IDE (Antigravity 2.0 launch, 2026-05-19). The script-driven loop (`commands/*.sh` + `.agent/workflows/for-loop.md`) remains usable as-is for Antigravity IDE agent workflows.

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
- **Smart Detection** - Auto-detect test commands for 25+ languages
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
| `Cmd+Alt+Shift+C` | Copy Continuation Prompt |

### Completion Conditions

| Option | Description |
|--------|-------------|
| **Tests Pass** | Auto-detect test command, stop on exit code 0 |
| **Build Succeeds** | Stop when build completes successfully |
| **AI Self-Judgment** | Stop when AI outputs "DONE" |
| **Custom Command** | Enter a custom validation command |

## Supported Languages (Auto-Detection)

The extension automatically detects test commands for 25+ languages and build systems:

| Category | Languages/Frameworks |
|----------|---------------------|
| **JavaScript** | npm, Deno, Bun |
| **Python** | pytest, tox, mypy |
| **Systems** | Rust (cargo), Go, Zig, Nim, V |
| **JVM** | Java/Kotlin (Maven, Gradle), Scala (sbt), Clojure (lein) |
| **Functional** | Haskell (stack, cabal), Elixir (mix), Erlang (rebar3), OCaml (dune) |
| **Mobile** | Swift, Dart/Flutter |
| **Web** | Ruby (rspec), PHP (phpunit), .NET (dotnet) |
| **C/C++** | CMake, Meson, Conan |
| **Build Systems** | Make, Just, Task, Bazel, Pants, Earthly |

## Testing

```bash
# Run all unit tests (CI/CD compatible)
npm test

# Run specific test suites
npm run test:unit:ralph    # RalphLoop tests
npm run test:unit:cdp      # CDPManager tests
npm run test:unit:state    # State parser tests
npm run test:unit:detect   # Test command detection

# Run CDP E2E tests (local only, requires Antigravity IDE)
npm run test:e2e:cdp
```

### Test Coverage

| Test Suite | Tests | CI/CD | Description |
|------------|-------|-------|-------------|
| `ralphLoop.test.js` | 37 | ✅ | Loop logic, prompt building, callbacks |
| `cdpManager.test.js` | 29 | ✅ | CDP connection, helper script validation |
| `stateParser.test.js` | 14 | ✅ | State parsing, status bar text |
| `detectTestCommand.test.js` | 11 | ✅ | Test command detection for core languages |
| `cdp-ralph-loop.e2e.js` | 16 | ❌ | Real CDP E2E (requires Antigravity IDE) |

**Total: 91 unit tests + 16 E2E tests = 107 tests**

### Running CDP E2E Tests

These tests require a real Antigravity IDE instance:

```bash
# 1. Start Antigravity with CDP enabled
open -a "Antigravity.app" --args --remote-debugging-port=9000

# 2. Open the Agent Panel in Antigravity

# 3. Run E2E tests
npm run test:e2e:cdp
```

## Directory Structure

```
antigravity_for_loop/
├── extension.js              # VSCode extension entry point
├── package.json              # Extension manifest & scripts
├── lib/
│   ├── cdp-manager.js        # CDP connection & DOM injection
│   ├── ralph-loop.js         # Ralph Loop core logic
│   └── relauncher.js         # CDP restart helper
├── test/
│   ├── unit/                 # Unit tests (CI/CD compatible)
│   │   ├── ralphLoop.test.js
│   │   ├── cdpManager.test.js
│   │   ├── stateParser.test.js
│   │   └── detectTestCommand.test.js
│   ├── e2e/                  # E2E tests (local only)
│   │   └── cdp-ralph-loop.e2e.js
│   └── integration/          # VSCode integration tests
│       └── extension.test.js
├── assets/
│   └── icon.png
└── README.md
```

## Technical Details

### CDP Architecture

The extension uses Chrome DevTools Protocol to interact with Antigravity's webview:

1. **Connect** to CDP on port 9000 (scans 9000-9003)
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
    getAIStatus()        // Get AI response status
}
```

### Ralph Loop Lifecycle

```
1. Start Loop
   └─> Connect to CDP
   └─> Inject helper script
   └─> Start auto-accept interval

2. Each Iteration
   └─> Build prompt with context
   └─> Inject prompt into Lexical editor
   └─> Submit prompt
   └─> Wait for AI completion
   └─> Run test command
   └─> Check success/failure

3. Completion
   └─> Tests pass (exit 0) → SUCCESS
   └─> AI says "DONE" → SUCCESS
   └─> Max iterations reached → FAILURE
   └─> User cancels → CANCELLED
```

## Security Notes

- Recommend `git commit` before using
- Use `maxIterations` to limit iterations (default: 10)
- Manually confirm high-risk operations (e.g., file deletion)
- CDP requires port 9000, ensure no conflicts

## License

MIT License

---

**Made for Google Antigravity IDE**

*Inspired by [Claude Code Ralph Wiggum](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum)*
