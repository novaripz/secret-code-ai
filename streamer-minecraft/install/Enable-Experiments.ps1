<#
  Enable-Experiments.ps1 -WorldPath <folder> [-Toggles gametest,...]
  Turns on the world's experimental toggles by editing level.dat directly, so
  the streamer never has to hunt through world settings. Verity (Beta APIs) and
  Null both need this.

  Safety: the caller backs the world up first; this script also writes a
  level.dat.bak next to the file and re-parses what it wrote. If anything looks
  wrong it restores the original and returns $false so the caller can fall back
  to telling the user to flip the toggle by hand.
#>
param(
    [string]$WorldPath,
    [string[]]$Toggles = @('gametest')
)

. "$PSScriptRoot\Nbt.ps1"

function Enable-WorldExperiments {
    param([string]$WorldPath, [string[]]$Toggles)

    $levelDat = Join-Path $WorldPath 'level.dat'
    if (-not (Test-Path $levelDat)) { return [pscustomobject]@{ Ok = $false; Reason = 'level.dat not found' } }

    $bak = Join-Path $WorldPath 'level.dat.streamerpack.bak'
    Copy-Item -LiteralPath $levelDat -Destination $bak -Force

    try {
        $level = Read-LevelDat -Path $levelDat

        $expTag = Get-NbtChild -Compound $level.Root -Name 'experiments'
        if (-not $expTag) {
            $expTag = [pscustomobject]@{ Type = [byte]10; Name = 'experiments'; Value = (New-NbtCompound) }
            [void]$level.Root.Tags.Add($expTag)
        }
        if ($expTag.Type -ne 10) { throw "'experiments' is not a compound tag." }

        foreach ($t in $Toggles) { Set-NbtByte -Compound $expTag.Value -Name $t -Value 1 }
        Set-NbtByte -Compound $expTag.Value -Name 'experiments_ever_used' -Value 1
        Set-NbtByte -Compound $expTag.Value -Name 'saved_with_toggled_experiments' -Value 1

        Write-LevelDat -Path $levelDat -Level $level

        # Prove the file we just wrote still parses and holds what we set.
        $check    = Read-LevelDat -Path $levelDat
        $checkExp = Get-NbtChild -Compound $check.Root -Name 'experiments'
        if (-not $checkExp) { throw 'verification failed: experiments tag missing after write' }
        foreach ($t in $Toggles) {
            $v = Get-NbtChild -Compound $checkExp.Value -Name $t
            if (-not $v -or [int]$v.Value -ne 1) { throw "verification failed: $t did not stick" }
        }
        if ($check.Root.Tags.Count -lt $level.Root.Tags.Count) { throw 'verification failed: tags were lost' }

        return [pscustomobject]@{ Ok = $true; Reason = ($Toggles -join ', ') }
    } catch {
        Copy-Item -LiteralPath $bak -Destination $levelDat -Force
        return [pscustomobject]@{ Ok = $false; Reason = $_.Exception.Message }
    }
}

if ($WorldPath) {
    $r = Enable-WorldExperiments -WorldPath $WorldPath -Toggles $Toggles
    if ($r.Ok) { Write-Host "Experiments enabled: $($r.Reason)" } else { Write-Host "Could not enable experiments: $($r.Reason)" }
}
