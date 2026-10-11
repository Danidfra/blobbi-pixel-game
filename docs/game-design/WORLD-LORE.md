# World lore

The in-game lore is game-specific to Blobbi Pixel: it describes this island and its World Carrier, makes no claim
about the wider Blobbi universe, and is not a protocol definition (header of `src/content/lore.ts`). Tone: warm,
curious, a little mysterious, never dark. The texts themselves live in `src/content/lore.ts` (19 notes) and are
listed by id and title in the [content catalogue](CONTENT-CATALOG.md). **IMPLEMENTED**.

## The story the notes tell

1. **Arrival.** You wake on a small, warm island with the sea all around, and a curious Blobbi watching you.
2. **The island moves.** It rides the shell of an enormous turtle; old sailors called such creatures World
   Carriers. Soil gathered on its shell over ages of dust, driftwood, feathers and seeds.
3. **The hum.** By the great head there is a deep, slow hum under the waves; hum back, and an eye opens.
4. **Blobbis and Carriers.** A letter in a bottle says Blobbis are found on almost every Carrier, and a Carrier with
   a happy Blobbi swims a little higher.
5. **Keepers.** Someone looked after the island before you: cairns, an old sign, a planted pond, journal pages, a
   small treasure left "for whoever comes next".
6. **The Carrier Stone and the scale.** Warm, ringed stones and shed pieces of shell link the island to its Carrier.
7. **Where to.** The Carrier never seems lost; maybe one day it will meet another.
8. **Restoring.** A well-tended island makes its Carrier strong and calm.
9. **Grown land (M7).** The shore widens, a meadow, a young wood, a rocky garden, the deep green: the land grows
   because it is welcome.

## Carriers in the lore

| Species | Lore (from `src/carriers/species.ts`) |
|---|---|
| Turtle | The oldest turtles carry the oldest islands. A turtle never hurries, and never stops. |
| Manta | No two mantas wear the same spots. Where a manta glides, the water is always clear. |
| Whale (prototype) | On a whale everything is a long walk, and every walk ends at the sea. When it sings, the ridge hums. |

The Carrier observations (eight for the turtle, six for the manta) are listed in the content catalogue.

## Known discrepancy

Seven notes speak of "the turtle" (`carriers`, `keepers`, `carrier-stone`, `where-to`, `restoring`, `treasure`, `carving`). On a manta island
(M7) they read slightly wrong. Listed in [known issues](../testing/KNOWN-ISSUES.md).
