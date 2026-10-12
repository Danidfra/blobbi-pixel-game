# Content catalogue

> **GENERATED** from the game's registries by `npx tsx scripts/content-catalog.ts`. Do not edit by hand: change the
> content in `src/content/` (or the registries named below) and run the script again. Everything listed here is
> **IMPLEMENTED** in code; whether it has been played and approved by a person is tracked in
> [the manual test plan](../testing/MANUAL-TEST-PLAN.md).

## Counts

| Content | Count | Source |
|---|---|---|
| Items | 121 | `game/items.ts` `ALL_ITEMS` |
| Crops | 11 | `content/crops.ts` |
| Forage kinds | 5 | `content/forage.ts` |
| Placeable kinds (incl. the shelter) | 44 | `game/buildings.ts` `BUILDINGS` |
| Recipes | 66 | `game/crafting.ts` `RECIPES` |
| Meals | 19 | `content/meals.ts` |
| Quests | 38 | `content/quests.ts` |
| Island requests | 8 | `content/quests.ts` `REQUEST_POOL` |
| Lore notes | 20 | `content/lore.ts` |
| Discoveries (island) | 8 | `content/discoveries.ts` |
| Discoveries (grown land) | 6 | `content/discoveries.ts` `GROWTH_DISCOVERIES` |
| Fish | 4 | `content/tools.ts` |
| Tool upgrades | 4 | `content/tools.ts` |
| Biomes (grown land) | 6 | `world/growth.ts` |
| Growth stages | 4 | `world/growth.ts` |
| Carrier observations (turtle / manta / whale) | 8 / 6 / 8 | `game/carrier.ts` |
| Sound effects | 59 | `audio/sfx.ts` |
| Music moods | 6 | `audio/music.ts` |

## Items by menu category

### Materials (12)

| Item | Id | Stack | Notes |
|---|---|---|---|
| stick | `blobbi-pixel:resource:stick` | 50 |  |
| stone | `blobbi-pixel:resource:stone` | 30 |  |
| wood | `blobbi-pixel:material:wood` | 40 |  |
| wheat | `blobbi-pixel:material:wheat` | 40 |  |
| sunflower | `blobbi-pixel:flower:sunflower` | 20 |  |
| tulip | `blobbi-pixel:flower:tulip` | 20 |  |
| lavender sprig | `blobbi-pixel:flower:lavender` | 30 |  |
| wild fibre | `blobbi-pixel:resource:fibre` | 40 |  |
| wild herb | `blobbi-pixel:resource:herb` | 30 |  |
| sea shell | `blobbi-pixel:resource:shell` | 30 |  |
| cloth | `blobbi-pixel:material:cloth` | 30 |  |
| copper ore | `blobbi-pixel:material:copper-ore` | 30 |  |

### Seeds (11)

| Item | Id | Stack | Notes |
|---|---|---|---|
| seed | `blobbi-pixel:resource:seed` | 20 |  |
| radish seed | `blobbi-pixel:seed:radish` | 20 |  |
| carrot seed | `blobbi-pixel:seed:carrot` | 20 |  |
| seed potato | `blobbi-pixel:seed:potato` | 20 |  |
| tomato seed | `blobbi-pixel:seed:tomato` | 20 |  |
| strawberry runner | `blobbi-pixel:seed:strawberry` | 20 |  |
| wheat seed | `blobbi-pixel:seed:wheat` | 20 |  |
| pumpkin seed | `blobbi-pixel:seed:pumpkin` | 20 |  |
| sunflower seed | `blobbi-pixel:seed:sunflower` | 20 |  |
| tulip bulb | `blobbi-pixel:seed:tulip` | 20 |  |
| lavender seed | `blobbi-pixel:seed:lavender` | 20 |  |

### Food (32)

