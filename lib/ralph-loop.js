/**
 * Ralph Loop for Antigravity
 *
 * Inspired by Claude Code's Ralph Wiggum technique:
 * A continuous loop that keeps feeding prompts to the AI until
 * the task is complete (test passes) or max iterations reached.
 *
 * Key difference from Claude Code:
 * - Claude Code: CLI-based, uses Stop hook + exit code 2
 * - Antigravity: GUI-based, uses CDP to inject prompts into chat panel
 */

const { exec } = require('child_process');
const path = require('path');

class RalphLoop {
    constructor(cdpManager, outputChannel, options = {}) {
        this.cdp = cdpManager;
        this.output = outputChannel;
        this.options = {
            maxIterations: options.maxIterations || 10,
            testCommand: options.testCommand || null,
            completionPromise: options.completionPromise || 'DONE',
            taskDescription: options.taskDescription || '',
            workspacePath: options.workspacePath || process.cwd(),
            pollInterval: options.pollInterval || 2000,      // How often to check AI status
            aiTimeout: options.aiTimeout || 300000,          // Max time to wait for AI (5 min)
            autoAcceptInterval: options.autoAcceptInterval || 500,
        };

        this.isRunning = false;
        this.currentIteration = 0;
        this.lastError = null;
        this.autoAcceptTimer = null;
        this.onProgress = options.onProgress || (() => {});
        this.onComplete = options.onComplete || (() => {});
    }

    /**
     * Build the prompt for each iteration
     */
    buildPrompt(iteration) {
        const parts = [];

        // Header with iteration info
        parts.push(`[ITERATION ${iteration}/${this.options.maxIterations}]`);
        parts.push('');

        // Task description
        if (this.options.taskDescription) {
            parts.push(`TASK: ${this.options.taskDescription}`);
            parts.push('');
        }

        // Previous error if any
        if (this.lastError && iteration > 1) {
            parts.push('PREVIOUS ATTEMPT FAILED:');
            parts.push('```');
            parts.push(this.lastError.substring(0, 2000)); // Limit error length
            parts.push('```');
            parts.push('');
            parts.push('Fix the issues above and try again.');
            parts.push('');
        }

        // Instructions
        parts.push('INSTRUCTIONS:');
        parts.push('1. Analyze the current state');
        parts.push('2. Make necessary code changes');
        if (this.options.testCommand) {
            parts.push(`3. Run: ${this.options.testCommand}`);
            parts.push('4. If tests fail, analyze errors and fix');
        }
        parts.push('');

        // Completion signal
        parts.push(`When the task is fully complete and all tests pass, respond with exactly: ${this.options.completionPromise}`);

        return parts.join('\n');
    }

    /**
     * Run the test command and return result
     */
    async runTestCommand() {
        if (!this.options.testCommand) {
            return { success: true, exitCode: 0, output: '' };
        }

        return new Promise((resolve) => {
            this.output.appendLine(`[Ralph] Running: ${this.options.testCommand}`);

            exec(this.options.testCommand, {
                cwd: this.options.workspacePath,
                timeout: 120000, // 2 minute timeout
                maxBuffer: 1024 * 1024 * 10 // 10MB
            }, (error, stdout, stderr) => {
                const exitCode = error ? error.code || 1 : 0;
                const output = stdout + '\n' + stderr;

                if (exitCode === 0) {
                    this.output.appendLine('[Ralph] Test PASSED!');
                    resolve({ success: true, exitCode: 0, output });
                } else {
                    this.output.appendLine(`[Ralph] Test FAILED (exit code: ${exitCode})`);
                    resolve({ success: false, exitCode, output, error: stderr || stdout });
                }
            });
        });
    }

