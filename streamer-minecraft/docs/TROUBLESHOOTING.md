# Troubleshooting

Run `1-CHECK-SETUP.cmd` first — it prints where Minecraft lives, which worlds exist, how many
packs each one has enabled, and what's installed. Most answers are in there.

### The scripts say "Could not find Minecraft's com.mojang folder"
Launch Minecraft for Windows once, create or open any world, quit, then run the script again.
The folder only exists after the game has run. (Minecraft moved this folder in recent versions —
the scripts check both the new `%APPDATA%\Minecraft Bedrock\Users\...` and the old
`Packages\Microsoft.MinecraftUWP...` locations.)

### Windows blocked the .cmd file / "running scripts is disabled"
Right-click the `.cmd` → Properties → tick **Unblock** → OK. The launchers already pass
`-ExecutionPolicy Bypass`, so nothing else needs changing.

### The addons don't appear in the world
- Did you run `2-INSTALL-ADDONS.cmd` *and then* `3-BEAUTIFUL-MODE.cmd`? Installing only copies
  the files; the mode script is what switches them on in the world.
- Was Minecraft closed while the script ran? The game rewrites the world folder on exit and
  will overwrite the change. Close the game, re-run the mode script, then start the game.
- Did you pick the right world in the list?

### Everything looks vanilla — no aurora, no shooting stars
Settings → Video → **Graphics Mode → Vibrant Visuals**. Unbound Visuals needs it. If Vibrant
Visuals is greyed out, the GPU doesn't support it (Windows needs DirectX 12 feature level 12_1);
use Mystica Shader from `docs/DOWNLOAD-LIST.md` instead — swap the words
`Unbound Visuals` for `Mystica` in `profiles\beautiful.json` and re-run Beautiful Mode.

### Torches don't light up caves
System Dynamic Light needs **both** of its packs — the BP and the RP. Re-run
`1-CHECK-SETUP.cmd`; if only one shows up, re-download and re-install. In game, use the
Dynamic Light Book to check the settings are on.

### The world says "Experimental" / achievements are off
An addon asked for an experimental toggle. Nothing in the core set should. Turn packs on one
at a time (edit `profiles\beautiful.json`, re-run the mode script) until the label appears —
that's the culprit. Once a world has been marked experimental, it stays that way; restore a
backup from before that point with `6-RESTORE-BACKUP.cmd`.

### FPS tanked / the stream is stuttering
`4-PERFORMANCE-MODE.cmd`, then Video settings → Graphics Mode back to Fancy, render distance
8–10. Gameplay addons stay on; only the atmosphere pack goes away. Switch back any time.

### Weird mobs stopped spawning / far too few animals
Too many mob-adding addons at once. The core set has exactly one big animal addon
(Alex's Mobs) plus cats on purpose. Don't add a second one.

### A friend sees different textures
World settings → *Require players to accept resource packs* → ON, then have them rejoin and
accept the download prompt.

### Something in the world got corrupted / Null escaped into the survival world
`6-RESTORE-BACKUP.cmd` → pick the newest backup from before it happened. The current state is
backed up first, so a wrong pick is undoable.

### After a Minecraft update everything broke
Check the CurseForge pages for the new game version number and update the addon files
(drop the new files in `addons\downloads`, run `2-INSTALL-ADDONS.cmd`, then a mode script).
Until then, `6-RESTORE-BACKUP.cmd` gets you back to a working world.
