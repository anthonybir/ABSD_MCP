# Repository Guidelines

## Project Structure & Module Organization
- Source: `src/` (ESM TypeScript). Entry: `src/index.ts`; server and tool wiring in `src/server.ts`.
- Tools: `src/tools/{filesystem,terminal}/` with one file per tool (e.g., `read.ts`, `write.ts`).
- Security & Config: `src/security/` (validator, config loader) and `src/types/` (Zod schemas).
- Utilities: `src/utils/` (logger, errors, retry helpers).
- Tests: `tests/{unit,security,integration}/` using Vitest. Build artifacts in `dist/`.

## Build, Test, and Development Commands
- `pnpm dev` – Run in watch mode via `tsx` (stdio transport).
- `pnpm build` – Bundle with `tsup` to `dist/` (ESM, minified, clean).
- `pnpm test` – Run all tests with Vitest.
- `pnpm test:security` – Run only security-focused tests.
- Example local inspection: `npx @modelcontextprotocol/inspector pnpm dev`.

## Coding Style & Naming Conventions
- Language: TypeScript (Node >= 22, ESM). Indent with 2 spaces.
- File names: lowercase kebab for modules (`read.ts`), PascalCase for types only if needed.
- Prefer named exports; keep each tool’s Zod `inputSchema` and `definition` in the same file.
- Use `import type` for type-only imports. Log with `pino` via `createLogger`.

## Testing Guidelines
- Framework: Vitest. Place tests under `tests/`, name as `*.test.ts` (e.g., `tests/security/validator.test.ts`).
- Required: all tests green before merging; include tests for new tools and security boundaries.
- Run fast locally: `pnpm test`; focus set: `pnpm test:security` for validator/guard changes.

## Commit & Pull Request Guidelines
- Commits: Conventional Commits (e.g., `feat:`, `fix:`, `docs:`, `test:`, `chore:`). Example in history: `feat: Initial MCP server implementation`.
- PRs must include: concise description, linked issue, before/after snippets or logs, and notes on security impact.
- Keep changes scoped; avoid unrelated refactors. Update README/config examples when behavior changes.

## Security & Configuration Tips
- Never bypass `SecurityValidator`. Validate paths before file ops; validate inputs with Zod.
- Config: copy `config.example.json` and set `ABSD_MCP_CONFIG=/abs/path/config.json`.
- Ensure `allowedDirectories` are absolute; review `blockedCommands`. Respect limits: `fileReadLineLimit`/`fileWriteLineLimit`.
- When adding tools: register in `server.ts`, return `ToolResult`, and add tests in `tests/`.

