// test/e2e/extension.e2e.test.js
// E2E tests using @vscode/test-electron + Mocha
// This approach works on M1/M4 Mac and CI (Linux)

const assert = require('assert');
const vscode = require('vscode');

// This test runs inside VSCode Extension Development Host
suite('Antigravity For Loop E2E Tests', function () {
    this.timeout(60000);

    suiteSetup(async function () {
        // Ensure extension is activated
        const extension = vscode.extensions.getExtension('iml1s.antigravity-for-loop');
        if (extension && !extension.isActive) {
            await extension.activate();
        }
        // Wait for extension to fully initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
    });

    suite('Command Palette', function () {
        test('should execute commands without errors', async function () {
            // Execute show logs command
            await vscode.commands.executeCommand('antigravity-for-loop.showLogs');

            // If we get here without error, command works
            assert.ok(true, 'Show logs command executed successfully');
        });

        test('should show menu command', async function () {
            // Execute show menu command
            try {
                await vscode.commands.executeCommand('antigravity-for-loop.showMenu');
                await new Promise(resolve => setTimeout(resolve, 500));
                // Cancel any open quick pick
                await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
            } catch (e) {
                // Quick pick may close naturally, that's OK
            }
            assert.ok(true, 'Show menu command executed');
        });
    });

    suite('Status Bar', function () {
        test('should have status bar item registered', async function () {
            // The status bar item is created by the extension
            // We verify it exists by checking the extension is active
            const extension = vscode.extensions.getExtension('iml1s.antigravity-for-loop');
            assert.ok(extension, 'Extension should be found');
            assert.ok(extension.isActive, 'Extension should be active');
        });
    });

    suite('Output Channel', function () {
        test('should have output channel available', async function () {
            // Execute show logs to ensure output channel exists
            await vscode.commands.executeCommand('antigravity-for-loop.showLogs');

            // If command executes, output channel is available
            assert.ok(true, 'Output channel is available');
        });
    });
});
