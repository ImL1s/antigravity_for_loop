// test/unit/detectTestCommand.test.js
// Unit tests for detectTestCommand function
// Simplified: only test core languages and priority logic

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Standalone detectTestCommand for testing
 * (Mirrors the logic in extension.js)
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

    // JavaScript / TypeScript
    if (exists('package.json')) {
        const pkg = readJson('package.json');
        if (pkg?.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
            detected.push({ cmd: 'npm test', type: 'npm', lang: 'JavaScript/TypeScript', priority: 10 });
        }
    }
    if (exists('deno.json') || exists('deno.jsonc')) {
        detected.push({ cmd: 'deno test', type: 'deno', lang: 'Deno', priority: 10 });
    }

    // Python
    if (exists('pyproject.toml') || exists('setup.py') || exists('requirements.txt')) {
        if (exists('pytest.ini') || exists('pyproject.toml')) {
            detected.push({ cmd: 'pytest', type: 'pytest', lang: 'Python', priority: 10 });
        } else {
            detected.push({ cmd: 'python -m pytest', type: 'python', lang: 'Python', priority: 8 });
        }
    }

    // Rust
    if (exists('Cargo.toml')) {
        detected.push({ cmd: 'cargo test', type: 'cargo', lang: 'Rust', priority: 10 });
    }

    // Go
    if (exists('go.mod')) {
        detected.push({ cmd: 'go test ./...', type: 'go', lang: 'Go', priority: 10 });
    }

    // Java/Kotlin
    if (exists('pom.xml')) {
        detected.push({ cmd: 'mvn test', type: 'maven', lang: 'Java/Kotlin', priority: 10 });
    }
    if (exists('build.gradle') || exists('build.gradle.kts')) {
        detected.push({ cmd: './gradlew test', type: 'gradle', lang: 'Java/Kotlin', priority: 10 });
    }

    // .NET
    if (findFile(/\.csproj$/) || findFile(/\.sln$/)) {
        detected.push({ cmd: 'dotnet test', type: 'dotnet', lang: '.NET', priority: 10 });
    }

    // Generic
    if (exists('Makefile')) {
        detected.push({ cmd: 'make test', type: 'make', lang: 'Make', priority: 6 });
    }

    if (detected.length === 0) return null;
    detected.sort((a, b) => b.priority - a.priority);
    return detected[0];
}

// Helper to create temporary directories
class TempProject {
    constructor() {
        this.basePath = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-test-'));
    }

    createFile(relativePath, content = '') {
        const filePath = path.join(this.basePath, relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content);
        return this;
    }

    cleanup() {
        fs.rmSync(this.basePath, { recursive: true, force: true });
    }

    get path() {
        return this.basePath;
    }
}

describe('detectTestCommand', function() {
    let project;

    afterEach(function() {
        if (project) {
            project.cleanup();
            project = null;
        }
    });

    describe('Core Languages', function() {
        it('should detect npm test', function() {
            project = new TempProject();
            project.createFile('package.json', JSON.stringify({
                scripts: { test: 'jest' }
            }));
            const result = detectTestCommand(project.path);
            assert.strictEqual(result.cmd, 'npm test');
        });

        it('should detect pytest', function() {
            project = new TempProject();
            project.createFile('pyproject.toml', '[tool.pytest]');
            const result = detectTestCommand(project.path);
            assert.strictEqual(result.cmd, 'pytest');
        });

        it('should detect cargo test', function() {
            project = new TempProject();
            project.createFile('Cargo.toml', '[package]');
            const result = detectTestCommand(project.path);
            assert.strictEqual(result.cmd, 'cargo test');
        });

        it('should detect go test', function() {
            project = new TempProject();
            project.createFile('go.mod', 'module test');
            const result = detectTestCommand(project.path);
            assert.strictEqual(result.cmd, 'go test ./...');
        });

        it('should detect mvn test', function() {
            project = new TempProject();
            project.createFile('pom.xml', '<project/>');
            const result = detectTestCommand(project.path);
            assert.strictEqual(result.cmd, 'mvn test');
        });

        it('should detect dotnet test', function() {
            project = new TempProject();
            project.createFile('App.csproj', '<Project/>');
            const result = detectTestCommand(project.path);
            assert.strictEqual(result.cmd, 'dotnet test');
        });
    });

    describe('Priority Logic', function() {
        it('should prefer npm test over Makefile', function() {
            project = new TempProject();
            project.createFile('package.json', JSON.stringify({
                scripts: { test: 'jest' }
            }));
            project.createFile('Makefile', 'test:');
            const result = detectTestCommand(project.path);
            assert.strictEqual(result.cmd, 'npm test');
        });

        it('should use Makefile as fallback', function() {
            project = new TempProject();
            project.createFile('Makefile', 'test:');
            const result = detectTestCommand(project.path);
            assert.strictEqual(result.cmd, 'make test');
        });
    });

    describe('Edge Cases', function() {
        it('should return null for empty directory', function() {
            project = new TempProject();
            const result = detectTestCommand(project.path);
            assert.strictEqual(result, null);
        });

        it('should skip default npm test placeholder', function() {
            project = new TempProject();
            project.createFile('package.json', JSON.stringify({
                scripts: { test: 'echo "Error: no test specified" && exit 1' }
            }));
            const result = detectTestCommand(project.path);
            assert.strictEqual(result, null);
        });

        it('should handle malformed JSON', function() {
            project = new TempProject();
            project.createFile('package.json', 'not json');
            const result = detectTestCommand(project.path);
            assert.strictEqual(result, null);
        });
    });
});
