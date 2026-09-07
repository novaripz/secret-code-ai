# Troubleshooting

`1-CHECK-SETUP.cmd` first — it prints where Minecraft lives, your worlds, how many packs each
has on, and everything installed.

### "Could not find Minecraft's com.mojang folder"
Launch Minecraft once, open any world, quit, retry. (The scripts check both the current
`%APPDATA%\Minecraft Bedrock\Users\...` path and the old `Packages\Microsoft.MinecraftUWP...` one.)

### Windows blocked the .cmd
Right-click → Properties → **Unblock** → OK.

### The installer says it found nothing
The files must be `.mcpack` or `.mcaddon`. It looks in your Downloads, OneDrive\Downloads,
Desktop and `addons\downloads`. If your browser saved them somewhere else, drag them into
`addons\downloads` and run `2-INSTALL-ADDONS.cmd`.

### Addons don't show up in the world
Minecraft must be **closed** when a mode script runs — the game rewrites the world folder on
exit and will undo the change. Close it, re-run, then start the game.

### No aurora / no shooting stars
Settings → Video → Graphics Mode → **Vibrant Visuals**. If it's greyed out your GPU can't run it
(Windows needs DirectX 12 feature level 12_1): download Mystica Shader instead, then replace
`"Unbound Visuals"` with `"Mystica"` in `profiles\beautiful.json` and re-run Beautiful Mode.

### Verity doesn't respond / Null never appears
1. `1-CHECK-SETUP.cmd` — is the pack listed?
2. Is the world marked *Experimental* in the world list? If not, Beta APIs didn't get set.
   Set it by hand: world → Edit → Settings → **Experiments → Beta APIs → ON**.
3. Verity: place it on the ground and talk in chat, or say "Hey Verity" with it in inventory.
4. Null: it arrives on its own, on its own schedule — give it a real session, not two minutes.
5. Still nothing from Null after a long test-world session? Its 26.20 scripts don't run on your
   game version. `9-HORROR-OFF.cmd`, and check its CurseForge page for an update later.

### Null wrecked something in the survival world
`9-HORROR-OFF.cmd` (removes Null, Stalkers and Verity, keeps everything else), then
`6-RESTORE-BACKUP.cmd` and pick the newest backup from before it happened.

### Achievements are gone
Expected — Verity requires Beta APIs. See `docs/COMPATIBILITY.md`.

### FPS tanked
`4-PERFORMANCE-MODE.cmd`, Graphics Mode back to Fancy, render distance 8–10. Still bad? Drop
Structure Mayhem, then Nautilus, from `profiles\performance.json`.

### Trees/biomes look wrong, or chunk borders are visible
Two world-gen addons are fighting, or Nature's Touch was added to an already-explored world —
new biomes only appear in newly generated chunks, so old areas stay vanilla. That's normal;
walk somewhere new.

### A cave mob or block behaves oddly
Nico's page lists known issues (enchant glints on custom gear, some non-solid custom blocks).
Not a conflict, just the addon.

### A friend sees different textures
World settings → *Require players to accept resource packs* → ON, then have them rejoin and
accept the download.

### After a Minecraft update everything breaks
Re-download the updated addon files, run `2-INSTALL-ADDONS.cmd`, then a mode script. Meanwhile
`6-RESTORE-BACKUP.cmd` gets you back to a world that works.
