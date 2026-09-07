<#
  Setup.ps1 - the one-click path.
  Opens the download pages the first time, then: imports whatever has been
  downloaded, installs it, applies a mode to a world, turns on the experiments
  the addons need, and launches Minecraft.
#>
param(
    [string]$Mode = 'beautiful',
    [string]$WorldName
)

. "$PSScriptRoot\Common.ps1"

$root = Get-PackRoot
Write-Host ""
Write-Host "  MINECRAFT BEDROCK STREAMER PACK - SETUP" -ForegroundColor Cyan
Write-Host "  ---------------------------------------" -ForegroundColor Cyan
Write-Host ""

# 1. Minecraft present?
try {
    $comMojang = Get-ComMojang
    Write-Ok "Minecraft found"
} catch {
    Write-Err2 "Minecraft for Windows has not been run yet."
    Write-Host "    Launch Minecraft, open any world for a few seconds, quit, then run this again."
    Read-Host "Press Enter to close" | Out-Null
    return
}

# 2. Do we already have the addon files?
[void](Import-FromDownloads)
$have = @(Get-ChildItem (Join-Path $root 'addons\downloads') -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -in '.mcpack', '.mcaddon' })
$sources = @(Get-Sources)

if ($have.Count -lt [Math]::Max(1, [int]($sources.Count * 0.6))) {
    Write-Host ""
    Write-Host "  Step 1 of 3 - download the addons" -ForegroundColor Yellow
    Write-Host "  I'll open every project page in your browser. On each page click the green"
    Write-Host "  Download button, then just leave the file in your Downloads folder."
    Write-Host ""
    $go = Read-Host "  Open the download pages now? (Y/n)"
    if ($go -notmatch '^[Nn]') {
        $n = Open-SourcePages -OptionalToo
        Write-Ok "$n pages opened"
        Write-Host ""
        Write-Host "  Download them all, then come back here." -ForegroundColor Yellow
        Read-Host "  Press Enter when the downloads have finished" | Out-Null
    }
}

# 3. Install everything that is now sitting in Downloads / addons\downloads
Write-Host ""
Write-Host "  Step 2 of 3 - installing" -ForegroundColor Yellow
& "$PSScriptRoot\Install-Addons.ps1" -Quiet

$installed = @(Get-InstalledPacks)
if ($installed.Count -eq 0) {
    Write-Err2 "Nothing got installed. Check that the downloads finished, then run this again."
    Read-Host "Press Enter to close" | Out-Null
    return
}

# 4. Switch the world on
Write-Host ""
Write-Host "  Step 3 of 3 - switching the addons on in your world" -ForegroundColor Yellow
try {
    if ($WorldName) { & "$PSScriptRoot\Set-Mode.ps1" -Mode $Mode -WorldName $WorldName -Quiet }
    else            { & "$PSScriptRoot\Set-Mode.ps1" -Mode $Mode -Quiet }
} catch {
    Write-Err2 $_.Exception.Message
    Write-Host "    Create the world in Minecraft first, then run 3-BEAUTIFUL-MODE.cmd."
    Read-Host "Press Enter to close" | Out-Null
    return
}

Write-Host ""
Write-Host "  All done." -ForegroundColor Green
$launch = Read-Host "  Launch Minecraft now? (Y/n)"
if ($launch -notmatch '^[Nn]') {
    if (Start-Minecraft) { Write-Ok "Minecraft is starting" } else { Write-Warn2 "Start Minecraft yourself." }
}
Write-Host ""
Read-Host "Press Enter to close" | Out-Null
