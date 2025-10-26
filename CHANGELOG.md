# Changelog

All notable changes to ABSD DevOps MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.5] - 2025-10-26

### 🐛 Bug Fixes
- **Fixed "unsupported format" error in MCP clients:** `start_process` now inlines JSON metadata within text block
  - Removed separate `json` content block that caused errors in Claude/Codex
  - JSON metadata now embedded in text: `Metadata (JSON): { pid, command, cwd, state }`
  - Clients can parse PID from text without requiring `json` content type support
  - Updated [src/tools/terminal/process.ts](src/tools/terminal/process.ts:76-81) to inline JSON with pretty-printing
  - Removed unused `JsonContentSchema` from [src/types/config.ts](src/types/config.ts)

### 🎯 Impact
- **MCP compatibility improved:** Works with all MCP clients that only support `text` and `image` content types
- **No functionality lost:** Same machine-readable data, just delivered in universally-supported format
- **Better UX:** PID and metadata visible in human-readable output for easy copy/paste

### 🧪 Testing
- Core tests passing on Node 20: **100 passed**, 17 skipped
- 2 pre-existing flaky tests in `read-multiple.test.ts` (unrelated to this fix)

---

## [0.3.4] - 2025-10-26

### 🐛 Bug Fixes
- **Fixed usage stats crash:** SessionManager now exposes `listSessions()` method (alias for `listAll()`)
  - `get_usage_stats` tool no longer throws "listSessions is not a function" error
  - Tool now correctly reports active sessions and searches
  - Added method in [src/tools/terminal/session.ts](src/tools/terminal/session.ts:84-91)

### ✨ Enhancements
- **Machine-readable data from `start_process`:** Tool now returns structured JSON payload
  - Returns both human-readable text AND JSON object: `{ pid, command, cwd, state }`
  - Resolves "PID not found" failures when clients parse tool responses
  - Clients like Claude and Codex can now reliably extract process metadata
  - Added `JsonContentSchema` to support JSON payloads in tool results ([src/types/config.ts](src/types/config.ts:34-40))
  - Updated [src/tools/terminal/process.ts](src/tools/terminal/process.ts:68-88)

### 🔧 Configuration
- **Unrestricted filesystem mode now supported:** `allowedDirectories` can be set to empty array (`[]`)
  - Enables full filesystem access on trusted local machines
  - Server still requires `blockedCommands` to be populated (refuses to start if both arrays are empty)
  - Removed `.min(1)` validation from ConfigSchema ([src/types/config.ts](src/types/config.ts:4))
  - Added "Enable Full Filesystem Access (Advanced)" section to README with setup instructions

### 📚 Documentation
- Added v0.3.3 compatibility notice in README (Node ≥20 requirement)
- Added Codex CLI Setup (TOML) section with example configuration
- Moved local development guides (AGENTS.md, CLAUDE.md, absd-mcp-devops-engineering-guide.md) to `.gitignore`
- Repository stays clean while preserving local documentation

### 🧪 Testing
- All tests passing on Node 20: **102 passed**, 17 skipped (119 total)
- Verified with: `. ~/.nvm/nvm.sh && nvm use 20 && pnpm test`

---

## [0.3.3] - 2025-10-26

### 🔧 Compatibility
- **Node.js 20 compatibility:** Lowered Node.js requirement from >=22.0.0 to >=20.0.0
  - Rebuilt with Node 20.19.3 for Claude Desktop compatibility
  - node-pty now compiled for NODE_MODULE_VERSION 115 (Node 20)
  - Fixes MODULE_VERSION mismatch error when loaded by Claude Desktop
  - **Important:** Existing global installations must be updated to v0.3.3

### 🐛 Bug Fixes
- **Fixed version reporting in `get_config` tool**
  - Was hardcoded to "0.3.0", now correctly reports actual package version
  - Created [src/version.ts](src/version.ts) to dynamically export `SERVER_VERSION` from package.json
  - Updated [src/server.ts](src/server.ts) and [src/tools/meta/get-config.ts](src/tools/meta/get-config.ts) to use `SERVER_VERSION`
  - **Single source of truth:** Version now defined only in package.json - prevents version drift

### 📦 Migration
Global installation users:
1. Update package: `npm install -g @anthonybir/devops-mcp@0.3.3`
2. Restart Claude Desktop (File > Quit Claude Desktop, then relaunch)
3. Verify connection in Claude Desktop MCP servers panel
4. Test with: "Use get_config to show server version" → should show "0.3.3"

### 🧪 Testing
- All tests passing on Node 20: **102 passed**, 17 skipped (119 total)
- Verified node-pty compiled for NODE_MODULE_VERSION 115
- Updated test to expect dynamic version from package.json

---

## [0.3.2] - 2025-01-26

### 🐛 Critical Bug Fixes
- **Fixed REPL interaction hang:** Changed `\r` to `\n` for proper REPL input handling ([src/tools/terminal/interact.ts](src/tools/terminal/interact.ts:94))
  - Python, Node.js, and bash REPLs now work correctly without hanging
  - Fixes issue where interactive processes would timeout waiting for response
