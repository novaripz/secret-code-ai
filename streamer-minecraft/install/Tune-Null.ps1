<#
  Tune-Null.ps1 -Action report | ambient | revert

  Turns Null down from "hunts you across the map with a particle storm" to
  "something is out there". Keeps the arrivals, the join message, the crosses
  and the sounds; drops the chasing, the attacking and the script-spawned
  particle effects.

  This edits YOUR OWN downloaded copy of the addon, on your PC. Nothing is
  redistributed, and every change is reversible with -Action revert.

    report  - prints what is actually inside the installed Null packs and
              changes nothing. Run this first.
    ambient - takes a full copy of the packs, then applies the tone-down.
    revert  - restores the packs exactly as they were downloaded.
#>
param(
    [ValidateSet('report', 'ambient', 'revert')][string]$Action = 'report',
    [switch]$Quiet
)

. "$PSScriptRoot\Common.ps1"

$backupRoot = Join-Path (Get-PackRoot) 'backups\null-original'

# Behaviours that make it hunt you. Everything else is left alone.
$chaseComponents = @(
    'minecraft:behavior.nearest_attackable_target',
    'minecraft:behavior.melee_attack',
    'minecraft:behavior.charge_attack',
    'minecraft:behavior.ranged_attack',
    'minecraft:behavior.leap_at_target',
    'minecraft:behavior.follow_mob',
    'minecraft:behavior.follow_owner',
    'minecraft:behavior.stomp_attack',
    'minecraft:behavior.delayed_attack',
    'minecraft:target_nearby_sensor',
    'minecraft:attack',
    'minecraft:angry'
)

function Get-NullPacks {
    $installed = @(Get-InstalledPacks | Where-Object { (Get-MatchKey $_.name).Contains('null') })
    if ($installed.Count -eq 0) {
        throw "No Null packs are installed. Run 2-INSTALL-ADDONS.cmd first."
    }
    $comMojang = Get-ComMojang
    $out = @()
    foreach ($p in $installed) {
        $dir = if ($p.kind -eq 'behavior') { 'behavior_packs' } else { 'resource_packs' }
        $path = Join-Path $comMojang (Join-Path $dir $p.folder)
        if (Test-Path $path) {
            $out += [pscustomobject]@{ Name = $p.name; Kind = $p.kind; Path = $path; Folder = $p.folder }
        }
    }
    if ($out.Count -eq 0) { throw "Null is in the install list but its folders are missing from Minecraft. Re-run 2-INSTALL-ADDONS.cmd." }
    return $out
}

function Remove-JsonKeys {
    # Walks the parsed JSON and deletes the named keys wherever they appear,
    # including inside component_groups. Returns how many it removed.
    param($Node, [string[]]$Keys)
    $removed = 0
    if ($null -eq $Node) { return 0 }

    if ($Node -is [System.Collections.IEnumerable] -and $Node -isnot [string]) {
        foreach ($item in $Node) { $removed += Remove-JsonKeys -Node $item -Keys $Keys }
        return $removed
    }
    if ($Node -isnot [psobject] -or $Node -is [string] -or $Node -is [valuetype]) { return 0 }

    foreach ($prop in @($Node.PSObject.Properties)) {
        if ($Keys -contains $prop.Name) {
            $Node.PSObject.Properties.Remove($prop.Name)
            $removed++
        } else {
            $removed += Remove-JsonKeys -Node $prop.Value -Keys $Keys
        }
    }
    return $removed
}

function Get-ScriptSignals {
    param([string]$Text)
    return [pscustomobject]@{
        Particles = ([regex]::Matches($Text, 'spawnParticle')).Count
        Sounds    = ([regex]::Matches($Text, 'playSound|playMusic')).Count
        Messages  = ([regex]::Matches($Text, 'sendMessage|say ')).Count
        Teleports = ([regex]::Matches($Text, '\.teleport\(')).Count
        Damage    = ([regex]::Matches($Text, 'applyDamage|kill\(')).Count
        Commands  = ([regex]::Matches($Text, 'runCommand')).Count
    }
}

