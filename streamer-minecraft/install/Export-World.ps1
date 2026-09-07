<# Exports the world as a .mcworld file into world\ - handy for sending a copy
   to a friend or moving to another PC. Enabled packs are remembered inside it,
   but the pack files themselves still have to be installed on the other PC. #>
param([string]$WorldName, [switch]$Quiet)
. "$PSScriptRoot\Common.ps1"

$comMojang = Get-ComMojang
Assert-MinecraftClosed
$world = Select-World -ComMojang $comMojang -WorldName $WorldName

$outDir = Join-Path (Get-PackRoot) 'world'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$stamp = Get-Date -Format 'yyyy-MM-dd'
$base  = "{0}_{1}" -f (Get-SafeName $world.Name), $stamp
$zip   = Join-Path $outDir ($base + '.zip')
$mcw   = Join-Path $outDir ($base + '.mcworld')

Write-Step ("Exporting '{0}'" -f $world.Name)
$staging = Join-Path ([System.IO.Path]::GetTempPath()) ((New-Guid).ToString())
New-Item -ItemType Directory -Path $staging -Force | Out-Null
try {
    Copy-Item -LiteralPath $world.Path -Destination (Join-Path $staging 'world') -Recurse -Force
    if (Test-Path $zip) { Remove-Item $zip -Force }
    Compress-Archive -Path (Join-Path $staging 'world\*') -DestinationPath $zip -CompressionLevel Optimal
    if (Test-Path $mcw) { Remove-Item $mcw -Force }
    Rename-Item -LiteralPath $zip -NewName ([IO.Path]::GetFileName($mcw))
} finally {
    Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Ok $mcw
Write-Host "Double-clicking a .mcworld file imports it into Minecraft." -ForegroundColor Cyan
if (-not $Quiet) { Read-Host "Press Enter to close" | Out-Null }