| Item | Id | Stack | Notes |
|---|---|---|---|
| turnip | `blobbi-pixel:food:turnip` | 20 | food: +25 fed |
| radish | `blobbi-pixel:food:radish` | 30 | food: +15 fed, +2 joy |
| carrot | `blobbi-pixel:food:carrot` | 20 | food: +35 fed |
| potato | `blobbi-pixel:food:potato` | 30 | food: +20 fed |
| tomato | `blobbi-pixel:food:tomato` | 30 | food: +15 fed, +3 joy |
| strawberry | `blobbi-pixel:food:strawberry` | 40 | food: +10 fed, +6 joy |
| pumpkin | `blobbi-pixel:food:pumpkin` | 10 | food: +60 fed |
| mushroom | `blobbi-pixel:food:mushroom` | 30 | food: +8 fed |
| wild berry | `blobbi-pixel:food:wild-berry` | 40 | food: +6 fed, +3 joy |
| toasted seeds | `blobbi-pixel:meal:toasted-seeds` | 10 | food: +12 fed, +2 joy |
| berry snack | `blobbi-pixel:meal:berry-snack` | 10 | food: +20 fed, +8 joy |
| roasted turnip | `blobbi-pixel:meal:roasted-turnip` | 10 | food: +40 fed, +3 joy |
| baked potato | `blobbi-pixel:meal:baked-potato` | 10 | food: +45 fed, +5 energy |
| carrot soup | `blobbi-pixel:meal:carrot-soup` | 10 | food: +50 fed, +5 energy, +5 joy |
| vegetable mix | `blobbi-pixel:meal:vegetable-mix` | 10 | food: +55 fed, +6 joy |
| radish salad | `blobbi-pixel:meal:radish-salad` | 10 | food: +30 fed, +8 energy, +6 joy |
| bread | `blobbi-pixel:meal:bread` | 10 | food: +30 fed, +5 energy |
| mushroom soup | `blobbi-pixel:meal:mushroom-soup` | 10 | food: +50 fed, +15 energy |
| tomato soup | `blobbi-pixel:meal:tomato-soup` | 10 | food: +45 fed, +8 joy |
| berry porridge | `blobbi-pixel:meal:porridge` | 10 | food: +45 fed, +15 energy, +4 joy |
| lavender tea | `blobbi-pixel:meal:lavender-tea` | 10 | food: +5 fed, +25 energy, +8 joy |
| strawberry tart | `blobbi-pixel:meal:strawberry-tart` | 10 | food: +35 fed, +15 joy |
| pumpkin stew | `blobbi-pixel:meal:pumpkin-stew` | 10 | food: +80 fed, +15 energy, +5 joy |
| harvest feast | `blobbi-pixel:meal:harvest-feast` | 10 | food: +100 fed, +25 energy, +25 joy |
| grilled minnows | `blobbi-pixel:meal:grilled-minnows` | 10 | food: +35 fed, +5 energy |
| fish soup | `blobbi-pixel:meal:fish-soup` | 10 | food: +55 fed, +15 energy, +3 joy |
| perch roast | `blobbi-pixel:meal:perch-roast` | 10 | food: +55 fed, +6 joy |
| rainbow platter | `blobbi-pixel:meal:rainbow-platter` | 10 | food: +60 fed, +10 energy, +25 joy |
| minnow | `blobbi-pixel:food:minnow` | 20 | food: +6 fed |
| sea bream | `blobbi-pixel:food:sea-bream` | 20 | food: +12 fed, +1 joy |
| pond perch | `blobbi-pixel:food:pond-perch` | 20 | food: +12 fed, +1 joy |
| rainbow fish | `blobbi-pixel:food:rainbow-fish` | 20 | food: +15 fed, +8 joy |

### Tools (9)

| Item | Id | Stack | Notes |
|---|---|---|---|
| simple axe | `blobbi-pixel:tool:simple-axe` | 1 | tool: chop |
| simple pickaxe | `blobbi-pixel:tool:simple-pickaxe` | 1 | tool: mine |
| simple hoe | `blobbi-pixel:tool:simple-hoe` | 1 | tool: till |
| watering can | `blobbi-pixel:tool:watering-can` | 1 | tool: water |
| copper axe | `blobbi-pixel:tool:copper-axe` | 1 | tool: chop (tier 2) |
| copper pickaxe | `blobbi-pixel:tool:copper-pickaxe` | 1 | tool: mine (tier 2) |
| copper hoe | `blobbi-pixel:tool:copper-hoe` | 1 | tool: till (tier 2) |
| copper watering can | `blobbi-pixel:tool:copper-can` | 1 | tool: water (tier 2) |
| fishing rod | `blobbi-pixel:tool:fishing-rod` | 1 | tool: fish |

### Furniture (43)

