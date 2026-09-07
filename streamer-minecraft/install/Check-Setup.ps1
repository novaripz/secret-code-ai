<# Read-only health check. Changes nothing. Run this first when something looks wrong. #>
param([switch]$Quiet)
. "$PSScriptRoot\Common.ps1"

$root = Get-PackRoot
Write-Step "Minecraft data folders found"
$cands = @(Get-ComMojangCandidates)
if ($cands.Count -eq 0) {
    Write-Err2 "None. Launch Minecraft for Windows once and open any world, then run this again."
} else {
    foreach ($c in $cands) { Write-Host "    $c" }
    $active = Get-ComMojang
    Write-Ok "Using: $active"
}

Write-Step "Worlds"
try {
    foreach ($w in (Get-Worlds -ComMojang (Get-ComMojang))) {
        $rp = Join-Path $w.Path 'world_resource_packs.json'
        $bp = Join-Path $w.Path 'world_behavior_packs.json'
        $rpN = if (Test-Path $rp) { @(Get-Content $rp -Raw | ConvertFrom-Json).Count } else { 0 }
        $bpN = if (Test-Path $bp) { @(Get-Content $bp -Raw | ConvertFrom-Json).Count } else { 0 }
        Write-Host ("    {0,-28} {1} resource pack(s), {2} behaviour pack(s), last played {3}" -f $w.Name, $rpN, $bpN, $w.Modified)
    }
} catch { Write-Warn2 $_.Exception.Message }

Write-Step "Downloaded addon files"
$dl = @(Get-ChildItem (Join-Path $root 'addons\downloads') -File -Include *.mcpack, *.mcaddon, *.zip -Recurse -ErrorAction SilentlyContinue)
if ($dl.Count -eq 0) { Write-Warn2 "addons\downloads is empty - see docs\DOWNLOAD-LIST.md" }
foreach ($f in $dl) { Write-Host ("    {0}  ({1:N1} MB)" -f $f.Name, ($f.Length / 1MB)) }

Write-Step "Installed packs"
$installed = @(Get-InstalledPacks)
if ($installed.Count -eq 0) { Write-Warn2 "None yet - run 2-INSTALL-ADDONS.cmd" }
foreach ($p in ($installed | Sort-Object kind, name)) { Write-Host ("    {0,-9} {1}" -f $p.kind, $p.name) }

Write-Step "Backups"
$b = @(Get-ChildItem (Join-Path $root 'backups') -Filter *.zip -File -ErrorAction SilentlyContinue)
Write-Host ("    {0} backup file(s)" -f $b.Count)
if ($b.Count -gt 0) { Write-Host ("    newest: {0}" -f (($b | Sort-Object LastWriteTime -Descending)[0].Name)) }

Write-Host ""
if (-not $Quiet) { Read-Host "Press Enter to close" | Out-Null }
