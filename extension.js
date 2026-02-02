// Antigravity For Loop Extension
// VSCode Extension with Auto-Accept, Status Bar, Quick Pick Menu, and Output Channel
//
// Key Features:
// 1. Auto-Accept: Automatically approve agent steps using Antigravity commands
// 2. Continuation Enforcer: Monitor test results and force AI to continue
// 3. Clipboard Integration: Copy continuation prompts for manual injection
//
// Key Antigravity Commands Used:
// - antigravity.agent.acceptAgentStep: Accept pending agent steps
// - antigravity.terminal.accept: Accept terminal command requests

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { CDPManager } = require('./lib/cdp-manager');
const { Relauncher } = require('./lib/relauncher');
const { RalphLoop } = require('./lib/ralph-loop');

// Global state
let statusBarItem;
let outputChannel;
let statePollingInterval;
let autoAcceptInterval;
let continuationCheckInterval;
let currentRalphLoop = null;  // Active Ralph Loop instance
let currentState = null;
let autoAcceptEnabled = false;
let lastCheckResult = null;
let continuationEnforcerEnabled = true;
let cdpManager = null;
let relauncher = null;

// Continuation Prompt Template
const CONTINUATION_PROMPT_TEMPLATE = `[SYSTEM - LOOP CONTINUATION REQUIRED - ITERATION {{ITERATION}}/{{MAX}}]

⚠️ The test has NOT passed yet. You MUST continue working.

IMPORTANT RULES:
1. DO NOT stop - the task is NOT complete
2. Review your previous changes
3. Fix the remaining issues
4. After making changes, run: bash ./commands/check-completion.sh
5. Only stop when you see "DONE" output

Current Task: {{TASK}}
Test Command: {{TEST_CMD}}
Last Error: {{ERROR}}

Continue fixing the code now. Do not ask for permission.`;

/**
 * Get the state file path
 */
function getStateFilePath() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return null;
    }
    return path.join(workspaceFolders[0].uri.fsPath, '.antigravity', 'for-loop-state.json');
}

/**
 * Read the current loop state
 */
