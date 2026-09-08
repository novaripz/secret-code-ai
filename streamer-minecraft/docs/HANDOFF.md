# Handoff — read this first

Paste this whole file into a new Claude conversation. It is the full state of the job.

## Who this is for

Windows 11 PC, Minecraft **Bedrock Edition** (Minecraft for Windows). Not Java. No Forge,
no Fabric, no client patching of any kind — those don't exist on Bedrock and are off the table.

The user is not technical. The goal is: **he double-clicks things and then plays.** Do not
hand him folder paths to edit or JSON to write. If a step can't be made click-sized, do it
for him in a script.

## Where everything is on his machine

- Pack folder (already extracted):
  `C:\Users\firer\Downloads\secret-code-ai-claude-bedrock-streamer-pack-bs2c1j\streamer-minecraft`
- Minecraft data folder (confirmed by an actual run):
  `C:\Users\firer\AppData\Roaming\Minecraft Bedrock\Users\1593985193446202145\games\com.mojang`
- Source of the pack:
  https://github.com/novaripz/secret-code-ai — branch `claude/bedrock-streamer-pack-bs2c1j`,
  folder `streamer-minecraft`

## What already happened

1. `START-HERE.cmd` ran. It found Minecraft correctly.
2. It installed **Herobrine Lurking** — the only file that was in `addons\downloads`. **He does
   not want it.** Null is the only stalker. It is installed but not in any profile, so it never
   gets switched on; if he wants it gone, delete the `.mcaddon` from `addons\downloads` and
   re-run `2-INSTALL-ADDONS.cmd`.
3. It then failed at the last step: **no world existed.** He turned on Beta APIs from the
   *Create New World* screen and backed out without pressing Create, so `minecraftWorlds` was
   empty.
4. He has **not yet downloaded** the 17 CurseForge addons. That is the main outstanding task.
5. Windows SmartScreen flagged the `.cmd` files (normal — unsigned, downloaded). Fix is
   **More info → Run anyway**, or in a terminal opened at the pack folder:
   `Get-ChildItem -Recurse | Unblock-File`

## Exactly what to walk him through next

1. **Minecraft: create or open the world**, let it load fully, then **quit the game
   completely.** Every script needs the game closed — Minecraft rewrites the world folder as
   it exits and will undo any change made while it's running.
2. `0-OPEN-DOWNLOAD-PAGES.cmd` — opens all 17 CurseForge pages. He clicks the green Download
   on each and leaves the files in his **Downloads** folder. Nothing needs moving or unzipping.
   - System Dynamic Light has **two** files on its page; both are needed.
3. `2-INSTALL-ADDONS.cmd` — reads Downloads, unpacks, installs, prints what it found.
4. `3-BEAUTIFUL-MODE.cmd` — pick his world from the list. It backs the world up, switches all
   the packs on, and sets the experiment toggles in `level.dat`.
5. In game: **Settings → Video → Graphics Mode → Vibrant Visuals.** This is the only setting
   he has to change by hand; it's what turns on the aurora and god rays.
6. Once Null has actually shown up in game: `15-NULL-AMBIENT.cmd` (see below).

If a script fails, `1-CHECK-SETUP.cmd` prints every path it looks at, the worlds it can see
with pack counts, what's downloaded and what's installed. Start there.

## Decisions already made — don't re-litigate these

- **Null: yes.** Herobrine Lurking and Twixxel's Stalkers: no. One script stalker per world.
- **Verity: yes**, and he accepts that this means **achievements are off in that world**
  (Verity needs Beta APIs; no Bedrock world can have Beta APIs and achievements at once, and
  removing Verity later does not undo it).
- **No furniture addons.** Stated at the start.
- **No loader shaders** (Newb x Daydream etc.) — they need a patched Minecraft client on
  Windows. Unbound Visuals through the official Vibrant Visuals pipeline is the replacement.
- **Actions & Stuff** is a paid Marketplace pack; the free `.mcpack` mirrors are piracy.
  Origin Animation is the free stand-in and is already in the list.
- The look is **stylised, not photoreal** (Bare Bones textures + Unbound Visuals atmosphere).
  He asked about realism once. Going photoreal means dropping *both* Bare Bones and Unbound
  Visuals for a single realistic VV pack (Definitive Vibrant Visuals or Prizma) — a swap, not
  an addition. He has not asked for this.
