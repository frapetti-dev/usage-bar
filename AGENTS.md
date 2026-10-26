# usage-bar

omp extension: below-editor widget showing subscription usage (remaining bars + reset countdown) for the session's active models.

## Commands
- `bun install`, `bun run typecheck`, `bun test` (Bun is package manager and test runner; no build/lint/format scripts).

## Conventions
- ESM, `node:` import prefix, tab indent, TypeScript `strict`. Zero runtime dependencies; omp host types are declared structurally in `src/host.ts`.
- Tests: `bun:test`, offline, hand-built fake host, no module mocks.
- Conventional Commits; never commit without permission. Dev workstation is Windows.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