    /**
     * Wait for AI to finish responding
     * Returns the AI's response text
     */
    async waitForAICompletion() {
        const startTime = Date.now();
        let lastMessageCount = 0;
        let stableCount = 0;
        const stabilityThreshold = 3; // Need 3 consecutive stable checks

        this.output.appendLine('[Ralph] Waiting for AI response...');

        while (Date.now() - startTime < this.options.aiTimeout) {
            await this.sleep(this.options.pollInterval);

            // Check if AI is still responding by looking at message count
            const status = await this.getAIStatus();

            if (status.messageCount === lastMessageCount) {
                stableCount++;
                if (stableCount >= stabilityThreshold) {
                    // AI seems to have finished
                    this.output.appendLine('[Ralph] AI response complete');
                    return status.lastMessage;
                }
            } else {
                stableCount = 0;
                lastMessageCount = status.messageCount;
            }

            // Check for completion promise in output
            if (status.lastMessage && status.lastMessage.includes(this.options.completionPromise)) {
                this.output.appendLine(`[Ralph] Found completion promise: ${this.options.completionPromise}`);
                return status.lastMessage;
            }
        }

        this.output.appendLine('[Ralph] AI response timeout');
        return null;
    }

    /**
     * Get AI status from the chat panel
     */
    async getAIStatus() {
        try {
            const result = await this.cdp.sendCommand('Runtime.evaluate', {
                expression: `
                    (function() {
                        const iframe = document.getElementById('antigravity.agentPanel');
                        if (!iframe) return { error: 'no iframe' };
                        const doc = iframe.contentDocument;
                        if (!doc) return { error: 'no doc' };

                        // Count messages in chat
                        const messages = doc.querySelectorAll('[class*="message"], [class*="chat-item"], [data-message]');

                        // Get last message text
                        let lastMessage = '';
                        if (messages.length > 0) {
                            const last = messages[messages.length - 1];
                            lastMessage = last.textContent || '';
                        }

                        // Check if AI is currently typing/thinking
                        const isTyping = !!doc.querySelector('[class*="typing"], [class*="loading"], [class*="thinking"]');

                        return {
                            messageCount: messages.length,
                            lastMessage: lastMessage.substring(0, 500),
                            isTyping
                        };
                    })()
                `,
                returnByValue: true
            });

            return result?.result?.value || { messageCount: 0, lastMessage: '', isTyping: false };
        } catch (e) {
            return { messageCount: 0, lastMessage: '', isTyping: false, error: e.message };
        }
    }

    /**
     * Start auto-accept loop
     */
    startAutoAccept() {
        if (this.autoAcceptTimer) return;

        this.autoAcceptTimer = setInterval(async () => {
            if (!this.isRunning) return;
            try {
                await this.cdp.clickAcceptButtons();
            } catch (e) {
                // Silent fail
            }
        }, this.options.autoAcceptInterval);

        this.output.appendLine('[Ralph] Auto-accept started');
    }

