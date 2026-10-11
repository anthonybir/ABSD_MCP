# PR validation

Opening a PR does not require full local test suites or builds. Run focused checks for useful feedback and report failed, pending, and unrun checks honestly.

Before merge, `PR checks` must pass on the current candidate. It runs `pnpm test --run`, `pnpm test:security --run`, and `pnpm build` with Node.js 22 and pnpm 10.28.2. Tool changes must also preserve handler registration and validated file access. This workflow does not publish packages or change production.
