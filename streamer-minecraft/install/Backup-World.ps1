param([string]$WorldName, [switch]$Quiet)
. "$PSScriptRoot\Common.ps1"

Write-Step "Looking for Minecraft"
$comMojang = Get-ComMojang
Assert-MinecraftClosed
$world = Select-World -ComMojang $comMojang -WorldName $WorldName

Write-Step ("Backing up '{0}'" -f $world.Name)
$zip = New-WorldBackup -WorldPath $world.Path -Tag 'manual'
Write-Ok $zip
Write-Host ""
Write-Host "Manual backups are never auto-deleted. Copy this folder to a USB stick or cloud drive now and then." -ForegroundColor Cyan
if (-not $Quiet) { Read-Host "Press Enter to close" | Out-Null }