| Item | Id | Stack | Notes |
|---|---|---|---|
| workbench | `blobbi-pixel:furniture:workbench` | 10 | places: workbench |
| wooden chest | `blobbi-pixel:furniture:chest` | 10 | places: chest |
| cooking station | `blobbi-pixel:furniture:cooking-station` | 10 | places: cooking-station |
| cabinet | `blobbi-pixel:furniture:cabinet` | 10 | places: cabinet |
| bed | `blobbi-pixel:furniture:bed` | 10 | places: bed |
| Blobbi cushion | `blobbi-pixel:furniture:pet-bed` | 10 | places: pet-bed |
| wooden chair | `blobbi-pixel:furniture:chair` | 10 | places: chair |
| armchair | `blobbi-pixel:furniture:armchair` | 10 | places: armchair |
| stool | `blobbi-pixel:furniture:stool` | 10 | places: stool |
| small table | `blobbi-pixel:furniture:table` | 10 | places: table |
| dining table | `blobbi-pixel:furniture:dining-table` | 10 | places: dining-table |
| bookshelf | `blobbi-pixel:furniture:bookshelf` | 10 | places: bookshelf |
| wall shelf | `blobbi-pixel:furniture:wall-shelf` | 10 | places: wall-shelf |
| Carrier painting | `blobbi-pixel:furniture:painting` | 10 | places: painting |
| wall clock | `blobbi-pixel:furniture:wall-clock` | 10 | places: wall-clock |
| wall lantern | `blobbi-pixel:furniture:wall-lantern` | 10 | places: wall-lantern |
| floor lamp | `blobbi-pixel:furniture:floor-lamp` | 10 | places: floor-lamp |
| round rug | `blobbi-pixel:furniture:rug` | 10 | places: rug |
| potted plant | `blobbi-pixel:furniture:potted-plant` | 10 | places: potted-plant |
| flower vase | `blobbi-pixel:furniture:vase` | 10 | places: vase |
| music box | `blobbi-pixel:furniture:music-box` | 10 | places: music-box |
| toy ball | `blobbi-pixel:furniture:toy-ball` | 10 | places: toy-ball |
| picket fence | `blobbi-pixel:furniture:picket-fence` | 10 | places: picket-fence |
| low stone wall | `blobbi-pixel:furniture:stone-wall` | 10 | places: stone-wall |
| stone path | `blobbi-pixel:furniture:stone-path` | 10 | places: stone-path |
| boardwalk | `blobbi-pixel:furniture:boardwalk` | 10 | places: boardwalk |
| signpost | `blobbi-pixel:furniture:signpost` | 10 | places: signpost |
| scarecrow | `blobbi-pixel:furniture:scarecrow` | 10 | places: scarecrow |
| bird bath | `blobbi-pixel:furniture:bird-bath` | 10 | places: bird-bath |
| stone cairn | `blobbi-pixel:furniture:cairn` | 10 | places: cairn |
| log seat | `blobbi-pixel:furniture:log-seat` | 10 | places: log-seat |
| sprinkler | `blobbi-pixel:furniture:sprinkler` | 10 | places: sprinkler |
| bird feeder | `blobbi-pixel:furniture:bird-feeder` | 10 | places: bird-feeder |
| flower arch | `blobbi-pixel:furniture:flower-arch` | 10 | places: flower-arch |
| Blobbi statue | `blobbi-pixel:furniture:blobbi-statue` | 10 | places: blobbi-statue |
| herb planter | `blobbi-pixel:furniture:herb-planter` | 10 | places: herb-planter |
| wind chime | `blobbi-pixel:furniture:wind-chime` | 10 | places: wind-chime |
| hay bale | `blobbi-pixel:furniture:hay-bale` | 10 | places: hay-bale |
| wooden fence | `blobbi-pixel:furniture:fence` | 10 | places: fence |
| flower bed | `blobbi-pixel:furniture:flower-bed` | 10 | places: flower-bed |
| small lantern | `blobbi-pixel:furniture:lantern` | 10 | places: lantern |
| wooden bench | `blobbi-pixel:furniture:bench` | 10 | places: bench |
| storage crate | `blobbi-pixel:furniture:crate` | 10 | places: crate |

### Special (14)

| Item | Id | Stack | Notes |
|---|---|---|---|
| message in a bottle | `blobbi-pixel:special:bottle` | 1 |  |
| Carrier Stone | `blobbi-pixel:special:carrier-stone` | 1 |  |
| journal page | `blobbi-pixel:special:page-1` | 1 |  |
| second journal page | `blobbi-pixel:special:page-2` | 1 |  |
| shed scale | `blobbi-pixel:special:scale` | 1 |  |
| moonbloom | `blobbi-pixel:special:moonbloom` | 1 |  |
| small treasure | `blobbi-pixel:special:treasure` | 1 |  |
| driftwood carving | `blobbi-pixel:special:carving` | 1 |  |
| pressed bloom | `blobbi-pixel:special:pressed-bloom` | 1 |  |
| carved acorn cap | `blobbi-pixel:special:acorn-cap` | 1 |  |
| little geode | `blobbi-pixel:special:geode` | 1 |  |
| blue sea glass | `blobbi-pixel:special:sea-glass` | 1 |  |
| glowcap | `blobbi-pixel:special:glowcap` | 1 |  |
| golden seed | `blobbi-pixel:special:golden-seed` | 1 |  |

## Crops

| Crop | Yield | Seeds back | Wet seconds to grow | Seconds per watering | Multi-harvest |
|---|---|---|---|---|---|
| turnip | 2 turnips | 0 | 90 | 45 | no |
| radish | 3 radishes | 1 | 60 | 30 | no |
| carrot | 2 carrots | 1 | 150 | 50 | no |
| potato | 4 potatoes | 1 | 180 | 60 | no |
| tomato | 2 tomatoes | 1 | 200 | 50 | yes (every 80 s) |
| strawberry | 2 strawberries | 1 | 160 | 40 | yes (every 60 s) |
| wheat | 3 wheat | 1 | 120 | 60 | no |
| pumpkin | 1 pumpkins | 2 | 240 | 80 | no |
| sunflower | 1 sunflowers | 2 | 150 | 50 | no |
| tulip | 2 tulips | 1 | 100 | 50 | no |
| lavender | 3 lavender sprigs | 1 | 120 | 40 | no |

## Forage (wild resources)

