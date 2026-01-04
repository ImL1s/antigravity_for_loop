// Antigravity For Loop Extension
// This is a placeholder for VSCode extension entry point
// The actual logic is in the shell scripts (hooks/ and commands/)

const vscode = require('vscode');

function activate(context) {
    console.log('Antigravity For Loop extension is now active!');
    
    // Register start command
    let startCmd = vscode.commands.registerCommand('antigravity-for-loop.start', function () {
        vscode.window.showInformationMessage('Use /for-loop command in Antigravity chat to start a fix loop.');
    });
    
    // Register cancel command
    let cancelCmd = vscode.commands.registerCommand('antigravity-for-loop.cancel', function () {
        vscode.window.showInformationMessage('Use /cancel-loop command in Antigravity chat to cancel.');
    });
    
    context.subscriptions.push(startCmd);
    context.subscriptions.push(cancelCmd);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
}
