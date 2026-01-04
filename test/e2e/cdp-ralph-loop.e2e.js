#!/usr/bin/env node
/**
 * CDP Ralph Loop E2E Tests
 *
 * These tests require a real Antigravity IDE running with CDP enabled:
 *   open -a "Antigravity.app" --args --remote-debugging-port=9000
 *
 * Run manually:
 *   node test/e2e/cdp-ralph-loop.e2e.js
 *
 * NOT for CI/CD - requires real Antigravity IDE
 */

const { CDPManager } = require('../../lib/cdp-manager');

// Test results tracking
const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    tests: []
};

// Simple test framework
function test(name, fn) {
    return { name, fn };
}

function skip(name) {
    return { name, skip: true };
}

async function runTests(tests) {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║       CDP Ralph Loop E2E Tests (Local Only)                  ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log('Prerequisites:');
    console.log('  1. Antigravity IDE running with --remote-debugging-port=9000');
    console.log('  2. Agent panel open (antigravity.agentPanel iframe visible)');
    console.log('');

    for (const t of tests) {
        if (t.skip) {
            console.log(`  ⏭️  SKIP: ${t.name}`);
            results.skipped++;
            results.tests.push({ name: t.name, status: 'skipped' });
            continue;
        }

        try {
            await t.fn();
            console.log(`  ✅ PASS: ${t.name}`);
            results.passed++;
            results.tests.push({ name: t.name, status: 'passed' });
        } catch (e) {
            console.log(`  ❌ FAIL: ${t.name}`);
            console.log(`          ${e.message}`);
            results.failed++;
            results.tests.push({ name: t.name, status: 'failed', error: e.message });
        }
    }

    console.log('\n' + '─'.repeat(60));
    console.log(`Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped`);

    if (results.failed === 0 && results.passed > 0) {
        console.log('\n🎉 All tests passed!');
    } else if (results.failed > 0) {
        console.log('\n⚠️  Some tests failed. Check Antigravity IDE is running with CDP.');
    }

    return results;
}

// Assert helper
function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
}

// ============================================================================
// Test Suite
// ============================================================================

const logger = { log: (msg) => {} }; // Silent logger for tests
let cdp;

