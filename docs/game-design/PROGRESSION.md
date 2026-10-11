# Progression

How a player moves forward, at three timescales. Everything here is **IMPLEMENTED** and **NOT TESTED** by a person;
pacing in particular needs human play (see [the manual test plan](../testing/MANUAL-TEST-PLAN.md)).

## Principles (from the code)

- Progress is **derived from play**: a tally of what the player actually did (`Tally` in `src/game/objectives.ts`)
  plus what the world holds. Opening a menu never counts.
- Progress **never goes backwards**: friendship, harmony, the Carrier bond, quest completion, growth readiness and
  every tally only grow. Nothing decays or punishes waiting.
- Rewards are granted **once** (quest ids are kept across versions; a migrated save never earns twice).
- Growth is **chosen**, never automatic, and never caused by a save migration.

## 1. The story: 33 quests

Source: `src/content/quests.ts` (data), `src/game/objectives.ts` (engine). Full list with rewards in the
[content catalogue](CONTENT-CATALOG.md).

| Track | Quests | How it unlocks |
|---|---|---|
| Main chapter 1 | 12: look around, meet your Blobbi, gather, first tool, wood, shelter, farm plot, plant, water, harvest, feed, make it home | prerequisites chain from gathering |
| Main chapter 2 | 4: a warm meal, something that hums (find the Carrier Stone), listen to the Carrier, begin restoring the island | after the home and the harvest |
| Side | 14: decorating, storage, shells, flowers, farming, cooking, baking, lavender, best friends, foraging, a cozy corner, mining, fishing, a favourite treat | each after a related step |
| Discovery | 3: the bottle, the Keeper's pages, finding all eight island discoveries | by finding things |
| Island requests | 8 in a pool, one at a time from the first shelter, a new one each dawn | `startRequest` / `finishRequest` |

Quest rewards are items, building plans and recipes (unlocks), journal notes and friendship. The goal box follows the
first active main quest; the journal lists all active quests.

## 2. Friendship (Blobbi)

`src/game/friendship.ts`. Points from attention and food: pet +1 (once per 8 s), feed +2, a favourite food +5, a
meal +3, rest +2, a completed quest +3, playing +2. Levels at 0, 15, 45, 100, 180, 300 points (new friends, friends,
good friends, close friends, best friends, inseparable). Level 3 unlocks the "Best friends" side quest (Blobbi
statue plans). Never decays.

## 3. The Carrier bond and island harmony (M6)

`src/game/carrier.ts`. Bond from gentle interactions (listen +1; greet +2, rest +2, breathe +3 and offer +3 or +6
for a favourite once a day each; +3 per new observation). Harmony 0–100 = bond (≤ 40) + care (≤ 25: decorations,
flowers, planting, harvests, buildings) + wonder (≤ 20: discoveries) + time (≤ 15: days lived). Levels: quiet,
settling, content, thriving, in harmony. Harmony changes flavour (the hum's words, ambient life) and feeds island
growth.

## 4. Island growth (M7)

`src/game/growth-progress.ts`, `src/world/growth.ts`. Each next stage asks for:

| Next stage | Harmony | Story quest | Care (fed + petted) | Harvests | Built + decorations | Finds |
|---|---|---|---|---|---|---|
| 1 The shore widens | 15 | Build a shelter | 6 | 3 | 3 | 1 |
| 2 Groves and stones | 35 | Make it home | 15 | 10 | 7 | 3 |
| 3 The deep green | 55 | Listen to the Carrier | 30 | 20 | 12 | 5 |

When all are met the island is **ready** (a notice: "The Carrier stirs"); it grows only when the player presses LET
THE ISLAND GROW in the growth panel (L) and confirms. Each stage adds two regions (biomes) with their own vegetation,
resources, a named place and a discovery.

## 5. Tools and recipes

Tools come from the first quests (axe, then the hoe via C/V/G shortcuts or crafting, the watering can as a quest
reward, the rod from the Carrier quest); copper upgrades after "Deeper stone". Recipes are hidden until a quest
teaches them, so the crafting menu grows with the story.

## 6. Timescales (design intent)

- Minutes: gather, tend, feed, a request.
- A session: a main quest, a building or a room, a new meal, a friendship level.
- Several sessions: the two chapters, harmony levels, the three growth stages.

These are design intentions; actual pacing has not been measured with players.