- **Expanded REPL prompt detection:** Added 6 new prompt patterns (7 → 13 total)
  - Added support for: IPython/Jupyter (`In [N]:`, `Out[N]:`), Ruby IRB, SQL shells (mysql>, psql>, sqlite>), PowerShell, bash with trailing space
  - Improved reliability across different shell configurations

### 🔒 Security Improvements
- **Expanded blocked commands:** 6 → 31 commands blocked by default
  - **Destructive disk operations (10):** `fdisk`, `parted`, `mkswap`, `swapon`, `mount`, `umount`, `mkfs.ext4`, `mkfs.xfs`, `mkfs.btrfs`, `wipefs`
  - **Network/System (8):** `iptables -F`, `systemctl stop`, `systemctl disable`, `kill -9 1`, `pkill -9`, `killall`, `halt`, `poweroff`
  - **Package managers (5):** `apt-get remove --purge`, `yum remove`, `dnf remove`, `pacman -R`, `brew uninstall --force`
  - **Data destruction (2):** `shred`, `> /dev/sda`
- **Action required:** Existing users should review their [config.json](config.example.json) and merge new blocked commands from [config.example.json](config.example.json)

### ✨ Features
- **New tool: `get_usage_stats`** - Track server uptime and tool usage
  - In-memory tracking (resets on server restart)
  - Shows total calls, top 5 most-used tools, active sessions/searches
  - Only counts successful tool executions (errors not tracked)
  - Tool count: 21 → 22 (2 meta tools: `get_config` + `get_usage_stats`)
- **Better search UX:** Default context lines changed from 0 to 3
  - Search results now show 3 lines of surrounding context by default
  - Override with `contextLines: 0` for terse output with no context
  - Improves readability of search results
- **Enhanced debug logging:** Added structured logging for REPL prompt detection
  - Helps troubleshoot interactive process issues
  - Shows matched prompt patterns and detection state

### 📝 Breaking Changes
- **Search results now show 3 lines of context by default**
  - Previous behavior: `contextLines: 0` (no surrounding context)
  - New behavior: `contextLines: 3` (3 lines before/after matches)
  - To restore old behavior: Set `contextLines: 0` in `start_search` calls
  - Rationale: Better UX - context makes search results more useful

### 🧪 Testing
- Added comprehensive REPL regression tests (15 tests, currently skipped pending integration test implementation)
- Added usage stats tests (15 tests covering tracking, ranking, uptime)
- All tests passing: **102 passed**, 17 skipped (119 total)
- Test coverage improved for terminal interactions and usage tracking

### 📚 Documentation
- Updated README with migration path for v0.3.2 security changes
- Documented `contextLines` override behavior in search tools section
- Added CHANGELOG.md to track version history
- Updated tool count and meta tools section (21 → 22 tools)

### 🔧 Technical Details
- Refactored tool execution tracking in [src/server.ts](src/server.ts) to count successful calls only
- Created [UsageTracker](src/tools/meta/usage-stats.ts) class for in-memory statistics
- Improved REPL detection with `strip-ansi` integration for reliable pattern matching
- Updated auto-generated config in [scripts/register-claude-config.ts](scripts/register-claude-config.ts) with all 31 blocked commands

---

## [0.3.1] - 2025-01-25

### ✨ Features
- **New tool: `move_file`** - Move/rename files and directories
  - Dual-path SecurityValidator checks (source + destination)
  - Cross-directory moves, renames, and overwrites
  - Supports both files and directories
  - Tool count: 20 → 21 (9 filesystem + 4 search + 7 terminal + 1 meta)

### 🧪 Testing
- Added comprehensive `move_file` tests (11 tests)
- Fixed macOS /tmp symlink issue in test setup
- All tests passing: 87 passed, 1 skipped

---

## [0.3.0] - 2025-01-25

### ✨ Features
- **Streaming search** with session management
  - `start_search`, `get_more_search_results`, `stop_search`, `list_searches`
  - Background ripgrep with pagination and early termination
- **Process management tools**
  - `list_processes`: List system processes (cross-platform)
  - `kill_process`: Kill processes with confirmation token validation
- **strip-ansi integration** for ANSI-aware REPL prompt detection
- **Desktop Commander feature parity** achieved

### 🔒 Security
- Confirmation tokens for dangerous operations (`kill_process`)
- Path validation for all filesystem operations

### 🧪 Testing
- Test suite: 76 tests (1 skipped)
- Security tests for path validation and command filtering

---

## [0.2.0] - 2025-01-24

### ✨ Features
- **Config exposure** via `get_config` meta tool
- **Unrestricted access mode** with warnings (empty `allowedDirectories`)
- **Multi-file read** with `read_multiple_files` (size caps: 1MB/file, 5MB total)
- **Image support** with MCP native ImageContent
- **URL fetching** with configurable timeout and denylist

### 🔒 Security
- URL denylist protection (blocks localhost by default)
- Size limits on multi-file operations

---

## [0.1.0] - 2025-01-23

### ✨ Features
- Initial MCP server implementation
- Core filesystem tools: read, write, list, create, search, edit
- Terminal session management
- Security-first architecture with path validation
- Blocked commands filtering

### 🔒 Security
- SecurityValidator with path traversal protection
- Configurable allowed directories
- Blocked commands list (6 default dangerous commands)

### 🧪 Testing
- Unit tests for security validator
- Integration tests for filesystem operations
