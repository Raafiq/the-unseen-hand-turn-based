# Feature Specification: [FEATURE NAME]

**Feature Branch**: `[###-feature-name]`

**Created**: [DATE]

**Status**: Draft

**Input**: User description: "$ARGUMENTS"

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.

  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - [Brief Title] (Priority: P1)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently - e.g., "Can be fully tested by [specific action] and delivers [specific value]"]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 2 - [Brief Title] (Priority: P2)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 3 - [Brief Title] (Priority: P3)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

[Add more user stories as needed, each with an assigned priority]

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.

  CODE SKETCH CONVENTION: where an FR names a concrete data shape, signature,
  schema field, or algorithm, follow it with a fenced code block labelled
  `Sketch:`. The sketch is ILLUSTRATIVE, NOT NORMATIVE - it exists so the
  reviewer and the implementer argue about the same thing. Prose in the FR
  wins on any conflict with its sketch. Omit the block for FRs that are purely
  behavioural; a sketch invented to fill the slot is worse than no sketch.
-->

### Functional Requirements

- **FR-001**: System MUST [specific capability, e.g., "allow users to create accounts"]

  Sketch:

  ```ts
  // Illustrative only - the prose above is normative.
  ```

- **FR-002**: System MUST [specific capability, e.g., "validate email addresses"]
- **FR-003**: Users MUST be able to [key interaction, e.g., "reset their password"]
- **FR-004**: System MUST [data requirement, e.g., "persist user preferences"]
- **FR-005**: System MUST [behavior, e.g., "log all security events"]

*Example of marking unclear requirements:*

- **FR-006**: System MUST authenticate users via [NEEDS CLARIFICATION: auth method not specified - email/password, SSO, OAuth?]
- **FR-007**: System MUST retain user data for [NEEDS CLARIFICATION: retention period not specified]

### Key Entities *(include if feature involves data)*

- **[Entity 1]**: [What it represents, key attributes without implementation]
- **[Entity 2]**: [What it represents, relationships to other entities]

## Affected Files *(mandatory)*

<!--
  ACTION REQUIRED: enumerate every file the implementer will touch or must read.
  Verify each path EXISTS before listing it (a path that does not exist reads as
  a researched claim while proving nothing). Mark a file that does not yet exist
  as NEW explicitly. Cite the FR each row serves so a reviewer can spot an
  unserved requirement or an unjustified edit.

  Change kinds: NEW | MODIFY | REFERENCE (read-only - schema, doc, or precedent)
-->

### To be changed

| File | Change | Serves | Notes |
|---|---|---|---|
| `path/to/file.ts` | MODIFY | FR-001 | [what changes and why] |
| `path/to/new-file.ts` | NEW | FR-002 | [what it will contain] |

### To be referenced (read-only)

| File | Why it matters |
|---|---|
| `path/to/spec-or-schema.ts` | [the contract or precedent this feature must not break] |

### Deliberately NOT touched

| File | Why it is out of scope |
|---|---|
| `path/to/file.ts` | [the reason a reviewer might expect this and it is excluded] |

## Edge Cases & Open Items *(mandatory)*

### Edge Cases

<!--
  ACTION REQUIRED: replace with the real boundary conditions. Each entry states
  the condition AND the decided behaviour. An edge case with no decided
  behaviour is not an edge case - it is an Open Item, so move it below.
-->

| # | Condition | Decided behaviour |
|---|---|---|
| EC-1 | [boundary condition] | [what the system does] |
| EC-2 | [error scenario] | [what the system does] |

### Open Items — resolve before implementing

<!--
  ACTION REQUIRED: every question whose answer would change the implementation.
  This section is a BLOCKING gate: `/speckit-plan` should not run while an item
  here is marked BLOCKING and unresolved. An empty table is a valid answer, but
  say so explicitly rather than deleting the section.

  Severity: BLOCKING (cannot implement) | DECIDE (a default exists, confirm it)
  | TRACK (can ship without, must not be forgotten)
-->

| # | Question | Severity | Default if unanswered | Owner |
|---|---|---|---|---|
| OI-1 | [the question] | BLOCKING | [none - must be answered] | [who decides] |
| OI-2 | [the question] | DECIDE | [the assumed default] | [who decides] |

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: [Measurable metric, e.g., "Users can complete account creation in under 2 minutes"]
- **SC-002**: [Measurable metric, e.g., "System handles 1000 concurrent users without degradation"]
- **SC-003**: [User satisfaction metric, e.g., "90% of users successfully complete primary task on first attempt"]
- **SC-004**: [Business metric, e.g., "Reduce support tickets related to [X] by 50%"]

## Assumptions

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right assumptions based on reasonable defaults
  chosen when the feature description did not specify certain details.
-->

- [Assumption about target users, e.g., "Users have stable internet connectivity"]
- [Assumption about scope boundaries, e.g., "Mobile support is out of scope for v1"]
- [Assumption about data/environment, e.g., "Existing authentication system will be reused"]
- [Dependency on existing system/service, e.g., "Requires access to the existing user profile API"]
