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
  it("A/B ON THE BUILT OUTPUT: a named unit and an unnamed one resolve to DIFFERENT keys and DIFFERENT urls", () => {
    // `pc-vance` used to be the no-art side of this A/B. Every roster id has a row as of
    // the six-member party (2026-09-08 — asserted below), so the unnamed side has to be
    // an id the table genuinely does not hold. The fallback is still the shipped
    // contract: `resolvePortrait` answers with the placeholder, never `undefined`.
    const briar = resolvePortrait("pc-briar");
    const unnamed = resolvePortrait("pc-not-in-the-table");
    expect(
      PORTRAIT_BY_UNIT["pc-not-in-the-table"],
      "the unnamed side of this A/B is in the table, so it proves nothing",
    ).toBeUndefined();
    expect(briar.key).not.toBe(unnamed.key);
    expect(briar.url).not.toBe(unnamed.url);
    expect(briar.key).toBe("archer-f");
    expect(unnamed.key).toBe("placeholder");
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

  it("NO roster unit falls back — every party member and every enemy has real art (2026-09-08)", () => {
    // This test's predecessor asserted the OPPOSITE for pc-vance and pc-kest, whose jobs
    // were then out of portrait scope. Nine of the ten approved crops are bundled now and
    // the roster is fully covered, so the honest claim flipped — same rule, opposite
    // verdict, because the content moved.
    //
    // It loops the ROSTER, not the table, which is the difference that matters: the
    // "every table row resolves" test above cannot see a roster id that has NO row, and
    // that id renders a placeholder face on a real character's card.
    for (const rec of [...campaign.party, ...campaign.cast]) {
      const { key, url } = resolvePortrait(rec.id);
      expect(key, `${rec.id} falls back to the placeholder`).not.toBe("placeholder");
      expect(url, `${rec.id} renders the placeholder's url`).not.toBe(PORTRAITS["placeholder"]);
    }
  });

  it("IDENTITY: each party member resolves to the ONE named asset, not merely to some asset", () => {
    // Width, presence and "not the placeholder" all separate ABSENT from PRESENT; none
    // of them separates RIGHT from WRONG. A knight's face on the archer passes every one
    // of them. This names the expected asset per id, so a swap inside the table is red.
    //
    // Kept as a literal here rather than read out of PORTRAIT_BY_UNIT — reading the table
    // would make this a tautology that passes whatever the table says.
    const EXPECTED: Readonly<Record<string, string>> = {
      "pc-vance": "archer-m",
      "pc-kest": "wizard-m",
      "pc-briar": "archer-f",
      "pc-ottoline": "priest-f",
      "pc-corin": "priest-m",
      "pc-isla": "wizard-f",
    };
    expect(Object.keys(EXPECTED).sort()).toEqual(campaign.party.map((r) => r.id).sort());
    for (const [id, key] of Object.entries(EXPECTED)) {
      expect(resolvePortrait(id).key, id).toBe(key);
      expect(resolvePortrait(id).url, id).toBe(PORTRAITS[key]);
    }
    // Every one of the six is a DISTINCT face, so no two ids can be satisfied by one
    // asset — the two wizards take wizard-m and wizard-f rather than sharing a crop.
    expect(new Set(Object.values(EXPECTED)).size).toBe(Object.keys(EXPECTED).length);
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
