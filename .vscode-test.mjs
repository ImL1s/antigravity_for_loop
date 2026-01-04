// @ts-check
import { defineConfig } from '@vscode/test-cli';

export default defineConfig([
    {
        label: 'integration',
        files: 'test/suite/**/*.test.js',
        version: 'stable',
        workspaceFolder: './',
        mocha: {
            ui: 'tdd',
            timeout: 60000
        }
    },
    {
        label: 'e2e',
        files: 'test/e2e/**/*.e2e.test.js',
        version: 'stable',
        workspaceFolder: './',
        mocha: {
            ui: 'tdd',
            timeout: 120000
        }
    }
]);
