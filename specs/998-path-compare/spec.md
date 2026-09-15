# Feature Specification: Tag Parser

**Feature Branch**: `998-path-compare`
**Created**: 2026-09-13
**Status**: Implemented

## Overview

A small module that parses and formats `key:value` tag strings.

## User Scenarios & Testing

### User Story 1 - Parse a tag (P1)

A caller turns a tag string into a structured object and back again.

**Acceptance Scenarios**

1. **Given** the string `  env : prod  `, **When** the caller calls `parseTag`, **Then** `{ key: 'env', value: 'prod' }` is returned.
2. **Given** a string with no colon, **When** the caller calls `parseTag`, **Then** a `TypeError` is thrown.
3. **Given** a `Tag`, **When** the caller calls `formatTag`, **Then** `key:value` is returned.

## Requirements

- **FR-001**: The module MUST expose `parseTag(input)` which splits `input` on the **first** `:` and returns `{ key, value }`. A later `:` belongs to the value. The key and value MUST have surrounding whitespace trimmed.
- **FR-002**: `parseTag` MUST throw a `TypeError` when `input` contains no `:`.
- **FR-003**: The module MUST expose `formatTag(tag)` returning `` `${key}:${value}` ``.

## Contract

The module exposes exactly this surface:

```ts
export interface Tag {
  key: string;
  value: string;
}

export function parseTag(input: string): Tag;
export function formatTag(tag: Tag): string;
```

## Success Criteria

- **SC-001**: `formatTag(parseTag(s)) === s` holds for every well-formed `s` whose key and value carry no surrounding whitespace.
