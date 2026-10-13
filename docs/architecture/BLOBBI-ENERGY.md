# Blobbi energy: a gentle work stamina (M11C.5, DESIGN)

**Status: INVESTIGATION + PROPOSAL.** Gameplay is unchanged. Facts are **VERIFIED** (path given) or **PROPOSED**.
Inspiration: Stardew Valley's stamina (actions cost, walking is free, sleep restores), made cozier.

## 1. What exists today

**Blobbi Pixel** (VERIFIED, `src/game/care.ts`): three needs on 0-100, stepped in simulated time (a closed tab costs
nothing). `hunger` -0.06/s (full to empty in about 28 minutes of play); `energy` -0.08/s awake and **-0.11/s walking**
(about 21 minutes), +1.5/s resting, +3/s resting at the shelter; `happiness` drifts to a floor of 40 (20 when hungry or
tired) and rises with food (+10), petting (+6), rest, exploring, harvests, building and quests (`JOY`). Low needs only
slow the Blobbi a little (`speedFactor`) and show in its face; nothing dies or is lost. **No action costs energy.**
Food restores hunger (fish 6-16, meals more; `content/tools.ts`, `content/meals.ts`). Beds and the shelter rest plan
exist (M9).

**The kit / nostr-pet** (VERIFIED): five stats, 1-100: hunger, happiness, hygiene, energy, health
(`blobbi-core/src/blobbi.ts:49-54`). Energy decays awake (adult -5.5/h, baby -9/h) and returns with sleep
(35/h adult, 40/h baby; `blobbi-decay.ts:64-138`); other stats decay at 0.2x while asleep. Health falls when other
stats are low and regenerates when all are high (adult ≥80, baby ≥76). Actions: play +10 happiness -5 energy
(`blobbi-social-projection.ts:57-63`); toys cost 5-10 energy, foods give +5-10, an energy drink +35 (nostr-pet
`features/inventory/official-catalog-snapshot.ts:46-63`). Sleep is a `state` flip and blocks care actions
(`features/care/care-plan.ts:17-20, 74, 182-205`). Pixel has no hygiene and no health; nothing in Pixel harms a Blobbi.

## 2. Separate the two ideas (PROPOSED)

| Meter | What it is | Scale | Who owns it |
|---|---|---|---|
| **Work energy** (new: "stamina", shown as a small bolt bar) | how much the Blobbi can **do** today: chopping, mining, tilling, watering, fishing, building, cooking | game-local; adult 100 points, baby 40 points | the island (saved with it), never published |
| Hunger, happiness (exist) | how the Blobbi **is**: fed, joyful | 0-100 both stages (maps to kit stats later) | the island's companion record |
| Rest need (today's `energy`) | sleepiness; keep as the gentle passive meter | 0-100 | same |
| Hygiene, health (kit only) | not in Pixel; not recommended (health implies harm) | | |

Keeping work energy separate means canonical stats are never rescaled by a game mechanic, and a registered Blobbi's
kit energy stays the kit's.

## 3. Costs (PROPOSED): walking and exploring stay free

| Action | Cost (points) | Notes |
|---|---|---|
| Walking, exploring, talking to the Carrier, petting, feeding, picking up sticks/stones/seeds/forage | **0** | the first quests cost nothing |
| Chop (per hit; simple axe 3 hits, copper 2) | 2 | a tree: 6 (simple) or 4 (copper): better tools save energy |
| Mine (per hit; simple 4, copper 3) | 2 | a rock: 8 or 6 |
| Till a plot (copper: a row of 3 for the same cost) | 2 | |
| Water (simple: 1 crop and neighbours; copper: 3x3) | 1 | |
| Plant a seed | 0 | |
| Fish: a cast | 1 | the catch is free; a missed bite costs nothing more |
| Build: shelter / furniture / decoration | 8 / 2 / 1 | once per build |
| Cook a meal | 1 | |
| Paddle the canoe | 0 | exploring stays free |
| Craft at a bench | 0 | |

**Exhausted** (0 points): heavy actions are politely refused ("Blobbi is tired: rest or eat something"); walking,
talking, picking up, feeding and petting still work. No damage, no lost items, no fainting, no penalty the next day.

## 4. Recovery (PROPOSED)

| Way | Restores |
|---|---|
| Sleep in a bed (night, M9 rest plan) | to full |
| Rest at the shelter door / a nap | +3 per minute of rest (adult), +2 (baby) |
| Food | +1 work energy per 4 hunger restored (a minnow +1-2, a meal +5-10); a favourite food +50 % |
| Play / petting | +1 (once per few minutes), plus happiness |
| A new day (dawn) | at least half the pool back even without sleep: never stuck |

Absence: world time does not pass while the game is closed (already true); nothing drains offline.

## 5. Baby and adult (PROPOSED)

The kit shows a baby's stats in 4 segments and an adult's in 10 (`blobbi-segments.ts:45-62`), with the same 1-100
numbers. Mirror that only in work energy: **one segment = 10 points: baby 40 (4 segments), adult 100 (10)**. A baby
does less per day and recovers a little faster (food gives the same points against a smaller pool), so a baby day is
shorter, never harder. Hunger and happiness keep 0-100 for both (drawn with 4 or 10 segments).

## 6. Balance examples (PROPOSED)

- **First hour, adult** (quests meet → shelter): fell about 4 simple-axe trees (24), pick up everything (0), build the
  shelter (8): 32 of 100. Nobody meets the limit while learning.
- **Busy adult day**: 6 trees (36) + 2 rocks (16) + till 6 plots (12) + water 6 (6) + 10 casts (10) + cook 2 (2) = 82;
  one meal (+8) and a nap leave plenty; the bed restores all.
- **Baby day**: 3 trees (18) + till 3 (6) + water 3 (3) + 5 casts (5) = 32 of 40; a snack and a nap to do more.
- **Copper tools**: a copper axe makes a tree 4 instead of 6, a natural reason to upgrade.

## 7. Risks and open decisions

Risks: any stamina can feel like a nag; tuning must be done by play (the owner), not by numbers alone; the existing
passive energy drain would double-count with work energy (recommend: keep passive drain only as sleepiness, slower,
and drop the walking surcharge so walking is truly free). Decisions: the costs table; whether exhaustion refuses or
only slows heavy actions; whether the HUD shows the new bar from day one or after the first shelter.

## 8. Implementation order (after approval)

1. A pure `work-energy.ts` (costs, recovery, pools) with tests; save schema bump with a migration that starts every
   island at full energy.
2. Hook costs into the existing player actions only (never autonomy).
3. HUD bar (10 or 4 segments), refusal bubbles in three languages, guide page.
4. Owner playtest; tune.

## 9. Manual test checklist (future, all NOT TESTED)

ENERGY-01 the first hour never runs out; ENERGY-02 exhaustion refuses heavy actions kindly, walking still free;
ENERGY-03 bed restores all; ENERGY-04 food and naps help; ENERGY-05 a baby's shorter, not harder, day.