| Kind | Item | Grows near | Respawn (world s) |
|---|---|---|---|
| fibre | wild fibre | grass-tuft | 120 |
| mushroom | mushroom | tree-shade | 240 |
| berry | wild berry | bush | 200 |
| herb | wild herb | meadow | 180 |
| shell | sea shell | beach | 240 |

## Placeables (buildings, decorations, furniture)

| Kind | Label | Category | Where | Layer | Use | Cost | Build (s) |
|---|---|---|---|---|---|---|---|
| shelter | wooden shelter | building | outdoor | solid | sleep | 6 wood, 3 stone | 24 |
| fence | wooden fence | decoration | outdoor | solid | admire | 2 wood | 2 |
| flower-bed | flower bed | decoration | outdoor | solid | admire | 1 wood, 2 seed | 4 |
| lantern | small lantern | decoration | outdoor | solid | light | 1 wood, 2 stone, 1 stick | 3 |
| bench | wooden bench | decoration | outdoor | solid | sit | 3 wood, 1 stick | 5 |
| crate | storage crate | decoration | outdoor | solid | admire | 4 wood, 2 stick | 5 |
| workbench | workbench | decoration | both | solid | craft | 5 wood, 3 stick, 2 stone | 2 |
| chest | wooden chest | decoration | both | solid | storage | 6 wood, 2 stone | 2 |
| cooking-station | cooking station | decoration | both | solid | cook | 8 stone, 2 wood, 2 stick | 2 |
| cabinet | cabinet | furniture | indoor | solid | storage | 8 wood, 2 stone | 0 |
| bed | bed | furniture | indoor | solid | sleep | 6 wood, 3 cloth | 0 |
| pet-bed | Blobbi cushion | furniture | indoor | floor | nap | 3 cloth, 1 wood | 0 |
| chair | wooden chair | furniture | indoor | solid | sit | 3 wood, 2 stick | 0 |
| armchair | armchair | furniture | indoor | solid | sit | 4 wood, 3 cloth | 0 |
| stool | stool | furniture | indoor | solid | sit | 2 wood, 1 stick | 0 |
| table | small table | furniture | indoor | solid | admire | 4 wood | 0 |
| dining-table | dining table | furniture | indoor | solid | admire | 7 wood, 2 stick | 0 |
| bookshelf | bookshelf | furniture | indoor | solid | read | 6 wood, 1 cloth | 0 |
| wall-shelf | wall shelf | furniture | indoor | wall | admire | 3 wood, 2 stone | 0 |
| painting | Carrier painting | furniture | indoor | wall | admire | 2 wood, 1 cloth, 1 sunflower | 0 |
| wall-clock | wall clock | furniture | indoor | wall | time | 3 wood, 1 stone, 1 sea shell | 0 |
| wall-lantern | wall lantern | furniture | indoor | wall | light | 1 wood, 2 stone, 1 stick | 0 |
| floor-lamp | floor lamp | furniture | indoor | solid | light | 2 wood, 2 stone, 2 cloth | 0 |
| rug | round rug | furniture | indoor | floor | admire | 4 cloth | 0 |
| potted-plant | potted plant | decoration | both | solid | admire | 2 stone, 1 seed | 2 |
| vase | flower vase | furniture | indoor | solid | admire | 2 stone, 2 tulip | 0 |
| music-box | music box | furniture | indoor | solid | music | 3 wood, 2 sea shell | 0 |
| toy-ball | toy ball | decoration | both | floor | play | 2 cloth, 1 wild fibre | 2 |
| picket-fence | picket fence | decoration | outdoor | solid | admire | 3 wood | 2 |
| stone-wall | low stone wall | decoration | outdoor | solid | admire | 5 stone | 2 |
| stone-path | stone path | decoration | outdoor | floor |  | 2 stone | 2 |
| boardwalk | boardwalk | decoration | outdoor | floor |  | 1 wood | 2 |
| signpost | signpost | decoration | outdoor | solid | read | 2 wood, 1 stick | 2 |
| scarecrow | scarecrow | decoration | outdoor | solid | admire | 3 stick, 2 cloth, 1 wheat | 2 |
| bird-bath | bird bath | decoration | outdoor | solid | birds | 6 stone | 2 |
| cairn | stone cairn | decoration | outdoor | solid | admire | 4 stone | 2 |
| log-seat | log seat | decoration | outdoor | solid | sit | 3 wood | 2 |
| sprinkler | sprinkler | decoration | outdoor | solid | sprinkle | 4 stone, 2 wood, 1 sea shell | 2 |
| bird-feeder | bird feeder | decoration | outdoor | solid | birds | 3 wood, 1 stick, 2 seed | 2 |
| flower-arch | flower arch | decoration | outdoor | open | admire | 3 wood, 2 stick, 3 wild fibre | 2 |
| blobbi-statue | Blobbi statue | decoration | outdoor | solid | admire | 8 stone | 2 |
| herb-planter | herb planter | decoration | outdoor | solid | herbs | 4 wood, 2 wild herb | 2 |
| wind-chime | wind chime | decoration | outdoor | solid | music | 2 stick, 3 sea shell | 2 |
| hay-bale | hay bale | decoration | outdoor | solid | sit | 4 wheat, 1 wild fibre | 2 |

