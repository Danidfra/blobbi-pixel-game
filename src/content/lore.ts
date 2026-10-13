/**
 * LORE: the island's story in short notes, found through play (discoveries, quests, listening to the turtle,
 * reading). Game-specific lore for Blobbi Pixel: it describes this island and its World Carrier, makes no claim
 * about the wider Blobbi universe, and is not a protocol definition. Each note is a few sentences; edit freely.
 *
 * Tone: warm, curious, a little mysterious, never dark.
 */
export interface LoreNote {
  id: string;
  title: string;
  text: string;
}

export const LORE: readonly LoreNote[] = [
  {
    id: 'arrival',
    title: 'A small island',
    text: 'You woke on soft grass with the sea all around. The ground is warm, as if the sun were underneath it as well as above. A round little Blobbi is watching you, curious and not at all afraid.',
  },
  {
    id: 'blobbi',
    title: 'Your Blobbi',
    text: 'Blobbis seem to belong wherever things grow. This one follows you about, naps in the sun and gets very excited about food. It already feels like home is wherever it is.',
  },
  {
    id: 'carriers',
    title: 'World Carriers',
    text: 'The island moves. Slowly, steadily, it is carried across the sea on the shell of an enormous turtle. Old sailors called such creatures World Carriers: living islands that wander the oceans with whole small worlds on their backs.',
  },
  {
    id: 'shell-soil',
    title: 'Soil on a shell',
    text: 'Dig a little and the soil is deep and dark and full of seeds. Over a very long time, dust, driftwood, feathers and seeds settle on a Carrier\'s shell, and the shell keeps them warm. Islands like this one are grown, not built.',
  },
  {
    id: 'growing',
    title: 'A growing island',
    text: 'The island grew today. Not much: a strip of new turf along the shore, still damp, as if the Carrier had stretched in its sleep. Where the land reached the water there is a little landing now, and the sea is close enough to touch. Care for the island and it keeps growing.',
  },
  {
    id: 'hum',
    title: 'The hum',
    text: 'At the shore, near the great head, there is a sound under the waves: a deep, slow hum, like someone humming in their sleep. When you hum back, one huge eye opens a little, and closes again, content.',
  },
  {
    id: 'blobbis-and-carriers',
    title: 'Blobbis and Carriers',
    text: 'The bottle letter says that Blobbis are found on almost every Carrier, and that a Carrier with a happy Blobbi swims a little higher in the water. Nobody knows why. Your Blobbi certainly looks pleased with itself.',
  },
  {
    id: 'keepers',
    title: 'Keepers',
    text: 'Someone looked after this island before you: the cairns, the old sign, the planted pond. The journal pages call them Keepers, people who tend a Carrier\'s island so that the turtle carries something living and loved. It seems you are the Keeper now.',
  },
  {
    id: 'carrier-stone',
    title: 'The Carrier Stone',
    text: 'A smooth, warm stone with rings like a shell. When you hold it near the turtle, both seem to hum the same note. Perhaps every Carrier leaves such stones behind, the way trees leave seeds.',
  },
  {
    id: 'where-to',
    title: 'Where are we going?',
    text: 'The turtle never seems lost. The stars wheel overhead and the island drifts toward warmer water, past places no map shows. Maybe one day it will meet another Carrier. Maybe that is where it is going.',
  },
  {
    id: 'restoring',
    title: 'Restoring the island',
    text: 'Flowers, gardens and full bellies make the island glow a little at dusk. The pages say a well-tended island makes its Carrier strong and calm. You think you can feel the turtle breathing easier.',
  },
  {
    id: 'scale',
    title: 'A shed scale',
    text: 'A small curved piece of shell, shed long ago and polished by the sea. It is light, warm, and patterned with the same rings as the great shell under your feet.',
  },
  {
    id: 'moonbloom',
    title: 'Moonbloom',
    text: 'A pale flower that only opens where a Carrier has slept for a long time. It smells of rain. The Blobbi sneezed at it, then wanted to smell it again.',
  },
  {
    id: 'treasure',
    title: 'A small treasure',
    text: 'A pouch of polished sea glass and one old button, tucked under a root by some earlier Keeper. A note says: "for whoever comes next. look after the turtle."',
  },
  {
    id: 'carving',
    title: 'Driftwood carving',
    text: 'A little driftwood turtle, carved with care, with a tiny round Blobbi riding on its back. Someone loved this place.',
  },
  // ── Grown land (M7) ──
  {
    id: 'new-shore',
    title: 'The shore widens',
    text: 'Where the shell used to show, there is turf now, salty and springy. The Carrier did not grow; the land did, slowly, as if it had been waiting to be welcome.',
  },
  {
    id: 'new-meadow',
    title: 'A new meadow',
    text: 'Flowers came first, before the grass had even settled. Someone once wrote that a happy island blooms at its edges. It seems to be true.',
  },
  {
    id: 'new-woodland',
    title: 'A young wood',
    text: 'Little trees, all the same age, all leaning a bit toward the sea. Inside an acorn cap, someone carved a spiral: the sign for "growing".',
  },
  {
    id: 'new-rocky',
    title: 'The rocky garden',
    text: 'Stones rose with the new land, grey outside and purple inside. Tough little flowers grow between them, the kind that like wind.',
  },
  {
    id: 'new-grove',
    title: 'The deep green',
    text: 'Moss as thick as a cushion, old-looking trees, and mushrooms that glow when the sun goes down. The Carrier hums differently here: lower, slower, pleased.',
  },
  {
    id: 'new-sanctuary',
    title: 'Sanctuary',
    text: 'The land reaches almost to the Carrier\'s edges now, and the old Keepers had a word for an island like this: a sanctuary. The Carrier swims slower, as if it does not want to spill anything.',
  },
  {
    id: 'curious-seal',
    title: 'The curious seal',
    text: 'A grey seal with enormous eyes keeps coming up by the shore to see what the Blobbi is doing. When you wave, it rolls over in the water, delighted. It left a piece of sea glass on the sand, as if returning the favour.',
  },
  {
    id: 'letter-from-afar',
    title: 'A letter from afar',
    text: 'The letter in the drifting bottle is from someone on another Carrier — a whale, they say, very old and very slow. They grow beans on its back and wonder whether anyone else is out there. Someone is.',
  },
  {
    id: 'kelp-garden',
    title: 'The kelp garden',
    text: 'Out past the island the water turns green-gold: a garden of kelp swaying under the surface. The Carrier swims round it, never through it, as if it had been planted there on purpose.',
  },
  {
    id: 'silver-shoal',
    title: 'The silver shoal',
    text: 'At dawn and at dusk thousands of little fish gather near the Carrier and turn all at once, flashing like a dropped handful of coins. By full day they are gone again.',
  },
  {
    id: 'glowing-ray',
    title: 'The glowing ray',
    text: 'Some nights a ray glides past the Carrier, faintly lit from inside like a lantern under the water. The old pages call them night-lamps and say they follow Carriers to eat what drifts in their wake. Seeing one is good luck.',
  },
];

export const loreById = (id: string): LoreNote | undefined => LORE.find((l) => l.id === id);