function readState() {
    const stateFile = getStateFilePath();
    if (!stateFile || !fs.existsSync(stateFile)) {
        return null;
    }
    try {
        const content = fs.readFileSync(stateFile, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        outputChannel.appendLine(`[Error] Failed to read state: ${error.message}`);
        return null;
    }
}

/**
 * Start auto-accept loop using CDP to click accept buttons
 * This connects to Antigravity's webview and clicks Accept/Run buttons
 * every 500ms to automatically approve agent actions
 *
 * Based on auto-accept-agent implementation which uses CDP DOM manipulation
 */
function startAutoAcceptLoop() {
    if (autoAcceptInterval) {
        clearInterval(autoAcceptInterval);
    }

    let cdpAvailable = false;
    let lastClickCount = 0;

    autoAcceptInterval = setInterval(async () => {
        if (!autoAcceptEnabled) return;

        // Method 1: CDP button clicking (preferred - like auto-accept-agent)
        if (cdpManager) {
            try {
                const result = await cdpManager.clickAcceptButtons();

                if (result.error && !cdpAvailable) {
                    // First time failure - log once
                    outputChannel.appendLine(`[Auto-Accept] CDP not available: ${result.error}`);
                    outputChannel.appendLine('[Auto-Accept] Will retry CDP connection...');
                }

                if (result.clicked > 0 && result.clicked !== lastClickCount) {
                    outputChannel.appendLine(`[Auto-Accept] Clicked ${result.clicked} accept button(s)`);
                    lastClickCount = result.clicked;
                }

                cdpAvailable = !result.error;
                if (cdpAvailable) return; // Success, don't try fallback
            } catch (e) {
                // CDP failed, will try fallback
            }
        }

        // Method 2: Fallback to VSCode commands (may or may not exist)
        try {
            await vscode.commands.executeCommand('antigravity.agent.acceptAgentStep');
        } catch (e) {
            // Silent failure - command may not exist
        }

        try {
            await vscode.commands.executeCommand('antigravity.terminal.accept');
        } catch (e) {
            // Silent failure
        }
    }, 500);

    outputChannel.appendLine('[Auto-Accept] Started - using CDP to click accept buttons every 500ms');
}

/**
 * Stop auto-accept loop
 */
function stopAutoAcceptLoop() {
    if (autoAcceptInterval) {
        clearInterval(autoAcceptInterval);
        autoAcceptInterval = null;
    }
    outputChannel.appendLine('[Auto-Accept] Stopped');
}

/**
 * Toggle auto-accept on/off
 */
function toggleAutoAccept() {
    autoAcceptEnabled = !autoAcceptEnabled;

    if (autoAcceptEnabled) {
        startAutoAcceptLoop();
        vscode.window.showInformationMessage('🔄 Auto-Accept: ON - Agent steps will be accepted automatically');
    } else {
        stopAutoAcceptLoop();
        vscode.window.showInformationMessage('⏸️ Auto-Accept: OFF');
    }

    updateStatusBar();
}

/**
 * Update the status bar based on current state
 */
function updateStatusBar() {
    const state = readState();
    currentState = state;

    // Determine auto-accept status icon
    const autoAcceptIcon = autoAcceptEnabled ? '✅' : '⏸️';

    if (!state) {
        statusBarItem.text = `${autoAcceptIcon} For Loop: Off`;
        statusBarItem.backgroundColor = autoAcceptEnabled
            ? undefined
            : new vscode.ThemeColor('statusBarItem.warningBackground');
        statusBarItem.tooltip = autoAcceptEnabled
            ? 'Auto-Accept ON | Click to manage'
            : 'Click to start a fix loop';
        return;
    }

    const iteration = state.iteration || 0;
    const maxIterations = state.max_iterations || 10;
    const progress = `${iteration}/${maxIterations}`;

    if (state.status === 'completed') {
        statusBarItem.text = `${autoAcceptIcon} Loop: Done`;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        statusBarItem.tooltip = `Completed after ${iteration} iterations`;

        // Auto-disable auto-accept when loop completes
        if (autoAcceptEnabled) {
            autoAcceptEnabled = false;
            stopAutoAcceptLoop();
            outputChannel.appendLine('[Auto-Accept] Disabled - loop completed');
        }
    } else if (state.status === 'failed' || state.status === 'stuck') {
        statusBarItem.text = `$(error) Loop: ${state.status === 'stuck' ? 'Stuck' : 'Failed'}`;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        statusBarItem.tooltip = `Failed at iteration ${iteration}`;

        // Auto-disable auto-accept when loop fails
        if (autoAcceptEnabled) {
            autoAcceptEnabled = false;
            stopAutoAcceptLoop();
            outputChannel.appendLine('[Auto-Accept] Disabled - loop failed/stuck');
        }
    } else {
        // Running
        statusBarItem.text = `${autoAcceptIcon} Loop: ${progress}`;
        statusBarItem.backgroundColor = undefined;
        statusBarItem.tooltip = `${autoAcceptEnabled ? '✅ Auto-Accept ON\n' : ''}Running: ${state.original_prompt || 'Unknown task'}\nClick for options`;
    }
}

/**
 * Show the Quick Pick menu
 */
async function showQuickPick() {
    const state = currentState;
    const items = [];

    // Auto-accept toggle (always shown first)
    items.push({
        label: autoAcceptEnabled ? '$(check) Auto-Accept: ON' : '$(circle-slash) Auto-Accept: OFF',
        description: autoAcceptEnabled ? 'Click to disable' : 'Click to enable automatic step acceptance',
        action: 'toggle-auto-accept'
    });

    // Continuation Enforcer toggle
    items.push({
        label: continuationEnforcerEnabled ? '$(sync) Continuation Enforcer: ON' : '$(circle-slash) Continuation Enforcer: OFF',
        description: continuationEnforcerEnabled ? 'Auto-copy prompt when tests fail' : 'Click to enable',
        action: 'toggle-continuation'
    });

    items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });

    if (!state) {
        // No active loop
        items.push({
            label: '$(play) Start Loop...',
            description: 'Start a new fix loop',
            action: 'start'
        });
        items.push({
            label: '$(rocket) Start Loop with All Features',
            description: 'Start loop + Auto-Accept + Continuation Enforcer',
            action: 'start-full'
        });
    } else {
        // Active loop
        items.push({
            label: '$(debug-stop) Cancel Loop',
            description: 'Stop the current loop',
            action: 'cancel'
        });
        items.push({
            label: '$(info) View Status',
            description: `Iteration ${state.iteration}/${state.max_iterations}`,
            action: 'status'
        });
        items.push({
            label: '$(run-all) Run Check Script',
            description: 'Execute check-completion.sh manually',
            action: 'check'
        });
        items.push({
            label: '$(clippy) Copy Continuation Prompt',
            description: 'Copy prompt to clipboard for manual injection',
            action: 'copy-prompt'
        });
    }

    items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });

    items.push({
        label: '$(output) View Logs',
        description: 'Open the output panel',
        action: 'logs'
    });

    // CDP options
    items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });

    const cdpEnabled = relauncher && relauncher.isCDPEnabled();
    if (cdpEnabled) {
        items.push({
            label: '$(check) CDP: Enabled',
            description: 'Chrome DevTools Protocol is active',
            action: 'cdp-status'
        });
    } else {
        items.push({
            label: '$(warning) CDP: Not Enabled',
            description: 'Click to setup and restart with CDP',
            action: 'enable-cdp'
        });
    }

    items.push({
        label: '$(debug) Debug CDP',
        description: 'Show CDP connection status and inputs',
        action: 'debug-cdp'
    });

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Antigravity For Loop'
    });

    if (!selected) return;

    switch (selected.action) {
        case 'toggle-auto-accept':
            toggleAutoAccept();
            break;
        case 'toggle-continuation':
            toggleContinuationEnforcer();
            break;
        case 'start':
            await startLoop();
            break;
        case 'start-full':
            autoAcceptEnabled = true;
            continuationEnforcerEnabled = true;
            startAutoAcceptLoop();
            await startLoop();
            vscode.window.showInformationMessage('🚀 Full loop started: Auto-Accept + Continuation Enforcer enabled');
            break;
        case 'cancel':
            await cancelLoop();
            break;
        case 'status':
            showStatus();
            break;
        case 'check':
            await runCheckScript();
            break;
        case 'copy-prompt':
            await copyContinuationPrompt();
            break;
        case 'logs':
            outputChannel.show();
            break;
        case 'enable-cdp':
            await enableCDP();
            break;
        case 'cdp-status':
            vscode.window.showInformationMessage('✅ CDP is enabled and ready for auto-injection');
            break;
        case 'debug-cdp':
            await debugCDP();
            break;
    }
}

/**
 * Generate a continuation prompt based on current state
 */
function generateContinuationPrompt(state, errorInfo = '') {
    if (!state) return null;

    return CONTINUATION_PROMPT_TEMPLATE
        .replace('{{ITERATION}}', String(state.iteration || 1))
        .replace('{{MAX}}', String(state.max_iterations || 10))
        .replace('{{TASK}}', state.original_prompt || 'Fix all errors')
        .replace('{{TEST_CMD}}', state.test_command || 'npm test')
        .replace('{{ERROR}}', errorInfo || 'Tests still failing');
}