## Recipes

| Recipe | Output | Ingredients | Station | Group | Unlocked by |
|---|---|---|---|---|---|
| Simple axe | 1 simple axe | 3 stick, 2 stone | hand | tools | known from the start |
| Simple pickaxe | 1 simple pickaxe | 2 wood, 2 stick, 3 stone | hand | tools | known from the start |
| Simple hoe | 1 simple hoe | 1 wood, 2 stick, 1 stone | hand | tools | known from the start |
| Cloth | 1 cloth | 2 wild fibre | workbench | materials | known from the start |
| Workbench | 1 workbench | 5 wood, 3 stick, 2 stone | hand | furniture | known from the start |
| Wooden chest | 1 wooden chest | 6 wood, 2 stone | hand | furniture | known from the start |
| Cooking station | 1 cooking station | 8 stone, 2 wood, 2 stick | hand | furniture | harvest |
| Cabinet | 1 cabinet | 8 wood, 2 stone | workbench | furniture | side-storage |
| Bed | 1 bed | 6 wood, 3 cloth | workbench | furniture | shelter |
| Blobbi cushion | 1 Blobbi cushion | 3 cloth, 1 wood | workbench | furniture | feed |
| Wooden chair | 1 wooden chair | 3 wood, 2 stick | workbench | furniture | shelter |
| Armchair | 1 armchair | 4 wood, 3 cloth | workbench | furniture | feed |
| Stool | 1 stool | 2 wood, 1 stick | workbench | furniture | shelter |
| Small table | 1 small table | 4 wood | workbench | furniture | shelter |
| Dining table | 1 dining table | 7 wood, 2 stick | workbench | furniture | cook |
| Bookshelf | 1 bookshelf | 6 wood, 1 cloth | workbench | furniture | carrier |
| Wall shelf | 1 wall shelf | 3 wood, 2 stone | workbench | furniture | home |
| Carrier painting | 1 Carrier painting | 2 wood, 1 cloth, 1 sunflower | workbench | furniture | mystery |
| Wall clock | 1 wall clock | 3 wood, 1 stone, 1 sea shell | workbench | furniture | side-shells |
| Wall lantern | 1 wall lantern | 1 wood, 2 stone, 1 stick | workbench | furniture | shelter |
| Floor lamp | 1 floor lamp | 2 wood, 2 stone, 2 cloth | workbench | furniture | home |
| Round rug | 1 round rug | 4 cloth | workbench | furniture | shelter |
| Potted plant | 1 potted plant | 2 stone, 1 seed | workbench | outdoor | shelter |
| Flower vase | 1 flower vase | 2 stone, 2 tulip | workbench | furniture | side-flowers |
| Music box | 1 music box | 3 wood, 2 sea shell | workbench | furniture | discover-bottle |
| Toy ball | 1 toy ball | 2 cloth, 1 wild fibre | workbench | outdoor | feed |
| Picket fence | 1 picket fence | 3 wood | workbench | outdoor | improve |
| Low stone wall | 1 low stone wall | 5 stone | workbench | outdoor | improve |
| Stone path | 2 stone path | 2 stone | hand | outdoor | known from the start |
| Boardwalk | 2 boardwalk | 1 wood | hand | outdoor | known from the start |
| Signpost | 1 signpost | 2 wood, 1 stick | workbench | outdoor | improve |
| Scarecrow | 1 scarecrow | 3 stick, 2 cloth, 1 wheat | workbench | outdoor | plant |
| Bird bath | 1 bird bath | 6 stone | workbench | outdoor | improve |
| Stone cairn | 1 stone cairn | 4 stone | hand | outdoor | known from the start |
| Log seat | 1 log seat | 3 wood | hand | outdoor | known from the start |
| Sprinkler | 1 sprinkler | 4 stone, 2 wood, 1 sea shell | workbench | outdoor | side-farmer |
| Bird feeder | 1 bird feeder | 3 wood, 1 stick, 2 seed | workbench | outdoor | improve |
| Flower arch | 1 flower arch | 3 wood, 2 stick, 3 wild fibre | workbench | outdoor | improve |
| Blobbi statue | 1 Blobbi statue | 8 stone | workbench | outdoor | side-friend |
| Herb planter | 1 herb planter | 4 wood, 2 wild herb | workbench | outdoor | cook |
| Wind chime | 1 wind chime | 2 stick, 3 sea shell | workbench | outdoor | side-shells |
| Hay bale | 1 hay bale | 4 wheat, 1 wild fibre | workbench | outdoor | harvest |
| Toasted seeds | 1 toasted seeds | 3 seed | cooking | meals | known from the start |
| Berry snack | 1 berry snack | 3 wild berry | cooking | meals | known from the start |
| Roasted turnip | 1 roasted turnip | 1 turnip | cooking | meals | known from the start |
| Baked potato | 1 baked potato | 1 potato | cooking | meals | known from the start |
| Carrot soup | 1 carrot soup | 2 carrot, 1 wild herb | cooking | meals | cook |
| Vegetable mix | 1 vegetable mix | 1 turnip, 1 carrot, 1 radish | cooking | meals | cook |
| Radish salad | 1 radish salad | 2 radish, 1 wild herb | cooking | meals | cook |
| Bread | 1 bread | 2 wheat | cooking | meals | side-chef |
| Mushroom soup | 1 mushroom soup | 2 mushroom, 1 potato | cooking | meals | side-chef |
| Tomato soup | 1 tomato soup | 2 tomato, 1 wild herb | cooking | meals | side-chef |
| Berry porridge | 1 berry porridge | 2 wheat, 1 strawberry | cooking | meals | side-chef |
| Lavender tea | 1 lavender tea | 2 lavender sprig | cooking | meals | side-florist |
| Strawberry tart | 1 strawberry tart | 1 bread, 2 strawberry | cooking | meals | side-baker |
| Pumpkin stew | 1 pumpkin stew | 1 pumpkin, 1 potato, 1 wild herb | cooking | meals | side-baker |
| Harvest feast | 1 harvest feast | 1 pumpkin, 2 tomato, 1 bread, 1 mushroom | cooking | meals | restore |
| Grilled minnows | 1 grilled minnows | 2 minnow | cooking | meals | side-angler |
| Fish soup | 1 fish soup | 1 sea bream, 1 potato, 1 wild herb | cooking | meals | side-angler |
| Perch roast | 1 perch roast | 1 pond perch, 1 tomato | cooking | meals | side-angler |
| Rainbow platter | 1 rainbow platter | 1 rainbow fish, 2 strawberry | cooking | meals | side-angler |
| Copper Axe | 1 copper axe | 1 simple axe, 3 copper ore, 2 wood | workbench | tools | side-miner |
| Copper Pickaxe | 1 copper pickaxe | 1 simple pickaxe, 4 copper ore, 2 wood | workbench | tools | side-miner |
| Copper Hoe | 1 copper hoe | 1 simple hoe, 3 copper ore, 1 wood | workbench | tools | side-miner |
| Copper Can | 1 copper watering can | 1 watering can, 4 copper ore | workbench | tools | side-miner |
| Fishing rod | 1 fishing rod | 3 stick, 2 wild fibre | hand | tools | carrier |

