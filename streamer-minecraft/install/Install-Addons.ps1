<#
  Install-Addons.ps1
  Unpacks every .mcpack / .mcaddon / .zip you dropped in addons\downloads\,
  sorts them into behaviour packs and resource packs, and installs them into
  Minecraft's own pack folders. Nothing is enabled in a world yet - that is
  what Beautiful Mode / Performance Mode do.
#>
param([switch]$Quiet)

. "$PSScriptRoot\Common.ps1"

$root      = Get-PackRoot
$downloads = Join-Path $root 'addons\downloads'
$stageRp   = Join-Path $root 'addons\resource-packs'
$stageBp   = Join-Path $root 'addons\behavior-packs'

Write-Step "Looking for Minecraft"
$comMojang = Get-ComMojang
Write-Ok $comMojang
Assert-MinecraftClosed

$gameRp = Join-Path $comMojang 'resource_packs'
$gameBp = Join-Path $comMojang 'behavior_packs'
New-Item -ItemType Directory -Path $gameRp, $gameBp, $stageRp, $stageBp, $downloads -Force | Out-Null

Write-Step "Checking your Downloads folder for new addon files"
$picked = @(Import-FromDownloads)
if ($picked.Count -gt 0) {
    foreach ($p in $picked) { Write-Ok "picked up $p" }
} else {
    Write-Host "    nothing new"
}

Write-Step "Looking for addon files in addons\downloads"
$files = @(Get-ChildItem $downloads -File -Include *.mcpack, *.mcaddon, *.zip -Recurse -ErrorAction SilentlyContinue)
if ($files.Count -eq 0) {
    Write-Warn2 "Nothing to install yet."
    Write-Host  "    Download the addons listed in docs\DOWNLOAD-LIST.md from CurseForge,"
    Write-Host  "    drop the files into: $downloads"
    Write-Host  "    then run this again."
    if (-not $Quiet) { Read-Host "Press Enter to close" | Out-Null }
    return
}
Write-Ok ("{0} file(s) found" -f $files.Count)

$installed = @()
foreach ($f in $files) {
    Write-Step $f.Name
    $work = Join-Path ([System.IO.Path]::GetTempPath()) ('smp_' + (New-Guid).ToString())
    try {
        Expand-PackFile -File $f.FullName -Destination $work
    } catch {
        Write-Err2 "Could not unpack this file - it may be a corrupted or partial download. Skipped."
        continue
    }

    $manifests = @(Find-Manifests -Root $work)
    if ($manifests.Count -eq 0) {
        Write-Err2 "No manifest.json inside - this does not look like a Bedrock pack. Skipped."
        Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
        continue
    }

    foreach ($m in $manifests) {
        $info = Read-Manifest -ManifestPath $m.FullName
        if ($info.Kind -eq 'world_template') {
            Write-Warn2 ("'{0}' is a world template, not an addon - skipped." -f $info.Name)
            continue
        }
        $folder    = Get-SafeName $info.Name
        $stageDest = if ($info.Kind -eq 'behavior') { Join-Path $stageBp $folder } else { Join-Path $stageRp $folder }
        $gameDest  = if ($info.Kind -eq 'behavior') { Join-Path $gameBp  $folder } else { Join-Path $gameRp  $folder }

        foreach ($d in @($stageDest, $gameDest)) {
            if (Test-Path $d) { Remove-Item $d -Recurse -Force }
            New-Item -ItemType Directory -Path $d -Force | Out-Null
            Copy-Item -Path (Join-Path $info.Path '*') -Destination $d -Recurse -Force
        }

        $installed += [pscustomobject]@{
            name       = $info.Name
            uuid       = $info.Uuid
            version    = $info.Version
            kind       = $info.Kind
            folder     = $folder
            source     = $f.Name
            needs_beta = $info.NeedsBeta
            scripts    = $info.ScriptDeps
        }
        $betaNote = if ($info.NeedsBeta) { '  (needs Beta APIs - the mode script turns that on for you)' } else { '' }
        Write-Ok ("{0}  [{1} pack]{2}" -f $info.Name, $info.Kind, $betaNote)
    }
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}

# Last one wins if two downloads contain the same pack UUID (e.g. an update).
$dedup = @()
foreach ($p in $installed) {
    $dedup = @($dedup | Where-Object { $_.uuid -ne $p.uuid })
    $dedup += $p
}
Save-InstalledPacks $dedup

Write-Host ""
Write-Step "Installed and ready to enable"
foreach ($p in ($dedup | Sort-Object kind, name)) {
    Write-Host ("    {0,-9} {1}" -f $p.kind, $p.name)
}
Write-Host ""
Write-Host "Next: run 3-BEAUTIFUL-MODE.cmd (or 4-PERFORMANCE-MODE.cmd) to switch them on in your world." -ForegroundColor Cyan
if (-not $Quiet) { Read-Host "Press Enter to close" | Out-Null }