/**
 * Copy continuation prompt to clipboard and show notification
 */
async function copyContinuationPrompt() {
    const state = readState();
    if (!state) {
        vscode.window.showWarningMessage('No active loop');
        return;
    }

    const prompt = generateContinuationPrompt(state, lastCheckResult);
    if (!prompt) return;

    await vscode.env.clipboard.writeText(prompt);

    vscode.window.showInformationMessage(
        '📋 Continuation prompt copied! Paste it in Antigravity chat to continue.',
        'Show Prompt'
    ).then(selection => {
        if (selection === 'Show Prompt') {
            outputChannel.appendLine('\n--- Continuation Prompt ---');
            outputChannel.appendLine(prompt);
            outputChannel.appendLine('----------------------------\n');
            outputChannel.show();
        }
    });

    outputChannel.appendLine('[Continuation] Prompt copied to clipboard');
}

/**
 * Handle check script result and trigger continuation if needed
 */
function handleCheckResult(stdout, stderr, state) {
    const output = stdout.toLowerCase();

    if (output.includes('done')) {
        lastCheckResult = 'DONE';
        outputChannel.appendLine('[Check] ✅ Tests passed - DONE');
        return 'done';
    }

    if (output.includes('stuck')) {
        lastCheckResult = stderr || stdout;
        outputChannel.appendLine('[Check] ❌ STUCK - requires manual intervention');
        return 'stuck';
    }

    if (output.includes('continue')) {
        lastCheckResult = stderr || stdout;
        outputChannel.appendLine('[Check] ⚠️ CONTINUE - tests still failing');

        // Trigger continuation enforcer
        if (continuationEnforcerEnabled && state) {
            triggerContinuation(state);
        }

        return 'continue';
    }

    return 'unknown';
}

/**
 * Auto-inject prompt using CDP (Chrome DevTools Protocol)
 * This connects directly to Antigravity's webview and injects into the chat input
 *
 * Fallback: AppleScript (macOS) / PowerShell (Windows) / xdotool (Linux)
 */
async function autoInjectPrompt(prompt) {
    // Method 1: Try CDP injection (preferred - direct webview access)
    if (cdpManager) {
        outputChannel.appendLine('[AutoInject] Attempting CDP injection...');
        const result = await cdpManager.injectPrompt(prompt);

        if (result.success) {
            outputChannel.appendLine('[AutoInject] ✅ Prompt injected via CDP');
            return true;
        } else {
            outputChannel.appendLine(`[AutoInject] CDP injection failed: ${result.error}`);
            outputChannel.appendLine('[AutoInject] Falling back to platform-specific method...');
        }
    }

    // Method 2: Fallback to platform-specific injection
    const platform = process.platform;

    if (platform === 'darwin') {
        // macOS: Use AppleScript to paste into Antigravity
        const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');

        // AppleScript that:
        // 1. Sets clipboard
        // 2. Activates Antigravity IDE
        // 3. Simulates Cmd+V to paste
        // 4. Simulates Enter to send
        const appleScript = `
            set the clipboard to "${escapedPrompt}"
            tell application "System Events"
                -- Find Antigravity window
                set frontApp to first application process whose frontmost is true
                set appName to name of frontApp

                -- Paste (Cmd+V)
                keystroke "v" using command down
                delay 0.3

                -- Send (Enter)
                keystroke return
            end tell
        `;

        return new Promise((resolve, reject) => {
            exec(`osascript -e '${appleScript.replace(/'/g, "'\"'\"'")}'`, (error, stdout, stderr) => {
                if (error) {
                    outputChannel.appendLine(`[AutoInject] AppleScript error: ${error.message}`);
                    reject(error);
                } else {
                    outputChannel.appendLine('[AutoInject] ✅ Prompt auto-injected via AppleScript (fallback)');
                    resolve(true);
                }
            });
        });
    } else if (platform === 'win32') {
        // Windows: Use PowerShell
        const escapedPrompt = prompt.replace(/"/g, '`"').replace(/\n/g, '`n');
        const psScript = `
            Set-Clipboard -Value "${escapedPrompt}"
            Add-Type -AssemblyName System.Windows.Forms
            [System.Windows.Forms.SendKeys]::SendWait("^v")
            Start-Sleep -Milliseconds 300
            [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
        `;

        return new Promise((resolve, reject) => {
            exec(`powershell -Command "${psScript.replace(/"/g, '\\"')}"`, (error, stdout, stderr) => {
                if (error) {
                    outputChannel.appendLine(`[AutoInject] PowerShell error: ${error.message}`);
                    reject(error);
                } else {
                    outputChannel.appendLine('[AutoInject] ✅ Prompt auto-injected via PowerShell (fallback)');
                    resolve(true);
                }
            });
        });
    } else {
        // Linux: Use xdotool
        return new Promise((resolve, reject) => {
            exec(`echo "${prompt}" | xclip -selection clipboard && xdotool key ctrl+v && sleep 0.3 && xdotool key Return`, (error) => {
                if (error) {
                    outputChannel.appendLine(`[AutoInject] xdotool error: ${error.message}`);
                    reject(error);
                } else {
                    outputChannel.appendLine('[AutoInject] ✅ Prompt auto-injected via xdotool (fallback)');
                    resolve(true);
                }
            });
        });
    }
}

/**
 * Trigger continuation - AUTO-INJECT prompt into Antigravity chat
 * This is the FULLY AUTOMATIC version that doesn't require user interaction
 */