## Meals

| Meal | Restores | Ingredients | Unlocked by |
|---|---|---|---|
| toasted seeds | +12 fed, +2 joy | 3 seed | with a cooking station |
| berry snack | +20 fed, +8 joy | 3 wild berry | with a cooking station |
| roasted turnip | +40 fed, +3 joy | 1 turnip | with a cooking station |
| baked potato | +45 fed, +5 energy | 1 potato | with a cooking station |
| carrot soup | +50 fed, +5 energy, +5 joy | 2 carrot, 1 wild herb | cook |
| vegetable mix | +55 fed, +6 joy | 1 turnip, 1 carrot, 1 radish | cook |
| radish salad | +30 fed, +8 energy, +6 joy | 2 radish, 1 wild herb | cook |
| bread | +30 fed, +5 energy | 2 wheat | side-chef |
| mushroom soup | +50 fed, +15 energy | 2 mushroom, 1 potato | side-chef |
| tomato soup | +45 fed, +8 joy | 2 tomato, 1 wild herb | side-chef |
| berry porridge | +45 fed, +15 energy, +4 joy | 2 wheat, 1 strawberry | side-chef |
| lavender tea | +5 fed, +25 energy, +8 joy | 2 lavender sprig | side-florist |
| strawberry tart | +35 fed, +15 joy | 1 bread, 2 strawberry | side-baker |
| pumpkin stew | +80 fed, +15 energy, +5 joy | 1 pumpkin, 1 potato, 1 wild herb | side-baker |
| harvest feast | +100 fed, +25 energy, +25 joy | 1 pumpkin, 2 tomato, 1 bread, 1 mushroom | restore |
| grilled minnows | +35 fed, +5 energy | 2 minnow | side-angler |
| fish soup | +55 fed, +15 energy, +3 joy | 1 sea bream, 1 potato, 1 wild herb | side-angler |
| perch roast | +55 fed, +6 joy | 1 pond perch, 1 tomato | side-angler |
| rainbow platter | +60 fed, +10 energy, +25 joy | 1 rainbow fish, 2 strawberry | side-angler |

## Quests

