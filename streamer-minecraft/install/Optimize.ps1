<#
  Optimize.ps1 -Preset stream|quality|maxfps [-WorldName "..."]

  Tunes the two things that actually move the needle on a heavy addon world:
   * Minecraft's video settings in com.mojang\minecraftpe\options.txt
   * the world's simulation distance (serverChunkTickRange in level.dat) - how
     many chunks keep ticking mobs, scripts and redstone around each player

  Only keys that already exist in options.txt are touched; nothing is invented.
  Minecraft rewrites options.txt when it exits, so it must be closed - the
  script checks. Everything is backed up first and read back afterwards.
#>
param(
    [ValidateSet('stream', 'quality', 'maxfps')][string]$Preset = 'stream',
    [string]$WorldName,
    [switch]$Quiet
)

. "$PSScriptRoot\Common.ps1"
. "$PSScriptRoot\Nbt.ps1"

# gfx_viewdistance is in BLOCKS (chunks x 16). 160 = 10 chunks.
$presets = @{
    quality = @{
        Label    = 'Quality - for cinematic/building streams on a strong PC'
        Options  = @{ gfx_viewdistance = 192; gfx_max_framerate = 60; gfx_vsync = 0; shadow_quality = 3; cloud_quality = 2; gfx_particleviewdistance = 2 }
        TickRange = 4
        Advice   = 'Vibrant Visuals ON. Beautiful Mode.'
    }
    stream = @{
        Label    = 'Stream - the default. Steady 60 with the atmosphere pack on'
        Options  = @{ gfx_viewdistance = 160; gfx_max_framerate = 60; gfx_vsync = 0; shadow_quality = 1; cloud_quality = 1; gfx_particleviewdistance = 1 }
        TickRange = 4
        Advice   = 'Vibrant Visuals ON if the GPU holds 60 fps, otherwise OFF. Beautiful Mode.'
    }
    maxfps = @{
        Label    = 'Max FPS - rescue setting for a struggling PC or a busy base'
        Options  = @{ gfx_viewdistance = 112; gfx_max_framerate = 0; gfx_vsync = 0; shadow_quality = 0; cloud_quality = 0; gfx_particleviewdistance = 0 }
        TickRange = 3
        Advice   = 'Vibrant Visuals OFF, Graphics Mode Fancy. Performance Mode.'
    }
}
$cfg = $presets[$Preset]

Write-Host ""
Write-Host "  OPTIMIZER - $($cfg.Label)" -ForegroundColor Cyan
Write-Host ""

# ---------- what we are working with ----------
Write-Step "This PC"
try {
    $cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1)
    $ramGb = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)
    $gpus = @(Get-CimInstance Win32_VideoController | Where-Object { $_.Name })
    Write-Host ("    CPU: {0} ({1} cores)" -f $cpu.Name.Trim(), $cpu.NumberOfCores)
    Write-Host ("    RAM: {0} GB" -f $ramGb)
    foreach ($g in $gpus) {
        $vram = if ($g.AdapterRAM -gt 0) { "{0:N0} MB" -f ($g.AdapterRAM / 1MB) } else { 'shared' }
        Write-Host ("    GPU: {0} ({1})" -f $g.Name.Trim(), $vram)
    }
    $integratedOnly = -not (@($gpus | Where-Object { $_.Name -match 'NVIDIA|GeForce|RTX|GTX|Radeon RX|Arc' }).Count)
    if ($integratedOnly) { Write-Warn2 'No discrete GPU detected - use Performance Mode and leave Vibrant Visuals OFF.' }
    if ($ramGb -lt 16) { Write-Warn2 'Under 16 GB RAM - close the browser while streaming; each Chrome window costs real frames here.' }
} catch { Write-Warn2 "Could not read hardware info ($($_.Exception.Message)) - carrying on." }

$comMojang = Get-ComMojang
Assert-MinecraftClosed

# ---------- video settings ----------
Write-Step "Video settings"
$optionsPath = Join-Path $comMojang 'minecraftpe\options.txt'
if (-not (Test-Path $optionsPath)) {
    Write-Warn2 "options.txt not found yet ($optionsPath). Open Minecraft's video settings once, quit, and run this again."
} else {
    $backupDir = Join-Path (Get-PackRoot) 'backups'
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    $optBak = Join-Path $backupDir ("options_{0}.txt" -f (Get-Date -Format 'yyyy-MM-dd_HHmm-ss'))
    Copy-Item -LiteralPath $optionsPath -Destination $optBak -Force

    $result = Set-OptionsFile -Path $optionsPath -Values $cfg.Options
    if ($result.Changed.Count -eq 0) { Write-Ok "already set the way this preset wants" }
    foreach ($c in $result.Changed) {
        if ($c.Landed) { Write-Ok ("{0}: {1} -> {2}" -f $c.Key, $c.From, $c.To) }
        else           { Write-Err2 ("{0} did not stick - set it in-game" -f $c.Key) }
    }
    if ($result.Changed.Count -gt 0) { Write-Host ("    backup: {0}" -f (Split-Path -Leaf $optBak)) }
    $absent = $result.Absent
    foreach ($a in $absent) { Write-Host ("    (this Minecraft build has no '{0}' key - skipped)" -f $a) }
    Write-Host "    Graphics Mode / Vibrant Visuals is a menu-only setting: $($cfg.Advice)" -ForegroundColor Yellow
}

# ---------- simulation distance ----------
Write-Step "Simulation distance (how many chunks keep ticking mobs and scripts)"
try {
    $world = Select-World -ComMojang $comMojang -WorldName $WorldName
    Write-Ok ("World: {0}" -f $world.Name)
    $zip = New-WorldBackup -WorldPath $world.Path -Tag 'optimize'
    Write-Host ("    backup: {0}" -f (Split-Path -Leaf $zip))

    $sim = Set-SimulationDistance -WorldPath $world.Path -Chunks $cfg.TickRange
    if ($sim.Ok) {
        $from = if ($null -ne $sim.From) { $sim.From } else { 'default' }
        Write-Ok ("{0} -> {1} chunks" -f $from, $cfg.TickRange)
    } else {
        Write-Warn2 ("Left it alone ({0}). Set Simulation Distance in the world's settings instead." -f $sim.Reason)
    }
} catch {
    Write-Warn2 $_.Exception.Message
}

# ---------- the rest is outside Minecraft ----------
Write-Host ""
Write-Step "Outside Minecraft - biggest wins first"
Write-Host "    1. Give Minecraft the real GPU:  Settings > Display > Graphics > Minecraft > High performance"
Write-Host "    2. Power mode 'Best performance' while streaming (Settings > System > Power)"
Write-Host "    3. Update the GPU driver - Vibrant Visuals is new enough that driver age shows"
Write-Host "    4. OBS: NVENC/AV1 or AMD hardware encoder, never x264 on the same PC"
Write-Host "    5. Cap Minecraft at 60 fps (this preset does) so OBS keeps GPU headroom"
Write-Host "    Full guide, including the addon-side settings: docs\OPTIMIZATION.md"
Write-Host ""

$open = Read-Host "Open the two Windows settings pages now? (Y/n)"
if ($open -notmatch '^[Nn]') {
    Start-Process 'ms-settings:display-advancedgraphics' | Out-Null
    Start-Sleep -Milliseconds 600
    Start-Process 'ms-settings:powersleep' | Out-Null
}

Write-Host ""
Write-Ok "Done. Start Minecraft."
if (-not $Quiet) { Read-Host "Press Enter to close" | Out-Null }
