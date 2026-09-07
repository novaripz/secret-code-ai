# What to download (and from where)

Everything here is downloaded by **you** from the official CurseForge project pages.
Nothing in this repo contains addon files — that is deliberate, the creators' files are
theirs to distribute.

Save every file you download into `addons\downloads\`, then run `2-INSTALL-ADDONS.cmd`.

Checked against CurseForge on **7 September 2026**. Latest released Bedrock version at
that time: **26.45** (26.50 game drop pending). Target line for this pack: **26.40+**.

## Core set — download all of these

| # | Project | Link | File verified | Supports | What it is |
|---|---------|------|---------------|----------|------------|
| 1 | System Dynamic Light | https://www.curseforge.com/minecraft-bedrock/addons/system-dynamic-lights | System Dynamic Lights V3.2.9 (28 Aug 2026) | 26.40, 26.30, 26.20, 26.13, 26.12 | Behaviour **+** resource pack (both required). Torch/lantern in hand lights up caves. No experimental toggles, works in multiplayer. |
| 2 | Unbound Visuals | https://www.curseforge.com/minecraft-bedrock/texture-packs/unbound-visuals | Unbound Visuals v2.3.1.mcpack (23 Aug 2026) | 26.40, 26.30, 26.20, 26.13, 26.12 | Resource pack. Aurora, shooting stars, god rays, volumetric fog, water caustics. Plain `.mcpack`, no loader. Needs **Vibrant Visuals** on. |
| 3 | Alex's Mobs | https://www.curseforge.com/minecraft-bedrock/addons/alex-mobs | Alexs Mobs.mcaddon, 26.40 build (18 Aug 2026) | 26.40, 26.30, 26.20, 26.13, 26.12 | `.mcaddon` (behaviour + resource inside). 40+ new animals. MIT licence, states multiplayer compatibility. |
| 4 | Purrfect Companions — Tameable Cats | https://www.curseforge.com/minecraft-bedrock/addons/purrfect-companions | Purrfect Companions 3.52.0 (7 Sep 2026) | 26.40 | `.mcaddon`. Six new tameable/rideable cats — **adds** entities, does not replace vanilla cats. |
| 5 | Ore Boost | https://www.curseforge.com/minecraft-bedrock/addons/ore-boost | Ore Boost V1.3 (6 Sep 2026) | 26.40, 26.30, 26.20, 26.13, 26.12 + older | Behaviour/data pack. +50% diamond, copper, iron, gold. Page states no experimental mode, achievements friendly. |
| 6 | Higher Discount From Cured Villagers | https://www.curseforge.com/minecraft-bedrock/addons/higher-discount-from-cured-villagers | Higher Discount V3 (2 Sep 2026) | 26.40, 26.30, 26.20, 26.13, 26.12 | Behaviour/data pack. Bigger cured-villager trade discounts. No experimental mode. |
| 7 | Ethercraft: Dream Dimension | https://www.curseforge.com/minecraft-bedrock/addons/ethercraft-dream-dimension | Ethercraft 1.12 (26.40+) (24 Aug 2026) | 26.40+ | `.mcaddon`, adds a custom dimension via a quartz portal in the Nether. No longer needs experimental features (since 1.10). Friends can come along. |

**Note on the project page slug:** the Purrfect Companions link in the original brief
(`.../purrfect-companions-tameable-cats`) returns 404. The live project is
`.../addons/purrfect-companions`.

## Optional — horror, test world only

| Project | Link | File verified | Supports | Why it's separate |
|---------|------|---------------|----------|-------------------|
| Null — Undefined Code | https://www.curseforge.com/minecraft-bedrock/addons/null-undefined-code | Null — Undefined Code 1.0.1 (25 May 2026) | **26.20 only** | Kept as its own optional addon as requested. Its newest file is four game versions behind, and it rewrites time of day, blocks, inventory names and has a "kick player" feature. Throwaway world only. |
| Twixxel's Stalkers | https://www.curseforge.com/minecraft-bedrock/addons/twixxels-stalkers-bedrock-edition | Twixxel's Stalkers 2.1.0 (10 Jul 2026) | 26.30, 26.20, 26.13, 26.11 (26.40 **not** listed) | Script-heavy stalker entity. Not confirmed on 26.40. Test on its own before it ever touches the survival world, and never at the same time as Null. |

## Deliberately not in the pack

| Project | Why not |
|---------|---------|
| **Newb x Daydream** — https://www.curseforge.com/minecraft-bedrock/texture-packs/newb-x-daydream | On Windows it needs the **Wyvern Loader** (equivalently BetterRenderDragon) — a third-party patch of the Minecraft executable, not an in-game resource pack. That is real technical work, breaks on every game update, and is unsupported. Unbound Visuals gives the same aurora/shooting-star look through the official Vibrant Visuals pipeline with a plain `.mcpack`. Latest file: nxd-1.785-merged.mcpack (6 Sep 2026), 26.40/26.30. |
| **Animals nature** — https://www.curseforge.com/minecraft-bedrock/addons/animals-nature | ~95 new biome-spawning animals on top of Alex's Mobs' 40+ = two competing ambient-spawn systems fighting over the same mob cap. Project is also 10 days old with ~550 downloads. Pick one; Alex's Mobs is the more proven of the two. |
| **Tonalli** — https://www.curseforge.com/minecraft-bedrock/addons/tonalli | Newest file is `Tonalli_v1.1.2-beta` and the author states it "is still under development and is not yet 100% playable". Not stream-safe. |
| **Verity** — https://www.curseforge.com/minecraft-bedrock/addons/verity-bedrock-edition | Requires **Beta APIs** (an experimental toggle → disables achievements) and needs external files set up for its voice/TTS. Fails the "no experimental features" and "as little technical work as possible" rules. |
| **Mystica Shader** — https://www.curseforge.com/minecraft-bedrock/texture-packs/mystica-shaders | Not rejected — it is the **fallback** if the PC can't do Vibrant Visuals. Plain `.mcpack`, works with no VV and no RTX, 26.40. Never enable it at the same time as Unbound Visuals. |

Sources checked: CurseForge project pages listed above, minecraft.wiki
(Bedrock version history, Vibrant Visuals), Microsoft Learn creator docs.
