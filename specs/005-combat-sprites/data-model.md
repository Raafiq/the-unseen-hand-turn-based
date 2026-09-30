# Data model: Briar Is a Sprite

## Manifest `data/campaign/story/sprites/briar.json`
```json
{ "cell": [64, 96],
  "animations": { "idle": {"frames": 4, "ms": 250}, "walk": {"frames": 4, "ms": 75},
                  "shoot": {"frames": 5, "ms": 80}, "act": {"frames": 3, "ms": 130},
                  "hit": {"frames": 2, "ms": 200} } }
```
Row order = key order above. Validation at boot: `frames ≥ 1`, `ms > 0`, sheet width ≥ max frames × cell.w, sheet height = 5 × cell.h. Zod schema in `sprites.ts`.

## `SPRITE_BY_UNIT: Readonly<Record<string, string>>` — `{ "pc-briar": "briar" }`

## `MotionBeat` (additions, `motion.ts`)
| Field | Type | Set by `makeBeat` when |
|---|---|---|
| `walk?` | `{ unitId; path: Position[] }` | the acting unit's `pos` changed; path from `movePath` on `before` |
| `act?` | `{ unitId; kind: "shoot" \| "act" }` | an event has a striker; `shoot` if the ability is `aim.*` or `basic.attack` with weapon `range.h > 1` |
| `impactDelayMs` | `number` | `min(300, 60 × Chebyshev(striker, target))` for `shoot`, else 0 |

## `MotionState` (additions, `iso.ts`)
| Field | Type | Meaning |
|---|---|---|
| `unitPos?` | `Record<id, {x, y}>` (world, fractional) | Where to draw a walking unit instead of `u.pos` |
| `sprites?` | `Record<id, { anim; frame; facing }>` | Row, column and facing to draw |
| `projectile?` | `{ from: Position; to: Position; t: 0..1 }` | The arrow in flight |

All three are absent (not zero) when nothing animates. `settledMotion()` returns them absent.

## State transitions (per unit, purely cosmetic)
`idle` → (move commit) `walk` along path → `idle` → (act commit) `shoot`/`act` → `idle`; (impact on this unit) `hit` for 400 ms → `idle`. KO: none; the crystal draws.
