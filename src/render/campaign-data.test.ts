/**
 * `PORTRAIT_BY_UNIT` / `resolvePortrait` — ADR-0039's viewer table.
 *
 * `campaign-shell.test.ts` already asserts the boot check's two-direction coverage and
 * the roster-id partition. This file is the A/B on the BUILT OBJECT `resolvePortrait`
 * returns — the thing `game.ts`'s `look()` actually calls — because a table that
 * type-checks and is never read resolves nothing, and that reads identical to one that
 * works right up until a screenshot is opened.
 */
import { describe, expect, it } from "vitest";
import {
  PORTRAIT_BY_UNIT,
  PORTRAITS,
  campaign,
  portraitLinkMismatches,
  resolvePortrait,
} from "./campaign-data.js";

describe("resolvePortrait", () => {
  it("A/B ON THE BUILT OUTPUT: a unit with art and a unit without resolve to DIFFERENT keys and DIFFERENT urls", () => {
    const briar = resolvePortrait("pc-briar");
    const vance = resolvePortrait("pc-vance");
    expect(briar.key).not.toBe(vance.key);
    expect(briar.url).not.toBe(vance.url);
    expect(briar.key).toBe("archer-f");
    expect(vance.key).toBe("placeholder");
  });

  it("every table row resolves to a real key and a real (non-placeholder) url", () => {
    const placeholderUrl = PORTRAITS["placeholder"];
    for (const [unitId, expectedKey] of Object.entries(PORTRAIT_BY_UNIT)) {
      const { key, url } = resolvePortrait(unitId);
      expect(key, `${unitId} resolved to "placeholder"`).not.toBe("placeholder");
      expect(url, `${unitId}'s url is the placeholder's`).not.toBe(placeholderUrl);
      expect(url).toBe(PORTRAITS[expectedKey]);
    }
  });

  it("a monk/geomancer unit — out of portrait scope — still resolves to the placeholder", () => {
    // pc-vance (geomancer) and pc-kest (monk) are deliberately absent from the table
    // (ADR-0039): those jobs are out of scope, and the honest answer is the placeholder,
    // not a made-up key.
    for (const id of ["pc-vance", "pc-kest"]) {
      const { key, url } = resolvePortrait(id);
      expect(key).toBe("placeholder");
      expect(url).toBe(PORTRAITS["placeholder"]);
    }
  });

  it("every table id is a roster id — a STALE id (a row surviving a character rename) is what this must catch, not just a missing one", () => {
    const rosterIds = new Set([...campaign.party.map((r) => r.id), ...campaign.cast.map((r) => r.id)]);
    for (const id of Object.keys(PORTRAIT_BY_UNIT)) {
      expect(rosterIds.has(id), `"${id}" is not a roster id`).toBe(true);
    }
    // Mutation-verified by hand: renaming `"pc-briar"` to `"pc-briar-renamed"` in the
    // shipped table (both here and in campaign-data.ts's boot check) turns this test —
    // and the boot check — red; restoring the key turns both green again.
  });

  it("every table row's KEY names the row's own roster JOB — a row pointed at the wrong unit's face is what this must catch", () => {
    // The key's job segment (text before "-", e.g. "knight" in "knight-m") must equal
    // that roster record's OWN `currentJob` in data/campaign/camp-the-first-march.json.
    // Nothing else ties PORTRAIT_BY_UNIT's keys to the roster's authored jobs — a swap
    // between two same-job units would still pass the roster-id check above, and a swap
    // between two DIFFERENT-job units (a thief pointed at a wizard's face) would pass
    // every other test in this file, since nothing here reads the roster's job field.
    const roster = new Map([...campaign.party, ...campaign.cast].map((r) => [r.id, r]));
    for (const [unitId, key] of Object.entries(PORTRAIT_BY_UNIT)) {
      const record = roster.get(unitId);
      expect(record, `"${unitId}" is not a roster id`).toBeDefined();
      const jobSegment = key.split("-")[0];
      expect(
        jobSegment,
        `${unitId}: PORTRAIT_BY_UNIT says "${key}" but the roster's job is "${record!.currentJob}"`,
      ).toBe(record!.currentJob);
    }
    // Mutation-verified by hand: setting PORTRAIT_BY_UNIT["foe-hexer"] = "thief-m" (the
    // hexer is a wizard, not a thief) turns this red; restoring "wizard-f" turns it
    // green again.
  });

  it("the story pack's asset and PORTRAIT_BY_UNIT's key agree for every roster-linked story character", () => {
    // The scene player resolves Briar's portrait from the story pack's `asset` field;
    // the unit card resolves it from this table. Nothing else ties the two together —
    // see portraitLinkMismatches's doc comment in campaign-data.ts.
    expect(portraitLinkMismatches()).toEqual([]);
    // Mutation-verified by hand: setting PORTRAIT_BY_UNIT["pc-briar"] = "knight-f" in
    // campaign-data.ts turns this red (and the module's boot check, so every test that
    // imports campaign-data.ts fails with it); restoring "archer-f" turns both green.
  });
});
