# Optimization

This is a heavy pack: five content addons, three script packs and an atmosphere pack. That is
a deliberate trade — this guide is how you keep it at a steady 60 while streaming.

Run `11-OPTIMIZE-STREAM.cmd` first. It reads your CPU/RAM/GPU, sets Minecraft's video settings,
sets the world's simulation distance, and prints what it changed. Presets:

| Script | For | Render distance | Sim distance | FPS cap |
|---|---|---|---|---|
| `13-OPTIMIZE-QUALITY.cmd` | strong PC, cinematic/building streams | 12 chunks | 4 | 60 |
| `11-OPTIMIZE-STREAM.cmd` | **default** | 10 chunks | 4 | 60 |
| `12-OPTIMIZE-MAX-FPS.cmd` | struggling PC, big base, lots of mobs | 7 chunks | 3 | uncapped |

Everything it writes is backed up first (`backups\options_*.txt`, plus a world zip) and read
back to confirm it landed.

## The order that actually matters

Stop at the first one that fixes it. Sorted by how much they give back per unit of effort.

**1. Simulation distance — the biggest single win on this pack.**
Render distance is what you *see*; simulation distance is how many chunks keep ticking mobs,
redstone and **addon scripts**. With Alex's Mobs, Nautilus, Purrfect, Nico's cave mobs and three
script packs running, every extra ticking chunk costs real CPU. 4 is the sweet spot here; 3 in
an emergency. The optimizer sets it in `level.dat`; in game it's world settings → Simulation
Distance.

**2. Vibrant Visuals off.** One toggle, usually the largest GPU win available, and it costs you
only Unbound Visuals' aurora and god rays — every gameplay addon keeps working. Settings →
Video → Graphics Mode → Fancy.

**3. Performance Mode** (`4-PERFORMANCE-MODE.cmd`). Removes the atmosphere pack from the world
and keeps Bare Bones and the animations, which are near-free.

**4. Render distance.** 10 chunks looks fine on stream at 1080p; 16 costs a lot and viewers
cannot tell. Each step up is roughly quadratic in chunk count.

**5. Give Minecraft the discrete GPU.** Windows Settings → Display → Graphics → Minecraft →
High performance. On laptops this is frequently a 2–3× difference and people miss it for months.

**6. Power mode.** Settings → System → Power → Best performance while live.

**7. GPU driver.** Vibrant Visuals is new; old drivers show it.

## Addon-side settings

- **System Dynamic Light** has an in-game settings book. Entity lighting (every mob holding a
  torch lighting the world) is the expensive option — turn it off first, keep player lighting.
  Also lower the dropped-item light limit.
- **Structure Mayhem** costs at world generation, not while standing still. Exploring new land
  is where it stings; it is free in an established base.
- **Nature's Touch** and **Nico's** only affect newly generated chunks. Once your area is
  explored they cost close to nothing.
- **Null, Verity, Stalkers** run scripts every tick. If the tick rate is what's suffering
  (mobs stuttering, doors lagging, not low FPS) `9-HORROR-OFF.cmd` is the fastest test.

If you have to cut addons, cut in this order — least loss for most gain:
Structure Mayhem → Nautilus → Nico's Cave → Nature's Touch.
Edit `profiles\performance.json`, delete the line, re-run the mode script.

## Telling the two failure modes apart

They need opposite fixes, so check which one you have before changing anything:

| Symptom | It's the GPU | It's the CPU/ticks |
|---|---|---|
| FPS counter low but the world behaves | ✅ | |
| Mobs teleport/stutter, doors lag, chests slow — but FPS is fine | | ✅ |
| Worse when you turn the camera | ✅ | |
| Worse near mob farms, villages, big bases | | ✅ |
| Fixed by dropping render distance / Vibrant Visuals | ✅ | |
| Fixed by dropping simulation distance / horror addons | | ✅ |

## Streaming (OBS)

- **Hardware encoder only** — NVENC (NVIDIA), AV1/HEVC where available, or AMD's. x264 on the
  same PC as Minecraft fights the game for CPU, which is exactly what this pack is short of.
- **Cap Minecraft at 60** (the presets do). An uncapped game eats the headroom OBS needs and
  makes the *stream* stutter while your own screen looks fine.
- **Game Capture**, not Display Capture, and not a full-screen browser source behind it.
- 1080p60 at 6000–8000 kbps; if the encoder is struggling, drop output to 1600×900 before you
  drop the frame rate — motion smoothness reads better than pixels for Minecraft.
- Close the launcher, Discord's hardware acceleration, and spare browser windows. On a 16 GB
  machine those are worth several frames each.

## What not to bother with

- "Optimization" texture packs that claim to boost FPS on Bedrock — mostly placebo, and they
  fight Bare Bones for the same files.
- RAM allocation tweaks. That's Java Edition; Bedrock has no such setting.
- Third-party "boosters" and FPS unlockers — client patchers, same category as the loader
  shaders this pack deliberately avoids.
