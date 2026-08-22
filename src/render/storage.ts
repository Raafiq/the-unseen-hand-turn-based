/**
 * The save slot — the ONLY place this project touches persistent IO (docs/11 M0 item 1).
 *
 * `src/sim/campaign.ts` owns the codec and is pure by contract: it turns a
 * {@link CampaignSave} into a string and back, and never learns where that string
 * lives. This file is the other half — it puts the string somewhere and gets it back —
 * and it lives at the `src/render` edge precisely so the sim stays IO-free.
 *
 * FAILURE IS A STATE, NOT A CRASH. A browser can refuse `localStorage` outright
 * (private mode, disabled site data), and a slot can hold a string this build cannot
 * read (a future schema, a truncated write, something else's key). Every one of those
 * must reach the player as a message on the title screen with New Game still available
 * — a game that throws on boot because of a bad save file is unplayable and unfixable
 * from inside the game. So reads return a discriminated {@link LoadedSave} and never
 * throw, while writes DO throw: a save that silently fails to write is the worst
 * outcome of all, because the next screen looks exactly like a successful one.
 */

import { deserializeCampaign, serializeCampaign, type CampaignSave } from "../sim/index.js";

/**
 * The storage key. Versioned in the KEY, not just in the payload, so that if the
 * campaign codec ever stops being able to migrate an old line the stale blob is simply
 * never read, instead of being read and rejected forever.
 */
export const SAVE_KEY = "tuh.campaign.v1";

/**
 * A one-slot string store. Narrower than `Storage` on purpose: the shell can only do
 * these three things, so a test double is three lines and cannot accidentally offer the
 * shell a capability the real backend lacks.
 */
export interface SaveSlot {
  read(): string | null;
  write(json: string): void;
  clear(): void;
}

/** Thrown when the slot itself refuses to store the save. */
export class SaveWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveWriteError";
  }
}

/**
 * The browser slot. `localStorage` access is wrapped because merely TOUCHING it throws
 * in some privacy configurations — including on read, which is why the read path
 * catches too and reports an empty slot rather than taking the page down.
 */
export function browserSlot(storage: Storage, key: string = SAVE_KEY): SaveSlot {
  return {
    read(): string | null {
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    write(json: string): void {
      try {
        storage.setItem(key, json);
      } catch (err) {
        throw new SaveWriteError(`the browser refused to store the save: ${String(err)}`);
      }
    },
    clear(): void {
      try {
        storage.removeItem(key);
      } catch {
        /* a slot that cannot be cleared is already empty as far as the shell cares */
      }
    },
  };
}

/** An in-memory slot — the headless test backend, and a usable fallback. */
export function memorySlot(initial: string | null = null): SaveSlot {
  let value = initial;
  return {
    read: () => value,
    write: (json) => {
      value = json;
    },
    clear: () => {
      value = null;
    },
  };
}

/** What was in the slot: nothing, a usable save, or something that could not be read. */
export type LoadedSave =
  | { kind: "empty" }
  | { kind: "save"; save: CampaignSave }
  | { kind: "error"; message: string };

/**
 * Read the slot. `campaignId` is checked because a save is only meaningful against the
 * campaign it was made in — battle indices and party ids mean nothing across campaigns,
 * and loading one into another would deploy a party the encounters never reference and
 * fail deep inside the resolver instead of here.
 */
export function readSave(slot: SaveSlot, campaignId: string): LoadedSave {
  const json = slot.read();
  if (json === null || json === "") return { kind: "empty" };
  let save: CampaignSave;
  try {
    save = deserializeCampaign(json);
  } catch (err) {
    return { kind: "error", message: `this save could not be read: ${String(err)}` };
  }
  if (save.campaignId !== campaignId) {
    return {
      kind: "error",
      message: `this save belongs to campaign "${save.campaignId}", not "${campaignId}"`,
    };
  }
  return { kind: "save", save };
}

/**
 * Write the slot. Validates on the way out through {@link serializeCampaign}, so a
 * malformed save is rejected before it can replace a good one.
 */
export function writeSave(slot: SaveSlot, save: CampaignSave): void {
  slot.write(serializeCampaign(save));
}