async function triggerContinuation(state) {
    const prompt = generateContinuationPrompt(state, lastCheckResult);
    if (!prompt) return;

    outputChannel.appendLine(`[Continuation] Triggering auto-inject for iteration ${state.iteration}/${state.max_iterations}`);

    try {
        // Copy to clipboard first as backup
        await vscode.env.clipboard.writeText(prompt);

        // Small delay to ensure AI has stopped
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Auto-inject the prompt
        await autoInjectPrompt(prompt);

        outputChannel.appendLine('[Continuation] ✅ Auto-continuation triggered successfully');

    } catch (error) {
        // Fallback: show notification if auto-inject fails
        outputChannel.appendLine(`[Continuation] Auto-inject failed: ${error.message}`);
        outputChannel.appendLine('[Continuation] Falling back to manual mode');

        vscode.window.showWarningMessage(
            `🔄 Auto-inject failed. Prompt copied to clipboard. Please paste manually.`,
            'View Prompt'
        ).then(selection => {
            if (selection === 'View Prompt') {
                outputChannel.appendLine('\n--- Continuation Prompt ---');
                outputChannel.appendLine(prompt);
                outputChannel.appendLine('----------------------------\n');
                outputChannel.show();
            }
        });
    }
}

/**
 * Run the check-completion.sh script manually
 */
async function runCheckScript() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const scriptPath = path.join(workspacePath, 'commands', 'check-completion.sh');

    outputChannel.appendLine('[Check] Running check-completion.sh...');
    outputChannel.show();

    return new Promise((resolve) => {
        exec(`bash "${scriptPath}"`, { cwd: workspacePath }, (error, stdout, stderr) => {
            if (stdout) outputChannel.appendLine(stdout);
            if (stderr) outputChannel.appendLine(stderr);
            if (error) {
                outputChannel.appendLine(`[Error] ${error.message}`);
            }

            const state = readState();
            const result = handleCheckResult(stdout || '', stderr || '', state);
            updateStatusBar();
            resolve(result);
        });
    });
}

/**
 * Toggle continuation enforcer
 */
function toggleContinuationEnforcer() {
    continuationEnforcerEnabled = !continuationEnforcerEnabled;

    if (continuationEnforcerEnabled) {
        vscode.window.showInformationMessage('🔄 Continuation Enforcer: ON');
    } else {
        vscode.window.showInformationMessage('⏸️ Continuation Enforcer: OFF');
    }

    outputChannel.appendLine(`[Continuation] Enforcer ${continuationEnforcerEnabled ? 'enabled' : 'disabled'}`);
}

/**
 * Detect test/build command based on project type
 * Supports 20+ languages and frameworks
 */
