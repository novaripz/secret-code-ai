# Compatibility

Verified from the CurseForge project pages on 7 September 2026. Latest released Bedrock: 26.45.

## Load order (this is what the scripts write)

Resource packs — **first entry sits on top and wins** any file both packs contain:

1. System Dynamic Light RP — its own item/attachable definitions and settings book
2. Unbound Visuals — sky, fog, aurora, water (Beautiful Mode only)
3. Origin Animation — player and mob animations
4. Bare Bones — block/item textures
5. addon RPs (Nature's Touch, Nico's, Nautilus, Alex's, Purrfect, Ethercraft, Verity, Null)

Rationale: atmosphere above textures, textures above the addons' own art, and the dynamic-light
definitions above everything so they can't be overwritten. Prefer Bare Bones' own sky over
Unbound Visuals? Move `"Bare Bones"` above `"Unbound Visuals"` in `profiles\beautiful.json`.

## Domain split (why this set doesn't collide)

Each system has exactly one owner:

| System | Owner | Everything else must stay out |
|---|---|---|
| Surface biomes / trees / plants | Nature's Touch | Better Trees, Expansive Biomes, Bedrock Reimagined, NatureCraft |
| Caves | Nico's Cave Expansion | Beyond The Underground, Cavern Calamity, Caves+ |
| Structures | Structure Mayhem | Ruins, Legacy Stone, Structures Arises |
| Oceans | Nautilus Expansion (mobs) | Aqueous Depths, Gigantic Oceans (both world-gen) |
| Land animals | Alex's Mobs (+ Purrfect cats, which only add) | Animals nature, More Pets |
| Sky / fog / lighting look | Unbound Visuals | Mystica, Newb, any second shader pack |
| Block textures | Bare Bones | any second full texture pack |
| Extra dimension | Ethercraft | any second dimension addon |
| Dynamic light | System Dynamic Light | any second dynamic-light addon |
| Storage | Better Backpacks | any second backpack addon |
| Vehicles | Nuckem Vehicles | any second car addon |
| Horror / stalker | Null, then Verity | Twixxel's Stalkers **and Herobrine Lurking** — one stalker per world |

## Never combine

1. Unbound Visuals **+** Mystica Shader — one atmosphere pack at a time.
2. Unbound Visuals **+** Aqueous Depths — Aqueous Depths states Vibrant Visuals is not compatible.
3. Nature's Touch **+** any other biome/tree world-gen addon.
4. Null **+** Twixxel's Stalkers — two script horror systems fighting over ambience and player state.
5. Any loader shader (Newb x Daydream et al) **+** anything — it needs a patched client.
6. Two texture packs both replacing all blocks.

## Experimental features and achievements

Two addons need experiments: Verity needs **Beta APIs** (`gametest`), and Nuckem Vehicles needs
Beta APIs plus **Upcoming Creator Features** (`upcoming_creator_features`). The mode scripts
switch both on automatically in the chosen world (`level.dat` edit, backup first, file
re-verified after). Since Verity already forces Beta APIs, the cars add no further cost.
Consequences, stated once:

- Achievements are **off** in that world, permanently. No Bedrock world can have both.
- The world shows as *Experimental* on the world list. Normal.
- Null benefits from the same toggle — beta script modules only resolve when it's on.

Want achievements back? Run a second world with `9-HORROR-OFF.cmd` applied and Verity/Null
removed from `profiles\beautiful.json` — but a world that has ever had Beta APIs on stays
flagged, so use a fresh world for that.

## Version reality check

| Pack | Newest tagged version | Note |
|---|---|---|
| Nature's Touch, Nico's Cave, Alex's Mobs, Purrfect, Ore Boost, Higher Discount, Ethercraft, Verity, Unbound Visuals, System Dynamic Light, Origin Animation | 26.40 | current |
| Better Backpacks | 26.40 | current |
| Nautilus Expansion, Nuckem Vehicles | 26.30 | one drop behind |
| Structure Mayhem | 26.20 | structures only, no scripts — low risk |
| Bare Bones | 1.21.132 | textures only — no scripts to break |
| **Null** | **26.20** | script pack — the real risk. Test it with `8-HORROR-TEST-WORLD.cmd` first. |
| Twixxel's Stalkers | 26.30 | optional, untested on 26.40 |

Rule of thumb: after a big Minecraft update, check the pages before updating the game, or pause
Minecraft's auto-update in the Microsoft Store while a series is running.

## Multiplayer

Only the host installs anything — Bedrock sends the world's packs to joining players. Turn on
*Require players to accept resource packs*. Vibrant Visuals is a per-player device setting, so a
friend on a weaker PC can leave it off and still play in the same world.

## Performance

This is a heavy set (five content addons plus an atmosphere pack). If the stream stutters:
Performance Mode first, then drop, in this order, from `profiles\performance.json`:
Structure Mayhem → Nautilus → Nico's Cave → Nature's Touch.
