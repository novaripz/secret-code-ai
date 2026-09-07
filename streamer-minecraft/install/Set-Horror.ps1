<# Turns the horror addons (Null, Stalkers, Verity) off or back on in a world
   without touching anything else - for when a stream needs to calm down fast. #>
param(
    [ValidateSet('off', 'on')][string]$State = 'off',
    [string]$WorldName,
    [switch]$Quiet
)
. "$PSScriptRoot\Common.ps1"

$horror = @('Null', 'Stalker', 'Verity')
$comMojang = Get-ComMojang
Assert-MinecraftClosed
$world = Select-World -ComMojang $comMojang -WorldName $WorldName
$installed = @(Get-InstalledPacks)

Write-Step ("Backing up '{0}'" -f $world.Name)
$zip = New-WorldBackup -WorldPath $world.Path -Tag 'horror-toggle'
Write-Ok (Split-Path -Leaf $zip)

foreach ($file in @('world_behavior_packs.json', 'world_resource_packs.json')) {
    $path = Join-Path $world.Path $file
    $current = if (Test-Path $path) { @(Get-Content -LiteralPath $path -Raw | ConvertFrom-Json) } else { @() }
    $kind = if ($file -like '*behavior*') { 'behavior' } else { 'resource' }

    if ($State -eq 'off') {
        $horrorIds = @($installed | Where-Object { $k = $_; @($horror | Where-Object { $k.name -like "*$_*" }).Count -gt 0 } | ForEach-Object { $_.uuid })
        $kept = @($current | Where-Object { $horrorIds -notcontains $_.pack_id })
        $packs = @()
        foreach ($e in $kept) {
            $match = @($installed | Where-Object { $_.uuid -eq $e.pack_id })
            if ($match.Count) { $packs += $match[0] }
        }
        Write-WorldPackList -WorldPath $world.Path -FileName $file -Packs $packs
    } else {
        $add = @($installed | Where-Object { $k = $_; $k.kind -eq $kind -and (@($horror | Where-Object { $k.name -like "*$_*" }).Count -gt 0) })
        $packs = @()
        foreach ($e in $current) {
            $match = @($installed | Where-Object { $_.uuid -eq $e.pack_id })
            if ($match.Count) { $packs += $match[0] }
        }
        foreach ($a in $add) { if (-not ($packs | Where-Object { $_.uuid -eq $a.uuid })) { $packs += $a } }
        Write-WorldPackList -WorldPath $world.Path -FileName $file -Packs $packs
    }
}

if ($State -eq 'off') { Write-Ok "Null, Stalkers and Verity are switched off in '$($world.Name)'." }
else { Write-Ok "Horror addons switched back on in '$($world.Name)'." }
Write-Host "The world keeps everything else. Restart Minecraft for it to take effect." -ForegroundColor Cyan
if (-not $Quiet) { Read-Host "Press Enter to close" | Out-Null }
