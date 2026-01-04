// wdio.conf.js
// WebdriverIO configuration for E2E tests with VSCode
// Using VSCode Desktop mode with insiders for better arm64 compatibility

const path = require('path');

exports.config = {
    // ====================
    // Output Directory
    // ====================
    outputDir: 'test-results/wdio',

    // ====================
    // Runner Configuration
    // ====================
    runner: 'local',

    // ==================
    // Specify Test Files
    // ==================
    specs: [
        './test/e2e/statusBar.e2e.js'
    ],

    // ============
    // Capabilities - Desktop VSCode mode with insiders
    // ============
    capabilities: [{
        browserName: 'vscode',
        browserVersion: 'insiders',  // Use insiders for latest arm64 fixes
        'wdio:vscodeOptions': {
            extensionPath: __dirname,
            userSettings: {
                'editor.fontSize': 14
            },
            // Skip some launch args that may cause issues
            vscodeArgs: {
                'disable-extensions': true,
                'skip-welcome': true,
                'skip-release-notes': true
            }
        }
    }],

    // ===================
    // Services
    // ===================
    services: ['vscode'],

    // ===================
    // Test Configurations
    // ===================
    logLevel: 'info',
    bail: 0,
    waitforTimeout: 30000,  // Increased timeout
    connectionRetryTimeout: 180000,
    connectionRetryCount: 3,

    // ==============
    // Test Framework
    // ==============
    framework: 'mocha',
    mochaOpts: {
        ui: 'bdd',
        timeout: 180000  // 3 minute timeout for slow startup
    },

    // =====
    // Hooks
    // =====
    beforeSession: function () {
        console.log('Starting E2E test session (VSCode Insiders Desktop mode)...');
    },

    afterSession: function () {
        console.log('E2E test session completed.');
    }
};
