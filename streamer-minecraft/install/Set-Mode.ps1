<#
  Set-Mode.ps1 -Mode beautiful|performance|null-test [-WorldName "My World"]
  Rewrites the world's pack lists from profiles\<mode>.json.
  Always takes a backup of the world first.
#>
param(
    [Parameter(Mandatory = $true)][string]$Mode,
    [string]$WorldName,
    [switch]$Quiet
)

. "$PSScriptRoot\Common.ps1"
. "$PSScriptRoot\Enable-Experiments.ps1"

$root    = Get-PackRoot
$profilePath = Join-Path $root ("profiles\{0}.json" -f $Mode)
if (-not (Test-Path $profilePath)) {
    throw "No profile called '$Mode'. Available: " + ((Get-ChildItem (Join-Path $root 'profiles') -Filter *.json | ForEach-Object { $_.BaseName }) -join ', ')
}
$cfg = Get-Content -LiteralPath $profilePath -Raw | ConvertFrom-Json

$installed = @(Get-InstalledPacks)
if ($installed.Count -eq 0) {
    throw "No addons installed yet. Run 2-INSTALL-ADDONS.cmd first."
}

Write-Step "Looking for Minecraft"
$comMojang = Get-ComMojang
Assert-MinecraftClosed

$world = Select-World -ComMojang $comMojang -WorldName $WorldName
Write-Ok ("World: {0}" -f $world.Name)

Write-Step "Backing up the world before changing anything"
$zip = New-WorldBackup -WorldPath $world.Path -Tag 'auto'
Write-Ok (Split-Path -Leaf $zip)

$rp = Resolve-ProfilePacks -Matchers @($cfg.resource_packs) -Installed $installed -Kind 'resource'
$bp = Resolve-ProfilePacks -Matchers @($cfg.behavior_packs) -Installed $installed -Kind 'behavior'

Write-Step ("Switching to: {0}" -f $cfg.name)
Write-WorldPackList -WorldPath $world.Path -FileName 'world_resource_packs.json' -Packs $rp.Packs
Write-WorldPackList -WorldPath $world.Path -FileName 'world_behavior_packs.json' -Packs $bp.Packs

Write-Host ""
Write-Host "  Resource packs (top of the list wins):" -ForegroundColor Cyan
if ($rp.Packs.Count -eq 0) { Write-Host "    (none - plain vanilla look)" }
foreach ($p in $rp.Packs) { Write-Host ("    - {0}" -f $p.name) }
Write-Host "  Behaviour packs:" -ForegroundColor Cyan
if ($bp.Packs.Count -eq 0) { Write-Host "    (none)" }
foreach ($p in $bp.Packs) { Write-Host ("    - {0}" -f $p.name) }

# Anything script-driven that asks for a beta module (Verity, Null) needs the
# Beta APIs experiment. Turn it on in level.dat rather than making the streamer
# hunt through world settings.
$needBeta = @(($rp.Packs + $bp.Packs) | Where-Object { $_.needs_beta })
$toggles  = @()
if ($cfg.experiments) { $toggles += @($cfg.experiments) }
if ($needBeta.Count -gt 0 -and $toggles -notcontains 'gametest') { $toggles += 'gametest' }

if ($toggles.Count -gt 0) {
    Write-Step ("Turning on world experiments: {0}" -f ($toggles -join ', '))
    if ($needBeta.Count -gt 0) {
        Write-Host ("    required by: {0}" -f (($needBeta | ForEach-Object { $_.name }) -join ', '))
    }
    $res = Enable-WorldExperiments -WorldPath $world.Path -Toggles $toggles
    if ($res.Ok) {
        Write-Ok "done automatically - achievements are off in this world from now on"
    } else {
        Write-Warn2 ("Could not set it automatically ({0})." -f $res.Reason)
        Write-Host  "      Do it by hand: Minecraft > your world > Edit > Settings > Experiments > Beta APIs > ON."
    }
}

$missing = @($rp.Missing + $bp.Missing)
if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Warn2 "These were in the profile but are not installed (they were skipped):"
    foreach ($m in $missing) { Write-Host ("      - {0}" -f $m) }
    Write-Host  "      Download them, drop them in addons\downloads, run 2-INSTALL-ADDONS.cmd, then run this again."
}

if ($cfg.reminders) {
    Write-Host ""
    Write-Host "  Do this in-game:" -ForegroundColor Yellow
    foreach ($r in $cfg.reminders) { Write-Host ("    * {0}" -f $r) }
}

Write-Host ""
Write-Ok "Done. Start Minecraft and open the world."
if (-not $Quiet) { Read-Host "Press Enter to close" | Out-Null }