# ---------------------------------------------------------------- report ----
if ($Action -eq 'report') {
    Write-Step "What's inside the installed Null packs"
    foreach ($pack in Get-NullPacks) {
        Write-Host ""
        Write-Host ("  {0}  [{1}]" -f $pack.Name, $pack.Kind) -ForegroundColor Cyan
        Write-Host ("  {0}" -f $pack.Path)

        $entities = @(Get-ChildItem $pack.Path -Recurse -Filter *.json -File -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match '[\\/]entities[\\/]' })
        foreach ($e in $entities) {
            $raw = Get-Content -LiteralPath $e.FullName -Raw
            $found = @($chaseComponents | Where-Object { $raw -match [regex]::Escape($_) })
            Write-Host ("    entity : {0}" -f $e.Name)
            if ($found.Count) { Write-Host ("      chase/attack components: {0}" -f ($found -join ', ')) -ForegroundColor Yellow }
            else { Write-Host "      no chase/attack components in the JSON (it may all be script-driven)" }
        }

        $scripts = @(Get-ChildItem $pack.Path -Recurse -Filter *.js -File -ErrorAction SilentlyContinue)
        foreach ($s in $scripts) {
            $sig = Get-ScriptSignals (Get-Content -LiteralPath $s.FullName -Raw)
            Write-Host ("    script : {0}" -f $s.Name)
            Write-Host ("      spawnParticle {0} | sounds {1} | messages {2} | teleports {3} | damage {4} | commands {5}" -f `
                $sig.Particles, $sig.Sounds, $sig.Messages, $sig.Teleports, $sig.Damage, $sig.Commands)
        }

        $particles = @(Get-ChildItem $pack.Path -Recurse -Filter *.json -File -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match '[\\/]particles[\\/]' })
        if ($particles.Count) { Write-Host ("    particle files: {0}" -f $particles.Count) }
    }
    Write-Host ""
    Write-Host "Nothing was changed. Run 14-NULL-AMBIENT.cmd to apply the tone-down." -ForegroundColor Cyan
    if (-not $Quiet) { Read-Host "Press Enter to close" | Out-Null }
    return
}

# ---------------------------------------------------------------- revert ----
if ($Action -eq 'revert') {
    if (-not (Test-Path $backupRoot)) { throw "No original copy saved - there is nothing to revert to." }
    Assert-MinecraftClosed
    foreach ($pack in Get-NullPacks) {
        $saved = Join-Path $backupRoot $pack.Folder
        if (-not (Test-Path $saved)) { Write-Warn2 ("no saved copy of {0} - skipped" -f $pack.Name); continue }
        Get-ChildItem $pack.Path -Force | Remove-Item -Recurse -Force
        Copy-Item -Path (Join-Path $saved '*') -Destination $pack.Path -Recurse -Force
        Write-Ok ("{0} restored to the downloaded version" -f $pack.Name)
    }
    Write-Host "Start Minecraft - Null is back to full strength." -ForegroundColor Cyan
    if (-not $Quiet) { Read-Host "Press Enter to close" | Out-Null }
    return
}

# --------------------------------------------------------------- ambient ----
Assert-MinecraftClosed
$packs = Get-NullPacks

Write-Step "Saving the original packs first"
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
foreach ($pack in $packs) {
    $saved = Join-Path $backupRoot $pack.Folder
    if (-not (Test-Path $saved)) {
        New-Item -ItemType Directory -Path $saved -Force | Out-Null
        Copy-Item -Path (Join-Path $pack.Path '*') -Destination $saved -Recurse -Force
        Write-Ok ("saved {0}" -f $pack.Name)
    } else {
        Write-Ok ("already saved {0}" -f $pack.Name)
    }
}

$entityEdits = 0
$scriptEdits = 0

foreach ($pack in $packs) {
    Write-Step ("Toning down {0}" -f $pack.Name)

    # 1. Entity JSON: drop the components that make it hunt and hit you.
    $entities = @(Get-ChildItem $pack.Path -Recurse -Filter *.json -File -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match '[\\/]entities[\\/]' })
    foreach ($e in $entities) {
        try {
            $json = Get-Content -LiteralPath $e.FullName -Raw | ConvertFrom-Json
        } catch {
            Write-Warn2 ("could not read {0} - left alone" -f $e.Name); continue
        }
        $n = Remove-JsonKeys -Node $json -Keys $chaseComponents
        if ($n -gt 0) {
            ($json | ConvertTo-Json -Depth 100) | Set-Content -LiteralPath $e.FullName -Encoding UTF8
            Write-Ok ("{0}: removed {1} chase/attack component(s)" -f $e.Name, $n)
            $entityEdits += $n
        }
    }

    # 2. Scripts: mute particle bursts, leave sounds, messages and spawning alone.
    $scripts = @(Get-ChildItem $pack.Path -Recurse -Filter *.js -File -ErrorAction SilentlyContinue)
    foreach ($s in $scripts) {
        $lines = @(Get-Content -LiteralPath $s.FullName)
        $touched = 0
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match 'spawnParticle' -and $lines[$i] -notmatch '^\s*//\s*\[toned down\]') {
                $lines[$i] = '// [toned down] ' + $lines[$i]
                $touched++
            }
        }
        if ($touched -gt 0) {
            Set-Content -LiteralPath $s.FullName -Value $lines -Encoding UTF8
            Write-Ok ("{0}: muted {1} particle call(s)" -f $s.Name, $touched)
            $scriptEdits += $touched
        }
    }
}

Write-Host ""
if ($entityEdits -eq 0 -and $scriptEdits -eq 0) {
    Write-Warn2 "Nothing matched the usual patterns - this build of Null does its chasing somewhere else."
    Write-Host  "      Run 14-NULL-REPORT.cmd and send the output over; the exact edits can be written from that."
} else {
    Write-Ok ("Done: {0} chase/attack component(s) removed, {1} particle call(s) muted." -f $entityEdits, $scriptEdits)
    Write-Host "      Kept: the arrivals, the join message, the crosses, the sounds."
    Write-Host "      Undo any time with 16-NULL-FULL-STRENGTH.cmd."
}
Write-Host ""
Write-Host "Start Minecraft and give it a session." -ForegroundColor Cyan
if (-not $Quiet) { Read-Host "Press Enter to close" | Out-Null }
