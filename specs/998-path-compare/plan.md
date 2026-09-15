# Implementation Plan: Tag Parser

**Spec**: [spec.md](./spec.md)

## Summary

A pure parsing module with no I/O and no dependencies. Parsed keys and values are normalised by trimming surrounding whitespace.

## Technical Context

**Language/Version**: TypeScript 5.x (ES2022 modules)
**Primary Dependencies**: none
**Storage**: N/A
**Testing**: Vitest
**Target Platform**: Node and browser
**Project Type**: single module
**Performance Goals**: N/A
**Constraints**: pure functions only — no I/O, no logging, no module-level mutable state
**Scale/Scope**: two exported functions

## Project Structure

### Source Code (repository root)

- `coverage/scratch-tags/tags.ts` — the module
- `coverage/scratch-tags/tags.test.ts` — unit tests

## Phases

- Phase 1: Setup — create the module file.
- Phase 2: Core — implement `parseTag` and `formatTag`.
- Phase 3: Tests — cover both exports and the throwing path.
