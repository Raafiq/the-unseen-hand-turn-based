import { createBattleState, defaultUnit, BASIC_ATTACK_ID } from "../src/sim/state.js";
import { makeFlatTiles } from "../src/sim/state.js";
import { performance } from "perf_hooks";
import { isBasicAttack } from "../src/sim/state.js";

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

function exposureOf1(state, actor, tile) {
  const team = actor.teamId;
  let n = 0;
  for (const u of state.units) {
    if (u.hp <= 0 || u.teamId === team) continue;
    const reach = u.move + (u.abilities.find((ab) => ab.id === BASIC_ATTACK_ID)?.range.h ?? 1);
    if (Math.max(Math.abs(u.pos.x - tile.x), Math.abs(u.pos.y - tile.y)) <= reach) n += 1;
  }
  return n;
}

const reachCache = new WeakMap();
function getReach(u) {
  let reach = reachCache.get(u);
  if (reach === undefined) {
    reach = u.move + (u.abilities.find((ab) => ab.id === BASIC_ATTACK_ID)?.range.h ?? 1);
    reachCache.set(u, reach);
  }
  return reach;
}

function exposureOf9(state, actor, tile) {
  const team = actor.teamId;
  let n = 0;
  for (const u of state.units) {
    if (u.hp <= 0 || u.teamId === team) continue;
    const reach = getReach(u);
    if (Math.max(Math.abs(u.pos.x - tile.x), Math.abs(u.pos.y - tile.y)) <= reach) n += 1;
  }
  return n;
}

const start1 = performance.now();
for (let i = 0; i < 100000; i++) {
    exposureOf1(state, units[0], { x: 5, y: 5 });
}
const end1 = performance.now();
console.log(`Original: ${(end1 - start1).toFixed(2)}ms`);

const start9 = performance.now();
for (let i = 0; i < 100000; i++) {
    exposureOf9(state, units[0], { x: 5, y: 5 });
}
const end9 = performance.now();
console.log(`With exported getReach with WeakMap: ${(end9 - start9).toFixed(2)}ms`);
