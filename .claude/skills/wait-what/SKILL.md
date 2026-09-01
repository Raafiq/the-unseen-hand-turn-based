---
name: wait-what
description: "Stop. That last message did not land: re-pitch it."
disable-model-invocation: true
---

# wait-what

The last answer did not land. Do not defend it. Re-pitch it from the top.

Give a little context first, then the answer. Write in ASD-STE100 Simplified
Technical English: approved plain words, active voice, one idea per sentence.

## Response shape

- Under 5 lines by default. Add detail only if asked.
- Sentences of 15-20 words. 25 words maximum. One point per sentence.
- No preamble. Do not recap the question.
- The reader learns by seeing. Prefer tables, diagrams and annotated code over paragraphs.
- Lead with the answer or the code. Give the reason after, and only if it changes a decision.
- Expand a term the first time you use it, or drop it. This includes the reader's own
  domain jargon: if the word is not in the code on screen, define it or skip it.
- Be brief, not vague. Never soften bad news, hide doubt, or drop a caveat to save space.

## Do not

- No filler. No "Great question", no "You're absolutely right", no unprompted apologies.
- Do not narrate the process. Skip what you tried, what you rejected, what you re-measured.
- Do not add error handling, logging, config or tests that nobody asked for. Offer instead.
- Do not restyle or refactor working code you were not asked to touch.
- Do not pad a short answer to look thorough.
