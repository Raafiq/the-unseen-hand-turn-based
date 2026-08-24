/**
 * The `?` panel's content (docs/11 M0 item 7) — what a player gets when they ask,
 * and nothing they did not.
 *
 * WHY THIS IS DATA AND NOT MARKUP. A help panel is the easiest thing in a codebase to
 * let drift: it is prose, nobody compiles it, and it keeps reading as true long after
 * the mechanic it describes has moved. Structuring it as topics lets `help.test.ts`
 * hold the claims to the shipped content pack — specifically {@link HelpTopic.slot},
 * which turns "the panel says you can equip a Reaction" into an assertion that a LIVE
 * reaction exists and is affordable inside one campaign. That check is the whole reason
 * the field is here; a topic list with no such hook would be decoration.
 *
 * This is UI chrome, NOT narrative, so it deliberately does not ride on the story seam
 * (`src/sim/story.ts`). Swapping the story pack must never be able to delete the help —
 * a separate story repo owns the fiction, not the manual.
 *
 * DOM-free on purpose, like `PrepModel`: the page renders it, the tests read it, and
 * there is no parallel path between them (docs/10 §7).
 */

/** One section of the help panel. */
export interface HelpTopic {
  id: string;
  title: string;
  /** Body paragraphs, in order. Rendered with `textContent`, never as markup. */
  lines: readonly string[];
  /**
   * The chassis slot this topic tells the player they can fill.
   *
   * Present ⇒ `help.test.ts` asserts the shipped pack holds a LIVE ability of this
   * type, reachable within one campaign's AP. Before the M0 item 7 slice a Reaction
   * cost 540 AP against a ~280 AP campaign, so the sentence "equip a Reaction" was
   * something a player could read and never do.
   */
  slot?: "support" | "reaction" | "movement";
}

/**
 * The panel's sections, in reading order: the board first, then the turn, then the
 * build. A newcomer who reads only the first two can play; the rest is why they would
 * want to.
 */
export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: "turn-order",
    title: "Whose turn it is",
    lines: [
      "Nobody takes turns in a fixed order. Every unit fills a clock, and whoever fills it first acts next. Faster units act more often.",
      "The timeline under the grid shows who is coming up. Acting costs clock time, so a unit that attacks waits longer for its next turn than one that only moves.",
    ],
  },
  {
    id: "acting",
    title: "Moving and attacking",
    lines: [
      "On your turn, click a highlighted tile to move there, then click an enemy to strike. You can do both in the same turn, in either order.",
      "Before you commit, the preview panel shows the real numbers — damage, hit chance, and what it would leave them on. Nothing is hidden from you.",
      "End Turn finishes early. Cancel takes back a move you have staged but not committed.",
    ],
  },
  {
    id: "ground",
    title: "The ground matters",
    lines: [
      "Height helps. Attacking from above hits harder and is easier to land; attacking uphill is worse.",
      "Facing matters too. Hitting a unit from behind is more accurate than hitting it head-on, and so is being hit from behind.",
    ],
  },
  {
    id: "jobs",
    title: "Jobs and AP",
    lines: [
      "Units earn AP by doing something real in a battle. AP is one pool per unit, and you spend it on any job's skill tree — you do not have to be in that job to buy from it.",
      "Changing job is free and instant. Everything you have learned stays with the unit, not the job, so experimenting never costs you progress.",
      "Learn one action from another job's tree and that job becomes available as your Secondary command.",
    ],
  },
  {
    id: "spending",
    title: "Where to spend AP",
    lines: [
      "Spend on the job the unit is in. Those commands work the moment you buy them, and there is no slot to give up.",
      "You can buy from any job's tree, but an action from another job does nothing until you equip that job as this unit's Secondary — and there is only one Secondary slot. Buying cheap actions from three different jobs leaves you able to use one of them.",
      "The learn list marks those rows \u201cneeds Secondary\u201d before you spend. AP is never refunded, so read the tag first.",
      "Passives are different: a Reaction, Support or Movement ability can come from any tree and only needs its own slot.",
    ],
  },
  {
    id: "slots-secondary",
    title: "Secondary command",
    lines: [
      "Your unit always has its own job's commands. The Secondary slot adds a second job's commands on top — this is where builds come from.",
      "The cheapest way in costs 60 AP: buy any one action from another job's tree.",
    ],
  },
  {
    id: "slots-reaction",
    title: "Reaction",
    slot: "reaction",
    lines: [
      "A Reaction fires on its own when the unit is attacked — striking back, or getting in first.",
      "One slot, one reaction. Choosing it is choosing what you give up.",
    ],
  },
  {
    id: "slots-support",
    title: "Support",
    slot: "support",
    lines: [
      "A Support is always on: more health, harder hits, longer reach, faster casting. It changes the stat line you see in the prep panel the moment you equip it.",
    ],
  },
  {
    id: "slots-movement",
    title: "Movement",
    slot: "movement",
    lines: [
      "A Movement ability changes how far the unit travels each turn. More range is not automatically better — walking further often means arriving alone.",
    ],
  },
  {
    id: "traits",
    title: "Traits",
    lines: [
      "Mastering a job leaves a permanent trait behind. Traits cost no AP and can be equipped from the start — if a unit has one it is not using, that is free power sitting idle.",
    ],
  },
  {
    id: "unfinished",
    title: "Why some abilities say “no effect yet”",
    lines: [
      "This is an early build, and a few abilities are written down but not wired up. Those are labelled wherever they appear, in the command list and in the learn list.",
      "AP you spend is never refunded, so the label is there before you buy, not after.",
    ],
  },
  {
    id: "losing",
    title: "Losing a battle",
    lines: [
      "Losing is not the end of the run. You go back to the same battle with exactly the party you had before it — nothing spent, nobody lost.",
      "But the retry is the same fight, and a lost battle earns no AP — so going straight back in changes nothing on its own. What changes a losing battle is what you bought and equipped before it.",
      "Progress saves automatically between battles, in this browser.",
    ],
  },
];
