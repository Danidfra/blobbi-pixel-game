# Specification: Quests, requests, lore and discoveries

## 1. Purpose
Give the player direction and a story without pressure: goals that complete from what the player actually does,
with rewards that open new things to do.

## 2. Status
**IMPLEMENTED** (M4 objectives, M5 quests, requests, lore, discoveries; M7 grown-land discoveries and lore; M8
chapter 1 rewritten as the first-home chain).
**NOT TESTED** by a person.

## 3. Player-facing behaviour
- Chapter 1, The First Home (M8): meet the Blobbi → explore (look at 3 things) → gather 5 → craft the axe → fell a
  tree → have 6 wood and 3 stones (or a finished shelter) → build the shelter → step inside (a potted plant as a
  housewarming gift) → place a first piece of furniture inside. Every step is an action the player does; a step done
  early completes as soon as it becomes active. Reachable on all three Carriers (`tests/first-home.test.ts`).
- Chapter 3 (M10 phase C) teaches growth: after "Something that hums", **"Help your island grow"** (goal: the island
  at stage 1; its goal box counts the growth requirements met) comes before "Listen to the Carrier", which requires
  it — so the rod, the seal and the canoe (all after listening) come once the shore reaches the sea.
- The goal box (top right) shows the current main quest and its progress; J opens the journal: active and done
  quests with story, hint, progress and reward; notes; finds; places; Carrier observations.
- **Pinning (M10 phase C).** One active side quest can be pinned to a small SIDE card under the main goal (journal:
  PIN or P; UNPIN or P again). It shows at every camera zoom and on phones, updates its progress, comes off by itself
  when the quest is done, and is saved (`pinnedQuest`).
- **Locked recipes (M10 phase C).** A recipe whose teaching quest is open now shows in CRAFT as LOCKED with
  `Complete "<quest title>" to unlock.` (from the quest data) and cannot be made; recipes of quests not open yet, and
  of discovery quests, stay hidden ("N more to discover").
- Completing a quest shows a notice, plays a chime, grants its reward once (items, plans and recipes, journal notes,
  friendship) and may make other quests active.
- From the first finished shelter, one island request at a time (eight in a pool, in a fixed walk) asks for a small
  thing; when done, the next begins at the next dawn.
- Discoveries lie on the island (eight per world, five more on grown land); E picks one up into the bag as a readable
  special item and adds its note.

## 4. Controls
J journal (Q/E or Tab between tabs; P pins or unpins the selected side quest) · O hides the goal box · E picks up a
discovery · bag → Read for a note item.

## 5. Data structures
- `QuestContent` (`src/content/quests.ts`): id, type (main, side, discovery), chapter, title, story, hint, requires,
  goal, reward. Goals: a tally count, having an item, a finished building kind, decorations placed, a discovery found,
  friendship level, or `all` / `any` combinations.
- `Tally` (`src/game/objectives.ts`): 28 counters of what the player did (collected, crafted, felled, mined, plots,
  planted, watered, harvested, fed, petted, built, decorations, entered, furnished, stored, cooked, mealsFed,
  discoveries, looked, sat, played, talked, flowers, shells, foraged, favourites, fished, axesCrafted).
- `ObjectiveState`: `completed` (id → world time), the active request, requests done, next request time, lore found.
- `RequestContent`: tally goal counted from a baseline when the request starts.

## 6. State transitions
locked (prerequisites not done) → active → done (once; `advanceObjectives` repeats until nothing more completes).
Request: none → active (at or after `nextRequestAt`, after the shelter) → done → none until the next dawn.

## 7. Persistence
Save fields `tally`, `objectives` (completed, request, requestsDone, nextRequestAt, lore), `found`. Main chapter 1
keeps the M4 objective ids, so migrated saves never earn rewards twice.

## 8. Edge cases
Only the player's own actions count (autonomous looks do not); opening menus never counts; a reward that does not fit
in the bag says what did not fit; an unknown quest id in a save is dropped. A visitor (M7) neither advances the
host's quests nor receives rewards.

## 9. Failure handling
`objectivesFromSave` and `tallyFromSave` keep only known ids and valid numbers; everything else resets to defaults
without losing the rest.

## 10. Source files
`src/content/quests.ts`, `src/game/objectives.ts`, `src/content/lore.ts`, `src/content/discoveries.ts`,
`src/game/discoveries.ts`, `src/game/growth-content.ts`, `LiveWorld.stepObjectives`, `grantReward`, `learn`,
`collectDiscovery`, `src/ui/screens/journal.ts`, `src/render/view-renderer.ts` (goal card).

## 11. Automated tests
`tests/quests.test.ts` (including both chapters finished by real actions, and rewards not granted twice on reload),
`tests/living-island.test.ts`, `tests/map.test.ts` (journal tabs), `tests/visiting.test.ts`.

## 12. Known limitations
No chapter 3; grown-land discoveries have notes but no quests; the "Collector" quest counts 8 finds, written before
the grown-land discoveries existed; several lore notes name the turtle on manta worlds
([known issues](../testing/KNOWN-ISSUES.md)).

## 13. Extension points
New quests and requests are content entries; goals can combine existing goal types; chapter 3 is PLANNED.