| Id | Type | Chapter | Title | Requires | Reward |
|---|---|---|---|---|---|
| `meet` | main | 1 | Meet your Blobbi |  | a new friend |
| `arrive` | main | 1 | Explore the island |  | a journal note (J) |
| `gather` | main | 1 | Gather supplies |  | +2 seeds |
| `axe` | main | 1 | Your first tool | gather | fence plans |
| `wood` | main | 1 | Gather wood | axe | +2 stones |
| `materials` | main | 1 | Building materials | wood | ready to build |
| `shelter` | main | 1 | Build your first home | materials | +3 seeds, house furniture plans |
| `enter-home` | main | 1 | Step inside | shelter | a housewarming gift: a potted plant |
| `first-furniture` | main | 1 | Make it yours | enter-home | a cozier home |
| `plot` | main | 2 | Prepare a farm plot | wood | +3 carrot seeds (new crop) |
| `plant` | main | 2 | Plant a seed | plot | flower bed plans, +3 radish seeds |
| `water` | main | 2 | Water a crop | plant | +2 seeds, a watering can |
| `harvest` | main | 2 | Harvest food | water | +2 pumpkin seeds, +2 seed potatoes, stove plans |
| `feed` | main | 2 | Feed Blobbi | harvest | lantern and bench plans, cozy furniture plans |
| `home` | main | 2 | Make it home | first-furniture | +3 cloth, +2 tomato seeds, a journal note |
| `cook` | main | 3 | A warm meal | harvest | +3 wheat seeds, new recipes, herb planter plans |
| `mystery` | main | 3 | Something that hums | home | a painting plan |
| `carrier` | main | 3 | Listen to the Carrier | mystery | +3 sunflower seeds, a journal note, bookshelf and fishing rod plans |
| `restore` | main | 3 | Begin restoring the island | carrier | two journal notes, the harvest feast recipe |
| `cottage` | main | 4 | A bigger home | home, harvest | new roof and wall colours, room styles |
| `dream-home` | main | 4 | The dream home | cottage, carrier | the last house styles, a journal note |
| `improve` | side |  | Make it pretty | axe | storage crate plans, garden decoration plans |
| `side-storage` | side |  | A place for everything | shelter | cabinet plans, +2 cloth |
| `side-shells` | side |  | Shell seeker |  | wind chime and wall clock plans, +2 strawberry runners |
| `side-flowers` | side |  | Flower friend | plant | vase plans, +3 tulip bulbs, +2 lavender seeds |
| `side-farmer` | side |  | Green thumb | harvest | sprinkler plans, +2 tomato seeds |
| `side-chef` | side |  | Little chef | cook | bread, soups and porridge recipes |
| `side-baker` | side |  | Baker | side-chef | tart and stew recipes |
| `side-florist` | side |  | Lavender fields | side-flowers | lavender tea recipe |
| `side-friend` | side |  | Best friends |  | Blobbi statue plans |
| `side-forager` | side |  | Forager |  | +2 seed potatoes, +1 strawberry runner |
| `side-cozy` | side |  | Cozy corner | home | +4 cloth |
| `side-miner` | side |  | Deeper stone |  | +3 copper ore, copper tool upgrades |
| `side-angler` | side |  | Gone fishing | carrier | fish recipes, +2 wild herbs |
| `side-favourite` | side |  | A favourite treat | feed | a happy Blobbi |
| `discover-bottle` | discovery |  | A message from far away |  | music box plans |
| `discover-pages` | discovery |  | The Keeper's pages |  | +2 cloth |
| `discover-all` | discovery |  | Collector |  | a proud Keeper |

## Island requests (repeatable, one at a time, new each dawn)

| Id | Title | Goal | Reward |
|---|---|---|---|
| `req-sticks` | Tidy up some sticks | collected × 6 | +2 seeds |
| `req-water` | Water the garden | watered × 4 | +2 radish seeds |
| `req-harvest` | Bring in the harvest | harvested × 3 | +1 cloth, +2 seeds |
| `req-cook` | Cook something nice | cooked × 1 | +2 wheat seeds |
| `req-pet` | Spend time with Blobbi | petted × 3 | +1 tulip bulb |
| `req-forage` | A walk in the wild | foraged × 5 | +1 seed potato, +1 carrot seed |
| `req-wood` | Firewood | felled × 1 | +3 stones |
| `req-feed` | A snack for Blobbi | fed × 2 | +1 strawberry runner |

## Discoveries

| Id | Item | Terrain or biome | Journal note |
|---|---|---|---|
| `bottle` | message in a bottle | beach | blobbis-and-carriers |
| `carrier-stone` | Carrier Stone | grass | carrier-stone |
| `page-1` | journal page | forest | keepers |
| `page-2` | second journal page | meadow | shell-soil |
| `scale` | shed scale | beach | scale |
| `moonbloom` | moonbloom | plateau | moonbloom |
| `treasure` | small treasure | forest | treasure |
| `carving` | driftwood carving | pond | carving |
| `pressed-bloom` | pressed bloom | grown meadow | new-meadow |
| `acorn-cap` | carved acorn cap | grown woodland | new-woodland |
| `geode` | little geode | grown rocky | new-rocky |
| `sea-glass` | blue sea glass | grown coastal | new-shore |
| `glowcap` | glowcap | grown mushroom | new-grove |
| `golden-seed` | golden seed | grown sanctuary | new-sanctuary |

## Lore notes

