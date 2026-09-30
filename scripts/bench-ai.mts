import { createBattleState, defaultUnit, BASIC_ATTACK_ID } from "../src/sim/state.js";
import { decideBalanceProbe, exposureOf } from "../src/sim/ai.js";
import { makeFlatTiles } from "../src/sim/state.js";
import { performance } from "perf_hooks";

const units = [];
for (let i = 0; i < 20; i++) {
  const u = defaultUnit(`u${i}`, i % 2);
  u.pos = { x: i % 10, y: Math.floor(i / 10) };
  u.abilities = [];
  for (let j = 0; j < 50; j++) {
     u.abilities.push({
         id: j === 25 ? BASIC_ATTACK_ID : `skill${j}`,
         name: "attack",
         range: { h: 2, v: 2 },
         area: 0,
         formula: "physical",
         power: 10,
         evadable: true,
         adds: [],
         removes: [],
         ctype: "damage",
         requiresWeapon: false,
         reaction: false,
     });
  }
  units.push(u);
}

const state = createBattleState({
  seed: 1,
  grid: { width: 10, height: 10, tiles: makeFlatTiles(10, 10) },
  units,
});

const start = performance.now();
let iters = 0;
// Using exposureOf directly to measure the exact hot path
for (let i = 0; i < 100000; i++) {
  exposureOf(state, units[0], { x: 5, y: 5 });
  iters++;
}
const end = performance.now();
console.log(`Time taken: ${(end - start).toFixed(2)}ms for ${iters} iterations of exposureOf`);
