# ABSD DevOps MCP Server

Local-first Model Context Protocol (MCP) server providing secure filesystem and terminal operations for AI assistants.

## Features

- **14 Powerful Tools**: 8 filesystem + 5 terminal + 1 meta operations
- **Filesystem Operations**: Read (files/URLs/images), write, list, create, search (ripgrep), edit (surgical), multi-read
- **Terminal Sessions**: Interactive REPLs (Python, Node.js) with smart prompt detection
- **Image Support**: MCP native ImageContent for PNG, JPEG, GIF, WebP, BMP (SVG as text for security)
- **URL Fetching**: HTTP/HTTPS with configurable timeout and denylist protection
- **MCP Primitives**: Resources (server state) + Prompts (workflow templates)
- **Security-First**: Path traversal protection, command filtering, input sanitization, unrestricted mode with warnings
- **Type-Safe**: Built with TypeScript strict mode and Zod schema validation
- **Local-Only**: Runs entirely on your machine via stdio transport

## Installation

### Quick Start (Recommended)

```bash
# 1. Install globally
npm install -g @anthonybir/devops-mcp

# 2. Run setup (interactive)
absd-mcp-setup
```

The setup command will:
- ✅ Add MCP server to Claude Desktop config
- ✅ Create default config at `~/ABSD_MCP/config.json`
- ✅ Backup your existing Claude config with timestamp

**⚠️ Security Warning:** Default config allows access to your entire home directory.
Review and restrict `allowedDirectories` immediately after setup.

**Next steps:**
1. Review config: `~/ABSD_MCP/config.json` (macOS) or `%USERPROFILE%\ABSD_MCP\config.json` (Windows)
2. Restrict `allowedDirectories` to only needed paths
3. Restart Claude Desktop

### Uninstall

```bash
# Remove from Claude Desktop config
absd-mcp-unregister

# Uninstall package
npm uninstall -g @anthonybir/devops-mcp
```

### Manual Setup

If you prefer manual configuration, see [Claude Desktop Setup](#claude-desktop-setup) below.

### Using npx (No Installation)

```bash
npx @anthonybir/devops-mcp@latest
```

Requires manual Claude Desktop configuration (see below).

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
  "logLevel": "info",
  "urlDenylist": ["localhost", "127.0.0.1", "0.0.0.0", "::1"],
  "urlTimeout": 10000
}
```

### Configuration Options

- **allowedDirectories**: Array of absolute paths where file operations are permitted (empty array = unrestricted access)
- **blockedCommands**: Array of dangerous commands to reject (default: [])
- **fileReadLineLimit**: Maximum lines to read per file operation (default: 1000)
- **fileWriteLineLimit**: Maximum lines to write per operation (default: 50)
- **sessionTimeout**: Process session timeout in milliseconds (default: 1800000 = 30 minutes)
- **logLevel**: Logging level (`debug` | `info` | `warn` | `error`) (default: `info`)
- **urlDenylist**: Array of hostnames to block for URL fetching (default: `["localhost", "127.0.0.1", "0.0.0.0", "::1"]`)
- **urlTimeout**: URL fetch timeout in milliseconds (default: 10000 = 10 seconds)

### Path Formatting

**Windows users:** Use forward slashes in JSON to avoid escaping issues:
- ✅ `"C:/Users/yourusername/Projects"`
- ✅ `"C:\\\\Users\\\\yourusername\\\\Projects"` (double-escaped backslashes)
- ❌ `"C:\Users\yourusername\Projects"` (breaks JSON)

**macOS/Linux users:** Standard absolute paths:
- ✅ `"/Users/yourusername/Projects"`
- ✅ `"/home/username/projects"`

## Claude Desktop Setup

**Config File Locations:**
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

### Option 1: Using Installed Package (Offline-Compatible)

If you installed globally, reference the bin entry:

```json
{
  "mcpServers": {
    "absd-devops": {
      "command": "absd-mcp",
      "args": [],
      "env": {
        "ABSD_MCP_CONFIG": "/path/to/your/config.json"
      }
    }
  }
}
```

### Option 2: Using npx (Online-Only)

If using npx or want latest version:

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

**ABSD_MCP_CONFIG paths:**
- **macOS:** Use full path like `/Users/yourusername/ABSD_MCP/config.json`
- **Windows:** Use forward slashes like `C:/Users/yourusername/ABSD_MCP/config.json`

Restart Claude Desktop to activate the server.

## Available Tools

### Filesystem Tools (8)

- **read_file**: Read files or URLs with image support (PNG, JPEG, GIF, WebP, BMP), optional chunking, and offset support (SVG treated as text for security)
- **read_multiple_files**: Read multiple files simultaneously with size caps (1MB/file, 5MB total)
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

### Meta Tools (1)

- **get_config**: Get current server configuration (read-only) with security status and metadata

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