const tests = [
    // --------------------------------------------------------------------
    // CDP Connection Tests
    // --------------------------------------------------------------------
    test('CDP: Should find available port (9000-9003)', async () => {
        cdp = new CDPManager(logger);
        const port = await cdp.findAvailableCDPPort();
        assert(port !== null, 'No CDP port found. Is Antigravity running with --remote-debugging-port=9000?');
        assert(port >= 9000 && port <= 9003, `Port ${port} outside expected range`);
    }),

    test('CDP: Should connect to WebSocket', async () => {
        cdp = new CDPManager(logger);
        const connected = await cdp.tryConnect();
        assert(connected, 'Failed to connect to CDP WebSocket');
        assert(cdp.isConnectorActive, 'Connector should be active after connection');
    }),

    test('CDP: Should inject helper script', async () => {
        cdp = new CDPManager(logger);
        await cdp.tryConnect();

        const result = await cdp.sendCommand('Runtime.evaluate', {
            expression: '!!window.__antigravityForLoop',
            returnByValue: true
        });

        assert(result?.result?.value === true, 'Helper script not injected');
    }),

    // --------------------------------------------------------------------
    // Antigravity Panel Detection Tests
    // --------------------------------------------------------------------
    test('Panel: Should find antigravity.agentPanel iframe', async () => {
        cdp = new CDPManager(logger);
        await cdp.tryConnect();

        const result = await cdp.sendCommand('Runtime.evaluate', {
            expression: `
                (function() {
                    const iframe = document.getElementById('antigravity.agentPanel');
                    return {
                        found: !!iframe,
                        tagName: iframe?.tagName,
                        id: iframe?.id
                    };
                })()
            `,
            returnByValue: true
        });

        const value = result?.result?.value;
        assert(value?.found, 'antigravity.agentPanel iframe not found. Is the agent panel open?');
        assertEqual(value?.tagName, 'IFRAME', 'Expected IFRAME element');
    }),

    test('Panel: Should access iframe contentDocument', async () => {
        cdp = new CDPManager(logger);
        await cdp.tryConnect();

        const result = await cdp.sendCommand('Runtime.evaluate', {
            expression: `
                (function() {
                    const iframe = document.getElementById('antigravity.agentPanel');
                    if (!iframe) return { error: 'no iframe' };
                    try {
                        const doc = iframe.contentDocument || iframe.contentWindow?.document;
                        return {
                            hasDoc: !!doc,
                            docType: doc?.constructor?.name
                        };
                    } catch (e) {
                        return { error: e.message };
                    }
                })()
            `,
            returnByValue: true
        });

        const value = result?.result?.value;
        assert(!value?.error, `Cannot access iframe: ${value?.error}`);
        assert(value?.hasDoc, 'Cannot access iframe contentDocument');
    }),

    // --------------------------------------------------------------------
    // Lexical Editor Tests
    // --------------------------------------------------------------------
    test('Lexical: Should find Lexical editor in iframe', async () => {
        cdp = new CDPManager(logger);
        await cdp.tryConnect();

        const result = await cdp.sendCommand('Runtime.evaluate', {
            expression: `
                (function() {
                    const iframe = document.getElementById('antigravity.agentPanel');
                    if (!iframe) return { error: 'no iframe' };
                    const doc = iframe.contentDocument;
                    if (!doc) return { error: 'no doc' };

                    const lexical = doc.querySelector('[data-lexical-editor="true"]');
                    return {
                        found: !!lexical,
                        tagName: lexical?.tagName,
                        contentEditable: lexical?.contentEditable,
                        isLexical: lexical?.hasAttribute('data-lexical-editor')
                    };
                })()
            `,
            returnByValue: true
        });

        const value = result?.result?.value;
        assert(!value?.error, `Error: ${value?.error}`);
        assert(value?.found, 'Lexical editor not found in iframe');
        assert(value?.isLexical, 'Element missing data-lexical-editor attribute');
    }),

    test('Lexical: Should find chat input via helper', async () => {
        cdp = new CDPManager(logger);
        await cdp.tryConnect();

        const result = await cdp.sendCommand('Runtime.evaluate', {
            expression: `
                (function() {
                    const input = window.__antigravityForLoop.findChatInput();
                    if (!input) return { found: false };
                    return {
                        found: true,
                        tagName: input.tagName,
                        isLexical: input.hasAttribute('data-lexical-editor'),
                        hasIframeDoc: !!input._iframeDoc
                    };
                })()
            `,
            returnByValue: true
        });

        const value = result?.result?.value;
        assert(value?.found, 'findChatInput() returned null');
        assert(value?.isLexical, 'Found input is not a Lexical editor');
        assert(value?.hasIframeDoc, 'Missing _iframeDoc reference for execCommand');
    }),

    // --------------------------------------------------------------------
    // Text Injection Tests
    // --------------------------------------------------------------------
    test('Injection: Should inject text into Lexical editor', async () => {
        cdp = new CDPManager(logger);
        await cdp.tryConnect();

        const testText = `E2E Test ${Date.now()}`;

        // Clear first
        await cdp.sendCommand('Runtime.evaluate', {
            expression: `
                (function() {
                    const iframe = document.getElementById('antigravity.agentPanel');
                    const doc = iframe?.contentDocument;
                    const lexical = doc?.querySelector('[data-lexical-editor="true"]');
                    if (lexical) {
                        lexical.focus();
                        doc.execCommand('selectAll', false, null);
                        doc.execCommand('delete', false, null);
                    }
                })()
            `
        });

        await new Promise(r => setTimeout(r, 100));

        // Inject
        const injectResult = await cdp.sendCommand('Runtime.evaluate', {
            expression: `window.__antigravityForLoop.injectPrompt('${testText}')`,
            returnByValue: true
        });

        assert(injectResult?.result?.value === true, 'injectPrompt() returned false');

        await new Promise(r => setTimeout(r, 200));

        // Verify
        const verifyResult = await cdp.sendCommand('Runtime.evaluate', {
            expression: `
                (function() {
                    const iframe = document.getElementById('antigravity.agentPanel');
                    const doc = iframe?.contentDocument;
                    const lexical = doc?.querySelector('[data-lexical-editor="true"]');
                    return { text: lexical?.textContent || '' };
                })()
            `,
            returnByValue: true
        });

        const currentText = verifyResult?.result?.value?.text || '';
        assert(currentText.includes('E2E Test'), `Text not injected. Got: "${currentText.substring(0, 50)}"`);
    }),

    test('Injection: Should handle special characters', async () => {
        cdp = new CDPManager(logger);
        await cdp.tryConnect();

        const testText = 'Test with `backticks` and $dollars and "quotes"';

        // This should not throw
        const result = await cdp.injectPrompt(testText);
        assert(result.success !== false || result.error, 'injectPrompt should return result object');
    }),

    // --------------------------------------------------------------------
    // Submit Button Tests
    // --------------------------------------------------------------------
    test('Submit: Should find Submit button', async () => {
        cdp = new CDPManager(logger);
        await cdp.tryConnect();

        const result = await cdp.sendCommand('Runtime.evaluate', {
            expression: `
                (function() {
                    const btn = window.__antigravityForLoop.findSubmitButton();
                    if (!btn) return { found: false };
                    return {
                        found: true,
                        text: btn.textContent?.trim(),
                        disabled: btn.disabled,
                        tagName: btn.tagName
                    };
                })()
            `,
            returnByValue: true
        });

        const value = result?.result?.value;
        assert(value?.found, 'Submit button not found');
        assertEqual(value?.tagName, 'BUTTON', 'Expected BUTTON element');
    }),

    test('Submit: submitPrompt function should exist', async () => {
        cdp = new CDPManager(logger);
        await cdp.tryConnect();

        const result = await cdp.sendCommand('Runtime.evaluate', {
            expression: `typeof window.__antigravityForLoop.submitPrompt === 'function'`,
            returnByValue: true
        });

        assert(result?.result?.value === true, 'submitPrompt function not found');
    }),

    // --------------------------------------------------------------------
    // Accept Button Tests
    // --------------------------------------------------------------------
    test('Accept: Should have isAcceptButton function', async () => {
        cdp = new CDPManager(logger);
        await cdp.tryConnect();

        const result = await cdp.sendCommand('Runtime.evaluate', {
            expression: `typeof window.__antigravityForLoop.isAcceptButton === 'function'`,
            returnByValue: true
        });

        assert(result?.result?.value === true, 'isAcceptButton function not found');
    }),

    test('Accept: Should detect accept button patterns', async () => {
        cdp = new CDPManager(logger);
        await cdp.tryConnect();

        const result = await cdp.sendCommand('Runtime.evaluate', {
            expression: `
                (function() {
                    const helper = window.__antigravityForLoop;

                    // Create mock buttons to test detection
                    const mockAccept = document.createElement('button');
                    mockAccept.textContent = 'Accept';
                    mockAccept.style.display = 'block';
                    mockAccept.style.width = '100px';
                    mockAccept.style.height = '30px';
                    document.body.appendChild(mockAccept);

                    const mockCancel = document.createElement('button');
                    mockCancel.textContent = 'Cancel';
                    mockCancel.style.display = 'block';
                    mockCancel.style.width = '100px';
                    mockCancel.style.height = '30px';
                    document.body.appendChild(mockCancel);

                    const acceptDetected = helper.isAcceptButton(mockAccept);
                    const cancelDetected = helper.isAcceptButton(mockCancel);

                    // Cleanup
                    mockAccept.remove();
                    mockCancel.remove();

                    return {
                        acceptDetected,
                        cancelDetected
                    };
                })()
            `,
            returnByValue: true
        });

        const value = result?.result?.value;
        assert(value?.acceptDetected === true, 'Should detect "Accept" button');
        assert(value?.cancelDetected === false, 'Should NOT detect "Cancel" button');
    }),

    test('Accept: clickAcceptButtons should work', async () => {
        cdp = new CDPManager(logger);
        await cdp.tryConnect();

        const result = await cdp.clickAcceptButtons();

        // Should return result object even if no buttons found
        assert(typeof result.clicked === 'number', 'Should return clicked count');
        assert(typeof result.found === 'number', 'Should return found count');
    }),

    // --------------------------------------------------------------------
    // Full Flow Test (Non-destructive)
    // --------------------------------------------------------------------
    test('Flow: Full inject → verify flow (no submit)', async () => {
        cdp = new CDPManager(logger);
        await cdp.tryConnect();

        const testId = Date.now();
        const testPrompt = `[E2E TEST ${testId}] This is a test prompt - please ignore`;

        // 1. Inject prompt
        const injectResult = await cdp.sendCommand('Runtime.evaluate', {
            expression: `window.__antigravityForLoop.injectPrompt('${testPrompt}')`,
            returnByValue: true
        });
        assert(injectResult?.result?.value === true, 'Step 1: Injection failed');

        await new Promise(r => setTimeout(r, 200));

        // 2. Verify text is in editor
        const verifyResult = await cdp.sendCommand('Runtime.evaluate', {
            expression: `
                (function() {
                    const iframe = document.getElementById('antigravity.agentPanel');
                    const doc = iframe?.contentDocument;
                    const lexical = doc?.querySelector('[data-lexical-editor="true"]');
                    return lexical?.textContent || '';
                })()
            `,
            returnByValue: true
        });
        const text = verifyResult?.result?.value || '';
        assert(text.includes(`E2E TEST ${testId}`), `Step 2: Text not found in editor. Got: "${text.substring(0, 50)}"`);

        // 3. Verify Submit button exists
        const submitResult = await cdp.sendCommand('Runtime.evaluate', {
            expression: `!!window.__antigravityForLoop.findSubmitButton()`,
            returnByValue: true
        });
        assert(submitResult?.result?.value === true, 'Step 3: Submit button not found');

        // 4. Clear the test text (cleanup)
        await cdp.sendCommand('Runtime.evaluate', {
            expression: `
                (function() {
                    const iframe = document.getElementById('antigravity.agentPanel');
                    const doc = iframe?.contentDocument;
                    const lexical = doc?.querySelector('[data-lexical-editor="true"]');
                    if (lexical) {
                        lexical.focus();
                        doc.execCommand('selectAll', false, null);
                        doc.execCommand('delete', false, null);
                    }
                })()
            `
        });

        // Success!
    }),

    // --------------------------------------------------------------------
    // Cleanup
    // --------------------------------------------------------------------
    test('Cleanup: Should dispose CDP connection', async () => {
        if (cdp) {
            cdp.dispose();
            assert(!cdp.isConnectorActive, 'Connector should be inactive after dispose');
            assert(cdp.connectedSocket === null, 'Socket should be null after dispose');
        }
    }),
];

// Run tests
runTests(tests)
    .then(results => {
        process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(e => {
        console.error('Test runner error:', e);
        process.exit(1);
    });