- The streamer wanted "more fun things", so **Nuckem Vehicles** (drivable cars, passenger
  seats) and **Better Backpacks** were added.

## The 17 addons

Full table with links, verified file names, dates and version tags: `docs/DOWNLOAD-LIST.md`.
What must never be combined, and the resource-pack load order: `docs/COMPATIBILITY.md`.

Two need experiment toggles, which the mode scripts set automatically in `level.dat`:
`gametest` (Beta APIs — Verity) and `upcoming_creator_features` (Nuckem Vehicles).

**Null's newest release is tagged 26.20** while the game is on the 26.4x line. It may simply
not run. `8-HORROR-TEST-WORLD.cmd` on a throwaway world is the test; `9a-REMOVE-NULL-ONLY.cmd`
removes it if it's dead. Everything else in the pack is current.

## The Null tone-down he asked for

He wants Null **present but not aggressive**: keep the arrivals, the "Null joined the game"
message, the crosses and the sounds; drop the chasing and the particle effects.

- `14-NULL-REPORT.cmd` — prints what's inside the installed Null packs, changes nothing.
- `15-NULL-AMBIENT.cmd` — copies the packs, then strips chase/attack components from the
  entity JSON (including inside `component_groups`) and comments out `spawnParticle` calls in
  its scripts.
- `16-NULL-FULL-STRENGTH.cmd` — restores the downloaded version.

**This has never been run against the real Null files.** It matches the standard Bedrock
component names. If `15` reports "nothing matched", Null does its chasing in JavaScript
instead — get the output of `14` and write the exact edits from that. Edits are to his own
downloaded copy, local only, never redistributed, and are overwritten when Null updates.

## Every script in the pack

| Script | What it does |
|---|---|
| `START-HERE.cmd` | The whole setup in one: opens pages, installs, applies a mode, launches the game |
| `0-OPEN-DOWNLOAD-PAGES.cmd` | Opens all 17 CurseForge pages |
| `1-CHECK-SETUP.cmd` | Diagnostics. Changes nothing. Run this first when anything looks wrong |
| `2-INSTALL-ADDONS.cmd` | Reads Downloads + `addons\downloads`, unpacks and installs |
| `3-BEAUTIFUL-MODE.cmd` / `4-PERFORMANCE-MODE.cmd` | Switches the pack set in a world; performance drops the atmosphere pack only |
| `5-BACKUP-WORLD.cmd` / `6-RESTORE-BACKUP.cmd` | World backup and restore |
| `7-EXPORT-MCWORLD.cmd` | Exports the world as `.mcworld` |
| `8-HORROR-TEST-WORLD.cmd` | Null alone, on a throwaway world |
| `9-HORROR-OFF.cmd` / `10-HORROR-ON.cmd` | All horror off / back on |
| `9a-REMOVE-NULL-ONLY.cmd` / `9b-REMOVE-VERITY-ONLY.cmd` | Remove one of them, keep the other |
| `11/12/13-OPTIMIZE-*.cmd` | Stream / max-FPS / quality presets: video settings + simulation distance |
| `14/15/16-NULL-*.cmd` | Null report / tone-down / restore |

Modes are driven by `profiles\*.json`, which list packs by plain-English name fragments —
editable by hand, matched ignoring punctuation and case.

## If he'd rather not use the scripts at all

Bedrock installs addons by double-click. Download from CurseForge → double-click each
`.mcpack` / `.mcaddon` → Minecraft imports it → in the world's **Edit** screen, activate each
pack under Resource Packs and Behavior Packs, and turn on **Beta APIs** and **Upcoming Creator
Features** under Experiments. That works with zero scripts; he only loses the one-click mode
switch, the automatic backups, the optimizer and the Null tone-down.

## Ground rules that held throughout this job

- Verify every addon on its own CurseForge page before recommending it — version tag, whether
  it needs experimental toggles, whether it's achievements-safe, what system it modifies.
  Assume nothing.
- One owner per system: biomes, caves, structures, oceans, sky/lighting, textures, dimension,
  dynamic light, storage, vehicles, stalker. A second addon in any of those slots is a
  conflict, not an addition.
- Say plainly when something can't be done or might not work. He'd rather hear it now.
