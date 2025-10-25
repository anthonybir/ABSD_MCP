# ABSD DevOps MCP Server

Local-first Model Context Protocol (MCP) server providing secure filesystem and terminal operations for AI assistants.

## Features

- **12 Powerful Tools**: 7 filesystem + 5 terminal operations
- **Filesystem Operations**: Read, write, list, create, search (ripgrep), edit (surgical)
- **Terminal Sessions**: Interactive REPLs (Python, Node.js) with smart prompt detection
- **MCP Primitives**: Resources (server state) + Prompts (workflow templates)
- **Security-First**: Path traversal protection, command filtering, input sanitization
- **Type-Safe**: Built with TypeScript strict mode and Zod schema validation
- **Local-Only**: Runs entirely on your machine via stdio transport

## Installation

### Using npx (Recommended)

```bash
npx @anthonybir/devops-mcp@latest
```

### Using npm

```bash
npm install -g @anthonybir/devops-mcp
```

### From Source

```bash
git clone https://github.com/anthonybir/ABSD_MCP.git
cd ABSD_MCP
pnpm install
pnpm build
```

## Configuration

Create a `config.json` file (or copy from `config.example.json`):

```json
{
  "allowedDirectories": [
    "/Users/yourusername/Projects",
    "/Users/yourusername/Documents"
  ],
  "blockedCommands": [
    "rm -rf /",
    "dd if=/dev/zero",
    "mkfs"
  ],
  "fileReadLineLimit": 2000,
  "fileWriteLineLimit": 75,
  "sessionTimeout": 1800000,
  "logLevel": "info"
}
```

### Configuration Options

- **allowedDirectories**: Array of absolute paths where file operations are permitted
- **blockedCommands**: Array of dangerous commands to reject
- **fileReadLineLimit**: Maximum lines to read per file operation (default: 1000)
- **fileWriteLineLimit**: Maximum lines to write per operation (default: 50)
- **sessionTimeout**: Process session timeout in milliseconds (default: 30 minutes)
- **logLevel**: Logging level (`debug` | `info` | `warn` | `error`)

## Claude Desktop Setup

Add to your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "absd-devops": {
      "command": "npx",
      "args": ["-y", "@anthonybir/devops-mcp@latest"],
      "env": {
        "ABSD_MCP_CONFIG": "/path/to/your/config.json"
      }
    }
  }
}
```

Restart Claude Desktop to activate the server.

## Available Tools

### Filesystem Tools (7)

- **read_file**: Read file contents with optional chunking and offset support (tail mode with negative offset)
- **write_file**: Create or overwrite files with append mode option
- **list_directory**: List directory contents recursively with depth control
- **create_directory**: Create directories with recursive parent creation
- **get_file_info**: Get detailed metadata (size, permissions, timestamps, line count)
- **search_files**: Search for patterns using ripgrep (regex, literal, file filtering)
- **edit_block**: Surgical text replacement with uniqueness validation

### Terminal Tools (5)

- **start_process**: Launch interactive terminal sessions (Python, Node.js, bash)
- **interact_with_process**: Send commands with smart REPL prompt detection
- **read_process_output**: Retrieve buffered output from background processes
- **list_sessions**: View all active terminal sessions with status
- **terminate_process**: Stop running sessions by PID

## MCP Primitives

### Resources

Expose server state and configuration:
- **config://absd-mcp/server**: Current server configuration (allowed directories, limits)
- **state://absd-mcp/sessions**: Active terminal sessions with status

### Prompts

Pre-configured templates for common workflows:
- **analyze_codebase**: Analyze project structure and tech stack
- **setup_python_env**: Interactive Python development environment
- **search_and_replace**: Pattern search with guided replacement

## Security

This MCP server implements multiple security layers:

1. **Path Validation**: All file operations validate against allowed directories
2. **Symlink Resolution**: Prevents symlink-based path traversal attacks
3. **Command Filtering**: Blocks dangerous terminal commands
4. **Input Sanitization**: Removes null bytes and control characters
5. **Zod Validation**: All tool inputs validated against strict schemas

## Development

### Running Tests

```bash
pnpm test                 # Run all tests
pnpm test:security       # Run security tests only
```

### Building

```bash
pnpm build               # Build for production
pnpm dev                 # Development mode with watch
```

### Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector pnpm dev
```

## Troubleshooting

### Server Not Appearing in Claude

1. Check that config.json path is correct in claude_desktop_config.json
2. Restart Claude Desktop completely
3. Check Claude's MCP logs for errors

### Permission Errors

Ensure all paths in `allowedDirectories` exist and are accessible by your user account.

### Command Blocked

If a legitimate command is being blocked, review the `blockedCommands` array in your config.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass (`pnpm test`)
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Author

Anthony Bir <anthonybir@aena.edu.py>

## Links

- [MCP Specification](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Issue Tracker](https://github.com/anthonybir/ABSD_MCP/issues)
