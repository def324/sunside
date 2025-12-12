# Sunside Agent Guide

This file describes conventions and expectations for automated agents working in this repository.

## Scope

These guidelines apply to the entire repository unless overridden by a more specific `AGENTS.md` in a subdirectory.

## Coding and structure

- Prefer **TypeScript** for all non-trivial code, including build scripts where practical.
- Keep core logic in `src/core/` UI-agnostic and easily testable.
- Keep Svelte components in `src/ui/` focused on presentation and interaction.
- Avoid introducing new dependencies unless they clearly reduce complexity and align with the project’s goals.

## Tooling

- Assume **Node 24.x LTS** when adding or modifying Node-based tooling.
- Use `npm`-style scripts as the primary interface:
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
  - `npm test`
- Keep configurations (Vite, Vitest, TypeScript) minimal and well-documented.

## Testing

- Add or update tests in `tests/` when modifying or adding core logic.
- Prefer small, focused unit tests over complex integration tests.
- Do not remove existing tests without a clear replacement or rationale.

## Documentation

- Keep `README.md` and `docs/*.md` consistent with the actual code and tooling.
- Update relevant documentation when changing behavior, dependencies, or data processing steps.

