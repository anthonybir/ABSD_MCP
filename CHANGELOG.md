# Changelog

All notable changes to ABSD DevOps MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
