<# Restores a backup zip over an existing world folder. The current world is
   backed up first, so a wrong pick is always undoable. #>
param([switch]$Quiet)
. "$PSScriptRoot\Common.ps1"

$root      = Get-PackRoot
$backupDir = Join-Path $root 'backups'
$backups   = @(Get-ChildItem $backupDir -Filter *.zip -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
if ($backups.Count -eq 0) { throw "No backups in $backupDir yet." }

Write-Host "Backups, newest first:" -ForegroundColor Cyan
for ($i = 0; $i -lt $backups.Count; $i++) {
    Write-Host ("  [{0}] {1}   ({2})" -f ($i + 1), $backups[$i].Name, $backups[$i].LastWriteTime)
}
Write-Host ""
$choice = Read-Host "Which backup do you want to restore? Type the number"
$idx = 0
if (-not [int]::TryParse($choice, [ref]$idx) -or $idx -lt 1 -or $idx -gt $backups.Count) { throw "That wasn't one of the numbers in the list." }
$zip = $backups[$idx - 1]

$comMojang = Get-ComMojang
Assert-MinecraftClosed
Write-Host ""
Write-Host "Now pick the world this backup should be restored INTO (its contents will be replaced)." -ForegroundColor Yellow
$world = Select-World -ComMojang $comMojang

Write-Host ""
$confirm = Read-Host ("Replace '{0}' with '{1}'? Type YES to continue" -f $world.Name, $zip.Name)
if ($confirm -ne 'YES') { Write-Host "Cancelled - nothing was changed."; if (-not $Quiet) { Read-Host "Press Enter to close" | Out-Null }; return }

Write-Step "Backing up the current state first"
$safety = New-WorldBackup -WorldPath $world.Path -Tag 'before-restore'
Write-Ok (Split-Path -Leaf $safety)

Write-Step "Restoring"
$staging = Join-Path ([System.IO.Path]::GetTempPath()) ((New-Guid).ToString())
Expand-Archive -LiteralPath $zip.FullName -DestinationPath $staging -Force
Get-ChildItem $world.Path -Force | Remove-Item -Recurse -Force
Copy-Item -Path (Join-Path $staging '*') -Destination $world.Path -Recurse -Force
Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue

Write-Ok ("'{0}' restored from {1}" -f $world.Name, $zip.Name)
if (-not $Quiet) { Read-Host "Press Enter to close" | Out-Null }
