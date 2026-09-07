# Compatibility notes

Verified against the CurseForge project pages on 7 September 2026.

## Version target

Latest released Bedrock version: **26.45** (28 Aug 2026); the 26.50 game drop is next.
Every pack in the core set publishes a **26.40**-line build, which is what the pack targets.
Bedrock is generally forward-tolerant within a game-drop line, but the rule of thumb stands:
**after a big Minecraft update, wait for the addon pages to say the new number before updating
the game**, or turn off auto-updates for Minecraft in the Microsoft Store while a series is running.

## What each thing actually is

| Pack | Behaviour pack | Resource pack | Experimental toggles | Achievements |
|------|----------------|---------------|----------------------|--------------|
| System Dynamic Light | yes (required) | yes (required) | none | safe |
| Unbound Visuals | no | yes | none (needs Vibrant Visuals graphics mode) | safe |
| Alex's Mobs | yes | yes (inside the .mcaddon) | not stated — verify on import | verify |
| Purrfect Companions | yes | yes (inside the .mcaddon) | not stated — verify on import | verify |
| Ore Boost | yes (data) | no | none, stated | stated friendly |
| Higher Discount | yes (data) | no | none, stated | stated friendly |
| Ethercraft | yes (data, custom dimension) | yes | none since v1.10, stated | stated friendly |
| Null *(optional)* | yes | likely | not stated | assume unsafe |
| Twixxel's Stalkers *(optional)* | yes | likely | not stated | assume unsafe |

"Verify on import" = when you first load the world, if Minecraft shows the world as
*Experimental*, an addon asked for a toggle. Check which one by enabling them one at a time.

## Do not combine

1. **Unbound Visuals + Mystica Shader** — both rewrite fog, sky and lighting colour for every
   biome. One at a time, always.
2. **Unbound Visuals (or any VV pack) + Newb x Daydream / any loader shader** — different
   rendering paths entirely; the loader one also needs a patched game client. Never both.
3. **Alex's Mobs + Animals nature** — duplicate ambient-animal spawn systems competing for the
   same mob cap. Pick one.
4. **Null + Twixxel's Stalkers** — two script-driven horror systems both hijacking ambience,
   sound and player state. Test each separately; never both at once.
5. **Null (or Stalkers) + the main survival world** — Null edits blocks, time and item names
   and can kick players. Throwaway world only.
6. **Verity + achievements/no-experimental rule** — Verity needs Beta APIs, which flags the
   world experimental permanently.
7. Two packs that both replace the same vanilla mob. Nothing in the core set does this
   (Purrfect Companions adds new cats, it does not overwrite vanilla cats) — but it is the
   thing to check before adding any new animal addon later.

## System Dynamic Light vs. the atmosphere pack

These are the two visual things that could collide, so this is the specific pairing to test
first (world → Beautiful Mode → walk into a cave with a torch, then look at the night sky):

- System Dynamic Light does its work in a **behaviour pack** (scripts placing light sources);
  its resource pack only carries its own item/attachable definitions and its settings book.
- Unbound Visuals only touches sky, fog, water and lighting **appearance**.
- They therefore stack rather than overwrite — but the pack order still matters. The scripts
  put System Dynamic Light **first** in `world_resource_packs.json`, i.e. at the top of the
  stack, so its definitions win if the two ever touch the same file.
- What to look for if it *is* wrong: torches that light up the world but with the wrong glow
  colour, or a missing Dynamic Light settings book. Fix = Performance Mode (drops the
  atmosphere pack) and report which one broke.

## Multiplayer

- Only the host installs anything. When friends join the host's world, Bedrock offers them
  the world's packs automatically; they accept once and play.
- Turn on *Require players to accept resource packs* in world settings so everyone sees the
  same thing on stream.
- Vibrant Visuals is a **per-player device setting**, not a world setting. Friends on weak
  PCs can leave it off and still play in the same world; they just won't see the aurora.
