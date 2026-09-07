<# Turns the horror addons (Null, Stalkers, Verity) off or back on in a world
   without touching anything else - for when a stream needs to calm down fast. #>
param(
    [ValidateSet('off', 'on')][string]$State = 'off',
    [ValidateSet('all', 'null', 'verity', 'stalkers')][string]$Which = 'all',
    [string]$WorldName,
    [switch]$Quiet
)
. "$PSScriptRoot\Common.ps1"

$horror = switch ($Which) {
    'null'     { @('Null') }
    'verity'   { @('Verity') }
    'stalkers' { @('Stalker') }
    default    { @('Null', 'Stalker', 'Verity') }
}
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
        $horrorIds = @($installed | Where-Object { $k = $_; @($horror | Where-Object { (Get-MatchKey $k.name).Contains((Get-MatchKey $_)) }).Count -gt 0 } | ForEach-Object { $_.uuid })
        $kept = @($current | Where-Object { $horrorIds -notcontains $_.pack_id })
        $packs = @()
        foreach ($e in $kept) {
            $match = @($installed | Where-Object { $_.uuid -eq $e.pack_id })
            if ($match.Count) { $packs += $match[0] }
        }
        Write-WorldPackList -WorldPath $world.Path -FileName $file -Packs $packs
    } else {
        $add = @($installed | Where-Object { $k = $_; $k.kind -eq $kind -and (@($horror | Where-Object { (Get-MatchKey $k.name).Contains((Get-MatchKey $_)) }).Count -gt 0) })
        $packs = @()
        foreach ($e in $current) {
            $match = @($installed | Where-Object { $_.uuid -eq $e.pack_id })
            if ($match.Count) { $packs += $match[0] }
        }
        foreach ($a in $add) { if (-not ($packs | Where-Object { $_.uuid -eq $a.uuid })) { $packs += $a } }
        Write-WorldPackList -WorldPath $world.Path -FileName $file -Packs $packs
    }
}

$names = ($horror -join ', ')
if ($State -eq 'off') { Write-Ok "$names switched off in '$($world.Name)'." }
else { Write-Ok "$names switched back on in '$($world.Name)'." }
if ($State -eq 'off' -and $horror -contains 'Verity') {
    Write-Host "Note: achievements stay off in a world that has ever had Beta APIs on - removing Verity does not bring them back." -ForegroundColor Yellow
}
Write-Host "The world keeps everything else. Restart Minecraft for it to take effect." -ForegroundColor Cyan
if (-not $Quiet) { Read-Host "Press Enter to close" | Out-Null }
