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

**Carry the reason.** If the spec says why it reached that status, add the reasons to
the blockquote in the spec's own terms, one clause each. A status without its reason
sends the reader hunting for it, and they will guess. If the spec gives no reason,
write `Reason not stated in the spec.` — do not infer one.

### Terms
A short definition list, directly after the status, of every term the spec leans on
but never defines — including the feature's own central noun, which specs routinely
use from line one as if it were common knowledge. For each: the term, then where the
spec shows what it means (`see §<anchor>`), or `not defined in the spec` when nothing
does. Point at the spec's own words; never write a definition the spec did not.

This block replaces scattered inline glosses: mark a term `[undefined in spec]` once,
on first use in a table, and let this block carry it. Repeating the tag turns it into
noise by the third sighting, and a tag on its own tells the reader they will not
understand the row — which is not help.

Omit the block if there are no such terms, and say so: `All terms are defined in the
spec.`

**Put it in both entry paths.** Readers arrive top-down or by scrolling straight to the
code, and a block above the tables is off the second path entirely. Keep the full list
here, and repeat the entries for terms that appear *inside a code block* in the Code
section's opening list. Two or three repeated lines cost less than a reader stalling on
an identifier that has a gloss forty lines above where they entered.

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
- **A rule stated more than once carries its exceptions every time.** If the spec
  qualifies a rule anywhere — an edge case that contradicts it, a condition that
  suspends it — every restatement must carry the qualifier or point at it. Repetition
  reads as emphasis, and an unqualified rule stated three times becomes an invariant
  in the reader's head that the spec never claimed. The third statement is the one
  they will remember.
- **An edge-case row anchored to an undecided item says so.** If a behaviour row's
  anchor is an open item still marked blocking or undecided, append the state to the
  behaviour cell. A row in the behaviour table reads as settled; one sourced from an
  unanswered question is not, and the table is where a reader goes for facts.
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
- **A resolution that creates a requirement gets its own row in the first table.**
  If a resolved item decides how something must behave, it is a requirement now, not
  a footnote — put it in the requirements table anchored to the section it constrains,
  as well as in the open-item row. A reader who skims the open-item table would
  otherwise miss a live rule, and the open-item table is the one most likely skimmed.
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
- **Carry the status into the code, and make the comment stand alone.** If the status
  line is anything other than active work, the first line inside every code block is
  `// <STATUS> — <the clause that removes the ambiguity> — see Status at top`. A bare
  status word is not enough: "CUT" alone still reads as "cut from this release", and a
  reader can park on the wrong meaning without ever scrolling up. Put the
  disambiguating words in the comment itself — `// CUT — rejected, not deferred; do
  not implement — see Status at top`.
- **Full banner on the first three blocks, then short.** From the fourth on, use
  `// <STATUS>` alone. Repeated verbatim past that point it stops being read and
  starts training the reader to skip the first line of every block — which is also
  where the file path lives, so the cost is a line they did need. Three carries a
  reader who entered anywhere; eight teaches a habit that loses them something.
- If any value in a code block is contradicted elsewhere in the spec — a number the
  spec later says is wrong, a placeholder it flags as unfilled — append
  `— see §<anchor>` to that block's summary line. Point, do not explain.
- **Route the prose-only rules to the code reader.** Some readers open the Code
  section first and never scroll up. Any behaviour rule that no code block shows —
  who gets credited, which cases count, when a change commits, precedence between two
  rules, anything a reader could implement backwards — is named at the top of the Code
  section: `Not shown in any code below: <one clause each> — §<anchor>`. Name the rule,
  not just the anchor; a bare pointer gets skipped.
- **The list carries the unanswered questions the code hides, not only the rules.**
  Working code with a confident comment is the strongest signal a document can send,
  and it is wrong whenever a value or a decision in a block is still open. For every
  block, ask which open items it silently answers — a placeholder that looks like a
  real value, a comment that states a choice nobody ratified — and add a line:
  `<what the code appears to settle> is still open — §<anchor>`. A reader who never
  scrolls up sees only the confidence.
- **Build that list by walking the code, not the tables.** For each block, ask what a
  competent reader would have to assume to implement it, then check whether the spec
  decides that assumption somewhere the code does not show. Timing rules are the ones
  most often missed — when a value commits, what happens between the change and the
  save — because they constrain code that looks complete without them. A list assembled
  by copying the rules that felt important is the list that omits them.
- **Head the list with an instruction, never a permission.** Use
  `Behaviour the code below does not show — read this or you will implement it wrong:`.
  Never invite a skip. A header offering an exemption ("skip if you read the tables")
  is taken by exactly the reader who must not take it: someone scrolling to the code
  has not read the tables, and a bulleted preamble between them and the first block
  already reads as front matter. The readers who find this list redundant have
  finished with it in three seconds; the reader it exists for loses the semantics the
  code omits. Cost the skip in the header — say what goes wrong.
- If every rule is visible in some block, say `Every behaviour rule below appears in
  code.`

Rules — everywhere:
- Do NOT flag gaps, contradictions, risks, or missing coverage as findings.
  Summarizing only. Recording two conflicting rows is summarizing; adding a
  sentence about the conflict is not.
- Omit a section entirely if it has no rows. Never omit the status line.
