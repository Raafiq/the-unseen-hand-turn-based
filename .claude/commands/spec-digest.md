---
description: Digest a Speckit spec into a plain-words summary file
argument-hint: [path to spec.md]
allowed-tools: Read, Write, Glob
---

Read the spec at $1. If no path given, use the spec.md of the current feature
branch under .specify/ conventions.

Write the result to `spec-digest.md` in the same folder as the spec. Overwrite
if it exists. Output nothing to chat except the file path.

File contents — these four parts only. No prose, no preamble, no findings.

## <feature name>
One sentence: what this feature does.

| § | In plain words | From |
|---|---|---|

| Edge case | Behaviour | § |
|---|---|---|

| Open item | § |
|---|---|

## Code
For each code block in the spec, in spec order:

<details><summary>§2.2 — retries 3 times before failing</summary>

```ts
<the code block, verbatim, unedited>
```
</details>

Rules:
- Row order follows the spec's order. `§` = section anchor so I can jump back.
- `From` = `prose` or `code`. For code blocks, state the behaviour the code
  produces, not what the code is.
- Max 12 words per cell. Plain words. No jargon unless it's in the code.
- Edge cases: error paths, empty/zero/limit states, conflicts. Include ones
  implied by code (guards, defaults, enum bounds), not just ones the spec labels.
- Open items: anything marked NEEDS CLARIFICATION, TODO, TBD, or left undecided.
  Copy the marker's own words. Do not answer or resolve them.
- Copy code verbatim. Never edit, shorten, or fix it.
- Do NOT flag gaps, contradictions, risks, or missing coverage. Summarizing only.
- Omit a section entirely if it has no rows.
