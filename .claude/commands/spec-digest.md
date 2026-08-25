---
description: Digest a Speckit spec into a plain-words summary file
argument-hint: [path to spec.md]
allowed-tools: Read, Write, Glob
---

Read the spec at $1. If no path given, use the spec.md of the current feature
branch under .specify/ conventions.

Write the result to `spec-digest.md` in the same folder as the spec. Overwrite
if it exists. Output nothing to chat except the file path.

The reader is a new dev with a human attention span. They will skim. Assume they
read the top properly, the middle loosely, and the bottom only if it looks short.
Put what changes their behaviour where they will actually see it.

File contents — these five parts only. No prose, no preamble, no findings.

## <feature name>
One sentence: what this feature does.

> **Status: <status>.** <One sentence: what a reader should do with this document.>

A blockquote line of its own, directly under the title, never a table row. Use the
spec's own status word. If it is anything other than active work — cut, superseded,
on hold, draft, blocked — say plainly that the rest describes a thing that is not
being built. If the spec states no status, write `Status: not stated in the spec.`

| § | In plain words | From |
|---|---|---|

| Edge case | Behaviour | § |
|---|---|---|

| Open item | State | § |
|---|---|

## Code
For each code block in the spec, in spec order:

<details><summary>§2.2 — retries 3 times before failing</summary>

```ts
<the code block, verbatim, unedited>
```
</details>

Rules — the tables:
- Row order follows the spec's order. `§` = section anchor so I can jump back.
- `From` = `prose` or `code`. For code blocks, state the behaviour the code
  produces, not what the code is.
- Max 20 words per cell. Plain words. No jargon unless it's in the code.
- **Never shorten away a name.** If a cell says "rejects both gate types", "the
  second mode", "the other path", it has failed — name the things. A reader who
  has to guess what a cell refers to would have been better served by no row. Spend
  the word budget on the referent and cut the adjectives.
- **One row per distinct behaviour.** If two rows would say the same thing, write
  one. Repetition is what makes a reader start skimming, and the row they skip is
  as likely to be the load-bearing one as not.
- **Copy the spec's undefined terms, then mark them.** If the spec uses a term it
  never defines, keep the term and append `[undefined in spec]` once, on first use.
  Do not invent a definition and do not quietly drop the row.
- **Record contradictions as two rows, not one.** If the spec says opposite things
  in two places, give each its own row with its own `§`. Do not reconcile them, do
  not pick a winner, do not comment on it. Two rows that disagree is an accurate
  summary of a spec that disagrees with itself.

Rules — edge cases:
- Error paths, empty/zero/limit states, conflicts. Include ones implied by code
  (guards, defaults, enum bounds), not just ones the spec labels.
- **Cover the named things evenly.** For each field, enum value, or parameter the
  spec names, either give it an edge case or leave it out deliberately — do not let
  one of them collect five rows while its siblings get none. Uneven coverage reads
  as "the others have no edge cases", which is a claim the spec did not make.

Rules — open items:
- Anything marked NEEDS CLARIFICATION, TODO, TBD, or left undecided.
- Copy the marker's own words. Do not answer or resolve them.
- **List every item the spec numbers, including resolved ones.** Put the spec's own
  word in `State` — `open`, `resolved`, `blocking`, whatever it uses; `not stated`
  if it says nothing. Silently dropping a resolved item leaves a hole in the
  numbering that reads as a lost item.
- **A resolved item must carry what was decided.** Append the decision to the
  question in the same cell: `<question> → <what was decided>`. If the spec marks an
  item resolved without recording the resolution, write `→ resolution not recorded in
  spec`. A bare `RESOLVED` is worse than `open`: it reads as handled, so the reader
  stops looking and assumes the implementation got it right.
- **Flag an item whose answer already appears in the spec's own code.** If a question
  is marked open or blocking but a code block already implements one side of it,
  append `— code already picks one` to the `State` cell. Point, do not say which side
  and do not say whether that is wrong.

Rules — code:
- Copy code verbatim. Never edit, shorten, or fix it.
- **The summary line describes only what is visible in that block.** If a body is
  elided (`{ /* ... */ }`, `...`, a comment standing in for an implementation), you
  may not assert what it does — end the summary with `— body not shown`. A caption
  claiming behaviour the reader cannot see in the code is the one failure that costs
  more than writing nothing.
- **Attribute to the right place.** If a block holds two snippets, make sure the
  behaviour you describe comes from the snippet you imply. Say which one.
- **Carry the status into the code.** If the status line is anything other than
  active work, put a matching comment as the first line inside every code block —
  `// <STATUS> — see Status at top`. A reader who scrolls straight to the code must
  not be able to finish believing this is live work.
- If any value in a code block is contradicted elsewhere in the spec — a number the
  spec later says is wrong, a placeholder it flags as unfilled — append
  `— see §<anchor>` to that block's summary line. Point, do not explain.
- **Route the prose-only rules to the code reader.** Some readers open the Code
  section first and never scroll up. Any behaviour rule that no code block shows —
  who gets credited, which cases count, precedence between two rules, anything a
  reader could implement backwards — must be named at the top of the Code section as
  a plain list of anchors: `Not shown in any code below: <one clause each> — §<anchor>`.
  Name the rule, not just the anchor; a bare pointer gets skipped. If every rule is
  visible in some block, say `Every behaviour rule below appears in code.`

Rules — everywhere:
- Do NOT flag gaps, contradictions, risks, or missing coverage as findings.
  Summarizing only. Recording two conflicting rows is summarizing; adding a
  sentence about the conflict is not.
- Omit a section entirely if it has no rows. Never omit the status line.
