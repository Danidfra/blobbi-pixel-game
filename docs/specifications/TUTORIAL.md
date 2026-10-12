# Specification: Contextual tutorial (tips)

## 1. Purpose
Teach the game by playing it: one short tip at a time, about the thing that matters now, gone the moment the player
has done it. Never a wall of text, never blocking play.

## 2. Status
**IMPLEMENTED** (M8). **NOT TESTED** by a person.

## 3. Player-facing behaviour
- A small TIP card sits above the action prompt (bottom centre). It shows one step; after a step is done a short
  "NICE!" appears and the next tip waits 2.5 s.
- Steps, in order (each shows only when it makes sense; `src/game/tutorial.ts`): walk · say hello to the Blobbi ·
  pick something up · open the bag · craft the axe · use the axe on a tree · build the shelter · go inside · place
  the potted plant · farm (till and plant) · the island can grow (GROWTH) · cook · listen to the Carrier · the HOME
  panel.
- A step is done by doing it, also before its tip shows: a player who already picked things up never sees "pick
  something up".
- The wording follows the input: keys ("press E") with a keyboard, taps and buttons ("tap USE") once touch is used.
- SKIP TIPS on the card turns tips off for this island; SETTINGS → TIPS ON THIS ISLAND turns them on again.
- Islands made before M8 start with tips off (they are already under way).

## 4. Controls
None of its own: the tip names the controls. SKIP TIPS (click or tap).

## 5. Data structures
`TutorialStep { id, keys, touch, when(ctx), done(ctx) }`; `TutorialContext { tally, completed, active, events,
hasShelter, inside }`; `LiveWorld.events` (session events: `walked`, `open:<screen>`).

## 6. State transitions
step pending → (its `when` holds and it is the first pending) shown → done (its `done` holds; saved). Tips off:
nothing shown, steps still recorded as done.

## 7. Persistence
Save schema 10 `tutorial: { done: [ids], skipped }`.

## 8. Edge cases
Visitors never see tips. Menus hide the tip (it is drawn only over play). Session events (walked, menus opened) are
not saved; a step they finished is.

## 9. Failure handling
Unknown step ids in a save are kept but ignored; a malformed record loads as tips on, nothing done.

## 10. Source files
`src/game/tutorial.ts`, `LiveWorld.stepTutorial`, `tutorialTip`, `setTips`, `noteEvent`, `GameUI.drawTip`,
`src/ui/screens/settings.ts`.

## 11. Automated tests
`tests/tutorial.test.ts`, `tests/first-home.test.ts` (the steps follow chapter 1 played for real),
`tests/onboarding.test.ts` (schema 10).

## 12. Known limitations
Tips are English capitals in the tiny font. Steps beyond the first hours (fishing, growth itself, visiting) are in
the in-game player guide, not tips.

## 13. Extension points
A step is one entry in `TUTORIAL_STEPS`.
