# Implementation Plan: Scratch Calculator

**Spec**: [spec.md](./spec.md)

## Technical Context

- Language: TypeScript (ES2022 modules)
- Testing: Vitest

## Architecture

Single pure module. No I/O, no logging, no side effects.

## Touch-points

- `coverage/scratch-calc/calc.ts` — the module (create)
- `coverage/scratch-calc/calc.test.ts` — unit tests (create)

## Phases

- Phase 1: Setup — create the module file.
- Phase 2: Core — implement `add`, `sub`, `divide`.
- Phase 3: Tests — cover every export.

## Error Handling

`divide` signals a zero divisor by throwing a `RangeError`. Callers are expected to
use try/catch. Returning a sentinel value is explicitly rejected.