function detectTestCommand(workspacePath) {
    const exists = (file) => fs.existsSync(path.join(workspacePath, file));
    const readJson = (file) => {
        try {
            return JSON.parse(fs.readFileSync(path.join(workspacePath, file), 'utf8'));
        } catch (e) { return null; }
    };
    const findFile = (pattern) => {
        try {
            const files = fs.readdirSync(workspacePath);
            return files.find(f => f.match(pattern));
        } catch (e) { return null; }
    };

    const detected = [];

    // ===== JavaScript / TypeScript =====
    if (exists('package.json')) {
        const pkg = readJson('package.json');
        if (pkg?.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
            detected.push({ cmd: 'npm test', type: 'npm', lang: 'JavaScript/TypeScript', priority: 10 });
        }
        if (pkg?.scripts?.build) {
            detected.push({ cmd: 'npm run build', type: 'build', lang: 'JavaScript/TypeScript', priority: 5 });
        }
        if (pkg?.scripts?.lint) {
            detected.push({ cmd: 'npm run lint', type: 'lint', lang: 'JavaScript/TypeScript', priority: 3 });
        }
    }
    if (exists('deno.json') || exists('deno.jsonc')) {
        detected.push({ cmd: 'deno test', type: 'deno', lang: 'Deno', priority: 10 });
    }
    if (exists('bun.lockb')) {
        detected.push({ cmd: 'bun test', type: 'bun', lang: 'Bun', priority: 10 });
    }

    // ===== Python =====
    if (exists('pyproject.toml') || exists('setup.py') || exists('requirements.txt') || exists('Pipfile')) {
        if (exists('pytest.ini') || exists('pyproject.toml')) {
            detected.push({ cmd: 'pytest', type: 'pytest', lang: 'Python', priority: 10 });
        } else if (exists('tox.ini')) {
            detected.push({ cmd: 'tox', type: 'tox', lang: 'Python', priority: 10 });
        } else {
            detected.push({ cmd: 'python -m pytest', type: 'python', lang: 'Python', priority: 8 });
        }
        if (exists('mypy.ini') || exists('pyproject.toml')) {
            detected.push({ cmd: 'mypy .', type: 'mypy', lang: 'Python', priority: 5 });
        }
    }

    // ===== Rust =====
    if (exists('Cargo.toml')) {
        detected.push({ cmd: 'cargo test', type: 'cargo', lang: 'Rust', priority: 10 });
        detected.push({ cmd: 'cargo build', type: 'cargo-build', lang: 'Rust', priority: 5 });
        detected.push({ cmd: 'cargo clippy', type: 'clippy', lang: 'Rust', priority: 3 });
    }

    // ===== Go =====
    if (exists('go.mod')) {
        detected.push({ cmd: 'go test ./...', type: 'go', lang: 'Go', priority: 10 });
        detected.push({ cmd: 'go build ./...', type: 'go-build', lang: 'Go', priority: 5 });
        detected.push({ cmd: 'golangci-lint run', type: 'golint', lang: 'Go', priority: 3 });
    }

    // ===== Java / Kotlin (JVM) =====
    if (exists('pom.xml')) {
        detected.push({ cmd: 'mvn test', type: 'maven', lang: 'Java/Kotlin', priority: 10 });
        detected.push({ cmd: 'mvn compile', type: 'maven-build', lang: 'Java/Kotlin', priority: 5 });
    }
    if (exists('build.gradle') || exists('build.gradle.kts')) {
        detected.push({ cmd: './gradlew test', type: 'gradle', lang: 'Java/Kotlin', priority: 10 });
        detected.push({ cmd: './gradlew build', type: 'gradle-build', lang: 'Java/Kotlin', priority: 5 });
    }

    // ===== Ruby =====
    if (exists('Gemfile')) {
        if (exists('.rspec') || exists('spec')) {
            detected.push({ cmd: 'bundle exec rspec', type: 'rspec', lang: 'Ruby', priority: 10 });
        } else if (exists('Rakefile')) {
            detected.push({ cmd: 'bundle exec rake test', type: 'rake', lang: 'Ruby', priority: 10 });
        } else {
            detected.push({ cmd: 'bundle exec rake', type: 'ruby', lang: 'Ruby', priority: 8 });
        }
    }

    // ===== .NET / C# / F# =====
    if (findFile(/\.sln$/) || findFile(/\.csproj$/) || findFile(/\.fsproj$/)) {
        detected.push({ cmd: 'dotnet test', type: 'dotnet', lang: '.NET', priority: 10 });
        detected.push({ cmd: 'dotnet build', type: 'dotnet-build', lang: '.NET', priority: 5 });
    }

    // ===== PHP =====
    if (exists('composer.json')) {
        if (exists('phpunit.xml') || exists('phpunit.xml.dist')) {
            detected.push({ cmd: './vendor/bin/phpunit', type: 'phpunit', lang: 'PHP', priority: 10 });
        }
        const composer = readJson('composer.json');
        if (composer?.scripts?.test) {
            detected.push({ cmd: 'composer test', type: 'composer', lang: 'PHP', priority: 9 });
        }
    }

    // ===== Swift =====
    if (exists('Package.swift')) {
        detected.push({ cmd: 'swift test', type: 'swift', lang: 'Swift', priority: 10 });
        detected.push({ cmd: 'swift build', type: 'swift-build', lang: 'Swift', priority: 5 });
    }
    if (findFile(/\.xcodeproj$/) || findFile(/\.xcworkspace$/)) {
        detected.push({ cmd: 'xcodebuild test', type: 'xcode', lang: 'Swift/ObjC', priority: 8 });
    }

    // ===== Dart / Flutter =====
    if (exists('pubspec.yaml')) {
        if (exists('test')) {
            if (exists('android') || exists('ios')) {
                detected.push({ cmd: 'flutter test', type: 'flutter', lang: 'Flutter', priority: 10 });
            } else {
                detected.push({ cmd: 'dart test', type: 'dart', lang: 'Dart', priority: 10 });
            }
        }
        detected.push({ cmd: 'dart analyze', type: 'dart-analyze', lang: 'Dart', priority: 5 });
    }

    // ===== Elixir =====
    if (exists('mix.exs')) {
        detected.push({ cmd: 'mix test', type: 'elixir', lang: 'Elixir', priority: 10 });
    }

    // ===== Erlang =====
    if (exists('rebar.config')) {
        detected.push({ cmd: 'rebar3 eunit', type: 'erlang', lang: 'Erlang', priority: 10 });
    }

    // ===== Haskell =====
    if (exists('stack.yaml')) {
        detected.push({ cmd: 'stack test', type: 'stack', lang: 'Haskell', priority: 10 });
    }
    if (exists('cabal.project') || findFile(/\.cabal$/)) {
        detected.push({ cmd: 'cabal test', type: 'cabal', lang: 'Haskell', priority: 9 });
    }

    // ===== Scala =====
    if (exists('build.sbt')) {
        detected.push({ cmd: 'sbt test', type: 'sbt', lang: 'Scala', priority: 10 });
    }

    // ===== Clojure =====
    if (exists('project.clj')) {
        detected.push({ cmd: 'lein test', type: 'lein', lang: 'Clojure', priority: 10 });
    }
    if (exists('deps.edn')) {
        detected.push({ cmd: 'clj -X:test', type: 'clojure', lang: 'Clojure', priority: 9 });
    }

    // ===== C / C++ =====
    if (exists('CMakeLists.txt')) {
        detected.push({ cmd: 'cmake --build build && ctest --test-dir build', type: 'cmake', lang: 'C/C++', priority: 10 });
    }
    if (exists('meson.build')) {
        detected.push({ cmd: 'meson test -C build', type: 'meson', lang: 'C/C++', priority: 10 });
    }
    if (exists('conanfile.txt') || exists('conanfile.py')) {
        detected.push({ cmd: 'conan build . && ctest', type: 'conan', lang: 'C/C++', priority: 8 });
    }

    // ===== Zig =====
    if (exists('build.zig')) {
        detected.push({ cmd: 'zig build test', type: 'zig', lang: 'Zig', priority: 10 });
    }

    // ===== Nim =====
    if (findFile(/\.nimble$/)) {
        detected.push({ cmd: 'nimble test', type: 'nim', lang: 'Nim', priority: 10 });
    }

    // ===== V =====
    if (exists('v.mod')) {
        detected.push({ cmd: 'v test .', type: 'vlang', lang: 'V', priority: 10 });
    }

    // ===== OCaml =====
    if (exists('dune-project')) {
        detected.push({ cmd: 'dune runtest', type: 'dune', lang: 'OCaml', priority: 10 });
    }

    // ===== Generic Build Systems =====
    if (exists('Makefile') || exists('makefile') || exists('GNUmakefile')) {
        detected.push({ cmd: 'make test', type: 'make', lang: 'Make', priority: 6 });
        detected.push({ cmd: 'make', type: 'make-build', lang: 'Make', priority: 4 });
    }
    if (exists('justfile') || exists('Justfile')) {
        detected.push({ cmd: 'just test', type: 'just', lang: 'Just', priority: 7 });
    }
    if (exists('Taskfile.yml') || exists('Taskfile.yaml')) {
        detected.push({ cmd: 'task test', type: 'task', lang: 'Task', priority: 7 });
    }
    if (exists('Earthfile')) {
        detected.push({ cmd: 'earthly +test', type: 'earthly', lang: 'Earthly', priority: 7 });
    }
    if (exists('BUILD.bazel') || exists('WORKSPACE')) {
        detected.push({ cmd: 'bazel test //...', type: 'bazel', lang: 'Bazel', priority: 8 });
    }
    if (exists('pants.toml')) {
        detected.push({ cmd: 'pants test ::', type: 'pants', lang: 'Pants', priority: 8 });
    }

    // Sort by priority and return the highest
    if (detected.length === 0) return null;
    detected.sort((a, b) => b.priority - a.priority);
    return detected[0];
}

