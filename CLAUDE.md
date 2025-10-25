# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ABSD DevOps MCP Server** - A security-first Model Context Protocol (MCP) server providing local filesystem and terminal operations for AI assistants. Built with TypeScript, runs locally via stdio transport.

**Stack**: TypeScript (strict mode) + Node.js 22+ + `@modelcontextprotocol/sdk` + Zod + node-pty + pino

## Development Commands

```bash
# Development
pnpm dev                    # Run server in watch mode with tsx
pnpm build                  # Build for production (tsup)

# Testing
pnpm test                   # Run all tests (vitest)
pnpm test:security          # Run security tests only

# Publishing
pnpm prepublishOnly         # Runs tests + build (automatic)
```

## Architecture

### Core Structure

```
src/
├── index.ts              # Entry point + stdio transport setup
├── server.ts             # MCP server creation + tool registration
├── tools/
│   ├── filesystem/       # File operations (read, write, list)
│   └── terminal/         # Terminal session management (future)
├── security/
│   ├── validator.ts      # Path validation + command filtering
│   └── config.ts         # Configuration loading + validation
├── types/
│   └── config.ts         # Zod schemas + TypeScript types
└── utils/
    ├── logger.ts         # Structured logging (pino)
    └── errors.ts         # MCP error wrappers
```

### Key Design Patterns

**1. Security-First Architecture**
- All file operations MUST validate paths through `SecurityValidator.validatePath()`
- Path validation resolves symlinks and prevents path traversal
- Blocked commands list prevents dangerous terminal operations
- Input sanitization removes null bytes and control characters

**2. Tool Registration Pattern**
```typescript
// Each tool exports:
export const toolNameToolDefinition = {
  name: 'tool_name',
  description: '...',
  inputSchema: ToolNameSchema,  // Zod schema
};

export async function toolNameTool(
  args: ToolNameArgs,
  validator: SecurityValidator,
  logger: Logger,
  config?: Config
): Promise<ToolResult>
```

**3. Error Handling**
- Always use `wrapError()` from `utils/errors.ts` to convert errors to `McpError`
- Tools return `ToolResult` with error messages in content, never throw to MCP layer
- Log errors with structured context before returning

**4. Configuration**
- Config loaded via `loadConfig()` from `security/config.ts`
- Environment variable `ABSD_MCP_CONFIG` points to JSON config file
- All config validated with Zod schemas at startup

## Critical Security Requirements

### Path Validation Flow
```typescript
// ALWAYS follow this pattern for file operations:
const validation = validator.validatePath(args.path);
if (!validation.valid) {
  return {
    content: [{ type: 'text', text: `Error: ${validation.error}` }],
  };
}
const validPath = validation.resolvedPath!;
// Now use validPath for filesystem operations
```

**Why this matters:**
- Resolves symlinks to prevent symlink-based path traversal
- Validates against `allowedDirectories` whitelist
- Normalizes paths (handles `..`, `~`, relative paths)

### Blocked Patterns
- Never weaken TypeScript strict mode settings
- Never bypass path validation
- Never skip Zod schema validation
- Never log sensitive data (paths are OK, content is not)

## Testing Strategy

### Security Tests (Priority)
Located in `tests/security/validator.test.ts`
- Path traversal attempts (`../../../etc/passwd`)
- Symlink validation
- Command injection patterns
- Input sanitization

### Unit Tests
- Individual tool functions
- SecurityValidator methods
- Config loading and validation

### Integration Tests
- End-to-end tool execution
- MCP server request handling

## Configuration

### Example config.json
```json
{
  "allowedDirectories": ["/Users/user/Projects"],
  "blockedCommands": ["rm -rf /", "dd if=/dev/zero"],
  "fileReadLineLimit": 2000,
  "fileWriteLineLimit": 75,
  "sessionTimeout": 1800000,
  "logLevel": "info"
}
```

### Claude Desktop Integration
```json
{
  "mcpServers": {
    "absd-devops": {
      "command": "npx",
      "args": ["-y", "@absd/devops-mcp@latest"],
      "env": {
        "ABSD_MCP_CONFIG": "/path/to/config.json"
      }
    }
  }
}
```

## Implementation Notes

### Adding New Tools

1. Create tool file in `src/tools/[category]/[toolname].ts`
2. Define Zod schema for arguments
3. Export tool definition and implementation function
4. Register in `src/server.ts` in both `ListToolsRequestSchema` and `CallToolRequestSchema` handlers
5. Add tests in `tests/[category]/[toolname].test.ts`

### File Operations
- Support chunking via `offset` and `length` parameters
- Negative offset = tail behavior (read from end)
- Warn when operations exceed `fileReadLineLimit` or `fileWriteLineLimit`
- Always return line counts and offsets in structured responses

### Logging Conventions
- Use structured logging: `logger.info({ context }, 'message')`
- Log tool calls with `{ tool, args }` context
- Log errors with `{ error, tool, args }` context
- Never log file contents, only metadata

## ES Module Notes

- This is a pure ESM project (`"type": "module"` in package.json)
- All imports MUST include `.js` extension (even for `.ts` files)
- Use `import type` for type-only imports
- Build target: ES2022

## Spanish Language Context

Error messages and validation errors use Spanish (`es-ES`):
- "Path fuera de directorios permitidos"
- "Comando bloqueado"
- "Al menos un directorio permitido requerido"

Maintain this convention when adding new validation messages.