    /**
     * Stop auto-accept loop
     */
    stopAutoAccept() {
        if (this.autoAcceptTimer) {
            clearInterval(this.autoAcceptTimer);
            this.autoAcceptTimer = null;
        }
        this.output.appendLine('[Ralph] Auto-accept stopped');
    }

    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Main loop - Ralph Wiggum style!
     */
    async start() {
        if (this.isRunning) {
            this.output.appendLine('[Ralph] Loop already running');
            return { success: false, error: 'Already running' };
        }

        this.isRunning = true;
        this.currentIteration = 0;
        this.lastError = null;

        this.output.appendLine('╔════════════════════════════════════════════════════════════╗');
        this.output.appendLine('║           RALPH LOOP FOR ANTIGRAVITY                       ║');
        this.output.appendLine('╚════════════════════════════════════════════════════════════╝');
        this.output.appendLine(`Task: ${this.options.taskDescription}`);
        this.output.appendLine(`Test: ${this.options.testCommand || '(none - using completion promise)'}`);
        this.output.appendLine(`Max Iterations: ${this.options.maxIterations}`);
        this.output.appendLine(`Completion Promise: ${this.options.completionPromise}`);
        this.output.appendLine('');

        // Start auto-accept
        this.startAutoAccept();

        try {
            // Connect to CDP
            const connected = await this.cdp.tryConnect();
            if (!connected) {
                throw new Error('Could not connect to CDP. Is Antigravity running with --remote-debugging-port=9000?');
            }

            // Main loop
            for (this.currentIteration = 1; this.currentIteration <= this.options.maxIterations; this.currentIteration++) {
                if (!this.isRunning) {
                    this.output.appendLine('[Ralph] Loop cancelled');
                    break;
                }

                this.output.appendLine(`\n━━━ ITERATION ${this.currentIteration}/${this.options.maxIterations} ━━━`);
                this.onProgress({
                    iteration: this.currentIteration,
                    maxIterations: this.options.maxIterations,
                    status: 'running'
                });

                // Step 1: Build and inject prompt
                const prompt = this.buildPrompt(this.currentIteration);
                this.output.appendLine('[Ralph] Injecting prompt...');

                const injectResult = await this.cdp.injectPrompt(prompt);
                if (!injectResult.success) {
                    this.output.appendLine(`[Ralph] Inject failed: ${injectResult.error}`);
                    await this.sleep(2000);
                    continue;
                }

                // Step 2: Wait for AI to respond
                const aiResponse = await this.waitForAICompletion();

                // Step 3: Check for completion promise in AI response
                if (aiResponse && aiResponse.includes(this.options.completionPromise)) {
                    this.output.appendLine(`[Ralph] AI signaled completion: ${this.options.completionPromise}`);

                    // Verify with test command if configured
                    if (this.options.testCommand) {
                        const testResult = await this.runTestCommand();
                        if (testResult.success) {
                            return this.complete(true, 'Task completed successfully!');
                        } else {
                            this.output.appendLine('[Ralph] AI claimed done but tests still fail');
                            this.lastError = testResult.error;
                            continue;
                        }
                    } else {
                        return this.complete(true, 'Task completed (AI signaled DONE)');
                    }
                }

                // Step 4: Run test command
                if (this.options.testCommand) {
                    const testResult = await this.runTestCommand();
                    if (testResult.success) {
                        return this.complete(true, 'All tests pass!');
                    }
                    this.lastError = testResult.error;
                }

                // Small delay before next iteration
                await this.sleep(1000);
            }

            // Max iterations reached
            return this.complete(false, `Max iterations (${this.options.maxIterations}) reached`);

        } catch (error) {
            this.output.appendLine(`[Ralph] Error: ${error.message}`);
            return this.complete(false, error.message);
        } finally {
            this.stopAutoAccept();
            this.isRunning = false;
        }
    }

    /**
     * Complete the loop
     */
    complete(success, message) {
        this.isRunning = false;
        this.stopAutoAccept();

        this.output.appendLine('');
        this.output.appendLine('╔════════════════════════════════════════════════════════════╗');
        if (success) {
            this.output.appendLine('║  ✅ LOOP COMPLETE - SUCCESS                                ║');
        } else {
            this.output.appendLine('║  ❌ LOOP COMPLETE - FAILED                                 ║');
        }
        this.output.appendLine('╚════════════════════════════════════════════════════════════╝');
        this.output.appendLine(`Iterations: ${this.currentIteration}/${this.options.maxIterations}`);
        this.output.appendLine(`Result: ${message}`);

        const result = {
            success,
            message,
            iterations: this.currentIteration,
            maxIterations: this.options.maxIterations
        };

        this.onComplete(result);
        return result;
    }

    /**
     * Cancel the loop
     */
    cancel() {
        this.output.appendLine('[Ralph] Cancelling loop...');
        this.isRunning = false;
        this.stopAutoAccept();
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            currentIteration: this.currentIteration,
            maxIterations: this.options.maxIterations,
            lastError: this.lastError
        };
    }
}

module.exports = { RalphLoop };