/**
 * Get all detected commands for a project (for showing options)
 */
function detectAllCommands(workspacePath) {
    const exists = (file) => fs.existsSync(path.join(workspacePath, file));
    const readJson = (file) => {
        try {
            return JSON.parse(fs.readFileSync(path.join(workspacePath, file), 'utf8'));
        } catch (e) { return null; }
    };
    const findFile = (pattern) => {
        try {
            const files = fs.readdirSync(workspacePath);
            return files.find(f => f.match(pattern));
        } catch (e) { return null; }
    };

    const detected = [];

    // Reuse same logic but collect all
    if (exists('package.json')) {
        const pkg = readJson('package.json');
        if (pkg?.scripts) {
            Object.entries(pkg.scripts).forEach(([name, script]) => {
                if (['test', 'build', 'lint', 'typecheck', 'check'].includes(name)) {
                    detected.push({ cmd: `npm run ${name}`, type: name, lang: 'npm', script });
                }
            });
        }
    }
    // Add other common commands from detectTestCommand
    const primary = detectTestCommand(workspacePath);
    if (primary && !detected.find(d => d.cmd === primary.cmd)) {
        detected.unshift(primary);
    }

    return detected;
}

/**
 * Start loop with improved UX - Ralph Wiggum style!
 *
 * Inspired by Claude Code's Ralph Wiggum technique:
 * - Continuous loop until tests pass or max iterations
 * - Auto-accept all agent steps
 * - Re-inject prompt on each iteration with error context
 */