| Id | Title |
|---|---|
| `arrival` | A small island |
| `blobbi` | Your Blobbi |
| `carriers` | World Carriers |
| `shell-soil` | Soil on a shell |
| `hum` | The hum |
| `blobbis-and-carriers` | Blobbis and Carriers |
| `keepers` | Keepers |
| `carrier-stone` | The Carrier Stone |
| `where-to` | Where are we going? |
| `restoring` | Restoring the island |
| `scale` | A shed scale |
| `moonbloom` | Moonbloom |
| `treasure` | A small treasure |
| `carving` | Driftwood carving |
| `new-shore` | The shore widens |
| `new-meadow` | A new meadow |
| `new-woodland` | A young wood |
| `new-rocky` | The rocky garden |
| `new-grove` | The deep green |
| `new-sanctuary` | Sanctuary |

## Fishing and tool upgrades

| Fish | Water | Weight |
|---|---|---|
| minnow | both | 6 |
| sea bream | sea | 3 |
| pond perch | pond | 3 |
| rainbow fish | both | 1 |

| Upgrade | From | To | Extra |
|---|---|---|---|
| copper-axe | simple axe | copper axe | 3 copper ore, 2 wood |
| copper-pickaxe | simple pickaxe | copper pickaxe | 4 copper ore, 2 wood |
| copper-hoe | simple hoe | copper hoe | 3 copper ore, 1 wood |
| copper-can | watering can | copper watering can | 4 copper ore |

## Grown land: stages and biomes (M7)

| Stage | Name | Regions |
|---|---|---|
| 1 | The shore widens | Shore turf + Flower meadow |
| 2 | Groves and stones | Little woodland + Rocky garden |
| 3 | The deep green | Mushroom grove + Shore turf |
| 4 | Sanctuary | Sanctuary gardens |

| Biome | Name | Note |
|---|---|---|
| meadow | Flower meadow | Blooms in every colour, herbs and seeds; bees love it. |
| woodland | Little woodland | A young wood: sticks, wood and shade. |
| rocky | Rocky garden | Gravel and boulders with tough little flowers; stone and copper. |
| coastal | Shore turf | Salt-loving turf along the new shore: reeds (fibre) and shells. |
| mushroom | Mushroom grove | Soft moss under old trees, and mushrooms after rain. |
| sanctuary | Sanctuary gardens | The island spreads across the Carrier's whole back: orchards, flowers and soft lawns. |

## World Carrier species

| Species | Name | Status | Island |
|---|---|---|---|
| turtle | Shell Carrier (sea turtle) | playable | A round oval island on the dome of the shell, ringed by the rim. |
| whale | Ridge Carrier (whale) | playable | A ridge meadow along the spine with a mossy fringe, paths fore and aft; the spout is a landmark in front of it. |
| manta | Wing Carrier (manta) | playable | A wide, flat island across the central disc, with tide pools where it meets the wings. |

| Observation (turtle) | When |
|---|---|
| one great eye, slow and kind | any time |
| the flippers paddle, slow and steady | any time |
| the shell rim is warm from the sun | day |
| the island rises... and falls | any time |
| a hum you feel in your feet | any time |
| the Carrier sleeps; its breath slows | night |
| it follows a warm current | any time |
| a little tail, steering | any time |

| Observation (manta) | When |
|---|---|
| the wing tips rise and fall | any time |
| two horns curl by its mouth | any time |
| spots, like no other manta | any time |
| it glides where the water is bright | day |
| a thin tail, steering | any time |
| it drifts in wide circles | night |

| Observation (whale) | When |
|---|---|
| a spout of mist, up ahead! | any time |
| a song, deep under the ridge | any time |
| long fins, like slow wings | any time |
| the great tail rises... and sinks | any time |
| barnacles on its nose | day |
| an eye, as big as a door | any time |
| little knuckles down its back | any time |
| it swims straight, by the stars | night |

## Audio

| Music mood | Tempo (bpm) |
|---|---|
| day | 84 |
| night | 62 |
| rain | 70 |
| indoor | 76 |
| mystery | 58 |
| special | 88 |

Sound effects (59): `step-grass`, `step-path`, `step-sand`, `step-wood`, `step-shallow`, `door`, `chop`, `mine`, `till`, `plant`, `water`, `harvest`, `pickup`, `cast`, `bite`, `catch`, `place`, `store`, `take`, `craft`, `cook`, `fail`, `recipe`, `ui-open`, `ui-close`, `ui-select`, `ui-confirm`, `ui-deny`, `quest`, `discover`, `eat`, `pet`, `happy`, `curious`, `sleep`, `wake`, `friend`, `music`, `hum`, `carrier-call`, `carrier-breath`, `whale-song`, `whale-blow`, `manta-call`, `manta-glide`, `bird`, `cricket`, `owl`, `splash`, `grow`, `teleport-gather`, `teleport-dissolve`, `teleport-whoosh`, `teleport-gone`, `teleport-incoming`, `teleport-rebuild`, `teleport-arrived`, `teleport-cancelled`, `teleport-reversed`.
