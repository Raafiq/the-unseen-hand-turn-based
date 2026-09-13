# Feature Specification: Scratch Calculator

**Feature Branch**: `999-scratch-converge`
**Status**: Draft

## Overview

A tiny arithmetic helper module used to probe Spec Kit convergence behaviour.

## User Scenarios & Testing

### User Story 1 - Basic arithmetic (P1)

A caller imports the module and performs arithmetic.

**Acceptance Scenarios**

1. **Given** two numbers, **When** the caller calls `add`, **Then** the sum is returned.
2. **Given** two numbers, **When** the caller calls `sub`, **Then** the difference `a - b` is returned.

## Requirements

- **FR-001**: The module MUST expose `add(a, b)` returning `a + b`.
- **FR-002**: The module MUST expose `sub(a, b)` returning `a - b`.
- **FR-003**: The module MUST expose `divide(a, b)` returning `a / b`, and MUST return `null` when `b` is `0`. It MUST NOT throw.

## Success Criteria

- **SC-001**: All three exported functions are covered by unit tests.