async function startLoop() {
    // Check if loop already running
    if (currentRalphLoop && currentRalphLoop.isRunning) {
        vscode.window.showWarningMessage('A loop is already running. Cancel it first to start a new one.');
        return;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const detectedCmd = detectTestCommand(workspacePath);

    // Step 1: Task description
    const taskDescription = await vscode.window.showInputBox({
        prompt: 'Describe your task',
        placeHolder: 'e.g., Fix all TypeScript errors',
        ignoreFocusOut: true
    });

    if (!taskDescription) return;

    // Step 2: Completion condition (Quick Pick)
    const completionOptions = [
        {
            label: '$(check) Tests Pass',
            description: detectedCmd
                ? `${detectedCmd.lang}: ${detectedCmd.cmd}`
                : 'No test command detected',
            value: 'test',
            command: detectedCmd?.cmd || null,
            detail: detectedCmd ? `Detected ${detectedCmd.lang} project` : undefined
        },
        {
            label: '$(package) Build Succeeds',
            description: detectedCmd?.type?.includes('build')
                ? detectedCmd.cmd
                : 'Stop when build completes successfully',
            value: 'build',
            command: detectedCmd?.cmd || 'make'
        },
        {
            label: '$(eye) AI Self-Judgment',
            description: 'Stop when AI outputs "DONE"',
            value: 'ai',
            command: null
        },
        {
            label: '$(terminal) Custom Command...',
            description: 'Enter a custom validation command',
            value: 'custom',
            command: null
        }
    ];

    const completionChoice = await vscode.window.showQuickPick(completionOptions, {
        placeHolder: 'Select completion condition (when to stop the loop)',
        ignoreFocusOut: true
    });

    if (!completionChoice) return;

    let checkCommand = completionChoice.command;

    // If custom, ask for command
    if (completionChoice.value === 'custom') {
        checkCommand = await vscode.window.showInputBox({
            prompt: 'Enter validation command (exit 0 on success)',
            placeHolder: 'e.g., npm test, cargo test, pytest, make test',
            ignoreFocusOut: true
        });
        if (!checkCommand) return;
    }

    // If test mode but no command detected, ask for it
    if (completionChoice.value === 'test' && !checkCommand) {
        checkCommand = await vscode.window.showInputBox({
            prompt: 'No test command detected. Please enter manually',
            placeHolder: 'e.g., npm test, cargo test, pytest, make test',
            ignoreFocusOut: true
        });
        if (!checkCommand) return;
    }

    // Step 3: Max iterations (with sensible default)
    const maxChoice = await vscode.window.showQuickPick([
        { label: '5 iterations', value: '5', description: 'Quick try' },
        { label: '10 iterations', value: '10', description: 'Recommended' },
        { label: '20 iterations', value: '20', description: 'Complex task' },
        { label: '50 iterations', value: '50', description: 'Difficult task' },
        { label: 'Custom...', value: 'custom' }
    ], {
        placeHolder: 'Maximum iterations',
        ignoreFocusOut: true
    });

    if (!maxChoice) return;

    let maxIterations = parseInt(maxChoice.value);
    if (maxChoice.value === 'custom') {
        const customMax = await vscode.window.showInputBox({
            prompt: 'Enter max iterations (1-100)',
            value: '10',
            validateInput: (v) => {
                const n = parseInt(v);
                return (isNaN(n) || n < 1 || n > 100) ? 'Please enter a number between 1-100' : null;
            }
        });
        if (!customMax) return;
        maxIterations = parseInt(customMax);
    }

    // Show output channel
    outputChannel.show();

    // Create and start Ralph Loop
    currentRalphLoop = new RalphLoop(cdpManager, outputChannel, {
        maxIterations,
        testCommand: checkCommand,
        completionPromise: 'DONE',
        taskDescription,
        workspacePath,
        onProgress: (progress) => {
            // Update status bar with progress
            currentState = {
                status: 'running',
                iteration: progress.iteration,
                max_iterations: progress.maxIterations
            };
            updateStatusBar();
        },
        onComplete: (result) => {
            // Update status bar when done
            currentState = {
                status: result.success ? 'done' : 'failed',
                iteration: result.iterations,
                max_iterations: result.maxIterations
            };
            updateStatusBar();

            // Show notification
            if (result.success) {
                vscode.window.showInformationMessage(`✅ Loop complete! ${result.message}`);
            } else {
                vscode.window.showWarningMessage(`❌ Loop ended: ${result.message}`);
            }
        }
    });

    // Update status bar to show running
    currentState = {
        status: 'running',
        iteration: 1,
        max_iterations: maxIterations
    };
    updateStatusBar();

    // Start the loop (async)
    vscode.window.showInformationMessage(`🚀 Ralph Loop started! Task: ${taskDescription}`);
    currentRalphLoop.start().catch(e => {
        outputChannel.appendLine(`[Error] Loop failed: ${e.message}`);
        vscode.window.showErrorMessage(`Loop execution failed: ${e.message}`);
    });
}

/**
 * Cancel the current loop
 */
async function cancelLoop() {
    if (!currentRalphLoop || !currentRalphLoop.isRunning) {
        vscode.window.showInformationMessage('No loop is currently running.');
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        'Are you sure you want to cancel the current loop?',
        { modal: true },
        'Yes, Cancel'
    );

    if (confirm !== 'Yes, Cancel') return;

    outputChannel.appendLine('[Cancel] Stopping loop...');
    currentRalphLoop.cancel();

    currentState = { status: 'cancelled' };
    updateStatusBar();

    vscode.window.showInformationMessage('Loop cancelled.');
}

/**
 * Show detailed status
 */
function showStatus() {
    if (!currentState) {
        vscode.window.showInformationMessage('No active loop.');
        return;
    }

    const info = [
        `Task: ${currentState.original_prompt || 'Unknown'}`,
        `Iteration: ${currentState.iteration}/${currentState.max_iterations}`,
        `Status: ${currentState.status || 'running'}`,
        `Started: ${currentState.started_at || 'Unknown'}`
    ].join('\n');

    outputChannel.appendLine(`\n--- Current Status ---\n${info}\n`);
    outputChannel.show();
}

/**
 * Debug CDP connection and list available inputs/buttons in the webview
 */
async function debugCDP() {
    outputChannel.appendLine('\n--- CDP Debug ---');
    outputChannel.show();

    if (!cdpManager) {
        outputChannel.appendLine('[Debug] CDP Manager not initialized');
        return;
    }

    // Check if CDP flag is enabled
    const cdpEnabled = relauncher && relauncher.isCDPEnabled();
    outputChannel.appendLine(`[Debug] CDP flag in process args: ${cdpEnabled ? 'Yes' : 'No'}`);

    // Check if CDP port is available
    const portAvailable = await cdpManager.isAvailable();
    outputChannel.appendLine(`[Debug] CDP port available: ${portAvailable ? 'Yes' : 'No'}`);

    outputChannel.appendLine('[Debug] Attempting CDP connection...');
    const connected = await cdpManager.tryConnect();

    if (!connected) {
        outputChannel.appendLine('[Debug] ❌ Could not connect to CDP');

        if (!portAvailable) {
            outputChannel.appendLine('[Debug] No CDP port found (9000-9003)');

            const choice = await vscode.window.showWarningMessage(
                'CDP not available. The IDE may need to be restarted with --remote-debugging-port=9000.',
                'Setup & Restart',
                'Show Instructions',
                'Cancel'
            );

            if (choice === 'Setup & Restart' && relauncher) {
                await relauncher.ensureCDPEnabled();
            } else if (choice === 'Show Instructions' && relauncher) {
                relauncher.showManualInstructions();
            }
        } else {
            outputChannel.appendLine('[Debug] CDP port found but WebSocket connection failed');
            vscode.window.showWarningMessage('CDP port available but connection failed. Check output for details.');
        }
        return;
    }

    outputChannel.appendLine('[Debug] ✅ Connected to CDP');

    // Scan for inputs
    outputChannel.appendLine('[Debug] Scanning for input elements...');
    const inputResult = await cdpManager.debugListInputs();

    if (inputResult.error) {
        outputChannel.appendLine(`[Debug] Input scan error: ${inputResult.error}`);
    } else {
        outputChannel.appendLine(`[Debug] Found ${inputResult.textareas || 0} textareas`);
        outputChannel.appendLine(`[Debug] Found ${inputResult.editables || 0} contenteditable elements`);
    }

    // Scan for buttons (for auto-accept)
    outputChannel.appendLine('[Debug] Scanning for accept buttons...');
    const buttonResult = await cdpManager.debugListButtons();

    if (buttonResult.error) {
        outputChannel.appendLine(`[Debug] Button scan error: ${buttonResult.error}`);
    } else {
        outputChannel.appendLine(`[Debug] Total buttons: ${buttonResult.total || 0}`);
        outputChannel.appendLine(`[Debug] Antigravity buttons (.bg-ide-button-background): ${buttonResult.antigravityButtons || 0}`);
        outputChannel.appendLine(`[Debug] Accept buttons detected: ${(buttonResult.acceptButtons || []).length}`);

        if (buttonResult.acceptButtons && buttonResult.acceptButtons.length > 0) {
            outputChannel.appendLine('[Debug] Accept buttons:');
            buttonResult.acceptButtons.forEach(btn => {
                outputChannel.appendLine(`  - "${btn.text}" (class: ${btn.class})`);
            });
        }
    }

    outputChannel.appendLine('--- End Debug ---\n');

    const msg = `CDP Debug: ${inputResult.textareas || 0} inputs, ${buttonResult.antigravityButtons || 0} Antigravity buttons, ${(buttonResult.acceptButtons || []).length} accept buttons`;
    vscode.window.showInformationMessage(msg);
}

/**
 * Enable CDP by setting up and restarting the IDE
 */
async function enableCDP() {
    if (!relauncher) {
        vscode.window.showErrorMessage('Relauncher not initialized');
        return;
    }

    if (relauncher.isCDPEnabled()) {
        vscode.window.showInformationMessage('CDP is already enabled!');
        return;
    }

    outputChannel.appendLine('[CDP] Starting CDP setup...');
    outputChannel.show();

    await relauncher.ensureCDPEnabled();
}

/**
 * Activate the extension
 */
function activate(context) {
    console.log('Antigravity For Loop extension activated');

    // Create output channel
    outputChannel = vscode.window.createOutputChannel('Antigravity For Loop');
    outputChannel.appendLine('[Init] Extension activated');
    outputChannel.appendLine('[Info] Auto-Accept uses: antigravity.agent.acceptAgentStep, antigravity.terminal.accept');

    // Initialize CDP Manager for direct webview injection
    cdpManager = new CDPManager({
        log: (msg) => outputChannel.appendLine(msg)
    });
    outputChannel.appendLine('[Init] CDP Manager initialized (ports 9000-9003)');

    // Initialize Relauncher for CDP setup
    relauncher = new Relauncher({
        log: (msg) => outputChannel.appendLine(msg)
    });

    // Check CDP by actually trying to connect (more reliable than checking args)
    outputChannel.appendLine('[Init] Checking CDP connection...');

    // Try to connect to CDP first
    cdpManager.tryConnect().then(async connected => {
        if (connected) {
            outputChannel.appendLine('[CDP] ✅ Connected to Antigravity webview');
            relauncher._cdpVerified = true;
        } else {
            outputChannel.appendLine('[CDP] ⚠️ Could not connect to CDP port');

            // Only show warning if CDP is really not available
            vscode.window.showWarningMessage(
                'Antigravity For Loop: CDP not enabled. Auto-Accept and prompt injection require CDP.',
                'Enable CDP',
                'Learn More',
                'Dismiss'
            ).then(choice => {
                if (choice === 'Enable CDP') {
                    enableCDP();
                } else if (choice === 'Learn More') {
                    outputChannel.show();
                    outputChannel.appendLine('\n=== CDP Setup Instructions ===');
                    outputChannel.appendLine('CDP (Chrome DevTools Protocol) allows the extension to:');
                    outputChannel.appendLine('  - Automatically click Accept buttons');
                    outputChannel.appendLine('  - Inject prompts directly into chat');
                    outputChannel.appendLine('  - Submit messages programmatically');
                    outputChannel.appendLine('\nTo enable CDP, start Antigravity with:');
                    outputChannel.appendLine('  /Applications/Antigravity.app/Contents/MacOS/Electron --remote-debugging-port=9000');
                    outputChannel.appendLine('================================\n');
                }
            });
        }
    }).catch(() => { });

    // Create status bar item (high priority to be visible)
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10000);
    statusBarItem.command = 'antigravity-for-loop.showMenu';
    statusBarItem.text = '⏸️ For Loop: Off';
    statusBarItem.tooltip = 'Click to manage fix loop';
    statusBarItem.show();

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('antigravity-for-loop.start', startLoop),
        vscode.commands.registerCommand('antigravity-for-loop.cancel', cancelLoop),
        vscode.commands.registerCommand('antigravity-for-loop.showMenu', showQuickPick),
        vscode.commands.registerCommand('antigravity-for-loop.showLogs', () => outputChannel.show()),
        vscode.commands.registerCommand('antigravity-for-loop.toggleAutoAccept', toggleAutoAccept),
        vscode.commands.registerCommand('antigravity-for-loop.runCheck', runCheckScript),
        vscode.commands.registerCommand('antigravity-for-loop.toggleContinuation', toggleContinuationEnforcer),
        vscode.commands.registerCommand('antigravity-for-loop.copyPrompt', copyContinuationPrompt),
        vscode.commands.registerCommand('antigravity-for-loop.debugCDP', debugCDP),
        vscode.commands.registerCommand('antigravity-for-loop.enableCDP', enableCDP)
    );

    // Start polling for state changes
    statePollingInterval = setInterval(updateStatusBar, 1000);

    // Initial status update
    updateStatusBar();

    context.subscriptions.push(statusBarItem);
    context.subscriptions.push(outputChannel);
}

/**
 * Deactivate the extension
 */
function deactivate() {
    if (statePollingInterval) {
        clearInterval(statePollingInterval);
    }
    if (autoAcceptInterval) {
        clearInterval(autoAcceptInterval);
    }
    if (cdpManager) {
        cdpManager.dispose();
        cdpManager = null;
    }
}

module.exports = {
    activate,
    deactivate
};
