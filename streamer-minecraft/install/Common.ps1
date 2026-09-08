# Common.ps1 - shared helpers for the streamer pack scripts.
# Dot-source this from the other scripts: . "$PSScriptRoot\Common.ps1"

$ErrorActionPreference = 'Stop'

function Get-PackRoot {
    # Root of the streamer-minecraft folder (one level above install\)
    return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function Write-Step  { param($m) Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Ok    { param($m) Write-Host "    OK  $m" -ForegroundColor Green }
function Write-Warn2 { param($m) Write-Host "    !!  $m" -ForegroundColor Yellow }
function Write-Err2  { param($m) Write-Host "    XX  $m" -ForegroundColor Red }

function Get-ComMojangCandidates {
    # Minecraft for Windows has moved its data folder over the years.
    # Check every known location instead of assuming one.
    $c = @()
    $roaming = $env:APPDATA
    $local   = $env:LOCALAPPDATA

    if ($roaming) {
        $bedrockUsers = Join-Path $roaming 'Minecraft Bedrock\Users'
        if (Test-Path $bedrockUsers) {
            foreach ($u in Get-ChildItem $bedrockUsers -Directory -ErrorAction SilentlyContinue) {
                $p = Join-Path $u.FullName 'games\com.mojang'
                if (Test-Path $p) { $c += $p }
            }
        }
    }
    if ($local) {
        foreach ($pkg in @(
            'Microsoft.MinecraftUWP_8wekyb3d8bbwe',
            'Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe'
        )) {
            $p = Join-Path $local "Packages\$pkg\LocalState\games\com.mojang"
            if (Test-Path $p) { $c += $p }
        }
    }
    return $c | Select-Object -Unique
}

function Get-ComMojang {
    # Pick the folder that actually holds worlds; fall back to the first that exists.
    $cands = @(Get-ComMojangCandidates)
    if ($cands.Count -eq 0) {
        throw "Could not find Minecraft's com.mojang folder. Launch Minecraft for Windows once, create or open any world, quit, then run this again."
    }
    $withWorlds = @($cands | Where-Object {
        $w = Join-Path $_ 'minecraftWorlds'
        (Test-Path $w) -and ((Get-ChildItem $w -Directory -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0)
    })
    if ($withWorlds.Count -gt 0) { return $withWorlds[0] }
    return $cands[0]
}

function Get-SafeName {
    param([string]$Name)
    $s = ($Name -replace '[^\w\.\- ]', '').Trim()
    if (-not $s) { $s = 'pack' }
    return ($s -replace '\s+', '_')
}

function ConvertTo-VersionArray {
    param($Version)
    # manifest header.version is usually [1,0,0] but can be a "1.0.0" string.
    if ($null -eq $Version) { return @(1, 0, 0) }
    if ($Version -is [string]) {
        $parts = $Version -split '[\.\-\+]' | Where-Object { $_ -match '^\d+$' }
        $nums = @($parts | ForEach-Object { [int]$_ })
        while ($nums.Count -lt 3) { $nums += 0 }
        return @($nums[0], $nums[1], $nums[2])
    }
    $nums = @($Version | ForEach-Object { [int]$_ })
    while ($nums.Count -lt 3) { $nums += 0 }
    return @($nums[0], $nums[1], $nums[2])
}

function Read-Manifest {
    param([string]$ManifestPath)
    # Some creators ship manifests with a UTF-8 BOM or trailing commas; strip the obvious ones.
    $raw = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8
    $raw = $raw -replace '^\xEF\xBB\xBF', ''
    $raw = [regex]::Replace($raw, ',\s*(\}|\])', '$1')
    $json = $raw | ConvertFrom-Json

    $types = @()
    if ($json.modules) { $types = @($json.modules | ForEach-Object { $_.type }) }
    $kind = 'resource'
    if ($types -contains 'data' -or $types -contains 'script' -or $types -contains 'javascript') { $kind = 'behavior' }
    elseif ($types -contains 'world_template') { $kind = 'world_template' }

    # Script-API packs declare a @minecraft/server dependency. A "-beta" version
    # means the pack only runs with the Beta APIs experiment switched on.
    $scriptDeps = @()
    if ($json.dependencies) {
        foreach ($d in $json.dependencies) {
            if ($d.module_name -and ([string]$d.module_name).StartsWith('@minecraft')) {
                $scriptDeps += ("{0}@{1}" -f $d.module_name, $d.version)
            }
        }
    }

    return [pscustomobject]@{
        Name        = [string]$json.header.name
        Uuid        = [string]$json.header.uuid
        Version     = ConvertTo-VersionArray $json.header.version
        Kind        = $kind
        ScriptDeps  = $scriptDeps
        NeedsBeta   = [bool](@($scriptDeps | Where-Object { $_ -match 'beta' }).Count)
        Path        = (Split-Path -Parent $ManifestPath)
    }
}

function Expand-PackFile {
    param([string]$File, [string]$Destination)
    # .mcpack / .mcaddon / .mcworld are all plain zips.
    if (Test-Path $Destination) { Remove-Item $Destination -Recurse -Force }
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    $tmpZip = Join-Path ([System.IO.Path]::GetTempPath()) ((New-Guid).ToString() + '.zip')
    Copy-Item -LiteralPath $File -Destination $tmpZip -Force
    try {
        Expand-Archive -LiteralPath $tmpZip -DestinationPath $Destination -Force
    } finally {
        Remove-Item $tmpZip -Force -ErrorAction SilentlyContinue
    }

    # .mcaddon files often contain nested .mcpack files - unpack those too.
    $nested = Get-ChildItem $Destination -Recurse -Include *.mcpack, *.mcaddon -File -ErrorAction SilentlyContinue
    foreach ($n in $nested) {
        $sub = Join-Path $n.DirectoryName ($n.BaseName + '_unpacked')
        Expand-PackFile -File $n.FullName -Destination $sub
        Remove-Item $n.FullName -Force -ErrorAction SilentlyContinue
    }
}

function Find-Manifests {
    param([string]$Root)
    # Only top-most manifests matter; a pack folder never nests another pack inside itself.
    $all = Get-ChildItem $Root -Recurse -Filter manifest.json -File -ErrorAction SilentlyContinue
    $result = @()
    foreach ($m in $all | Sort-Object { $_.FullName.Length }) {
        $dir = Split-Path -Parent $m.FullName
        $isNested = $false
        foreach ($r in $result) {
            if ($dir.StartsWith((Split-Path -Parent $r.FullName) + [IO.Path]::DirectorySeparatorChar, 'OrdinalIgnoreCase')) { $isNested = $true; break }
        }
        if (-not $isNested) { $result += $m }
    }
    return $result
}

function Get-StatePath {
    return (Join-Path (Get-PackRoot) 'install\state\installed-packs.json')
}

function Get-InstalledPacks {
    $p = Get-StatePath
    if (-not (Test-Path $p)) { return @() }
    $data = Get-Content -LiteralPath $p -Raw | ConvertFrom-Json
    if ($null -eq $data) { return @() }
    return @($data)
}

function Save-InstalledPacks {
    param($Packs)
    $p = Get-StatePath
    New-Item -ItemType Directory -Path (Split-Path -Parent $p) -Force | Out-Null
    ($Packs | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $p -Encoding UTF8
}

function Get-Worlds {
    param([string]$ComMojang)
    $wdir = Join-Path $ComMojang 'minecraftWorlds'
    if (-not (Test-Path $wdir)) { return @() }
    $out = @()
    foreach ($d in Get-ChildItem $wdir -Directory) {
        $nameFile = Join-Path $d.FullName 'levelname.txt'
        $name = if (Test-Path $nameFile) { (Get-Content -LiteralPath $nameFile -Raw).Trim() } else { $d.Name }
        $out += [pscustomobject]@{
            Name     = $name
            Path     = $d.FullName
            Modified = $d.LastWriteTime
        }
    }
    return @($out | Sort-Object Modified -Descending)
}

function Select-World {
    param([string]$ComMojang, [string]$WorldName)
    $worlds = @(Get-Worlds -ComMojang $ComMojang)
    if ($worlds.Count -eq 0) {
        # Say what was checked - Minecraft keeps worlds per signed-in account, and
        # an empty folder usually means the world was never actually created.
        $lines = @("No worlds found.", "", "Checked:")
        foreach ($c in @(Get-ComMojangCandidates)) {
            $wdir = Join-Path $c 'minecraftWorlds'
            $n = if (Test-Path $wdir) { @(Get-ChildItem $wdir -Directory -ErrorAction SilentlyContinue).Count } else { 'no folder' }
            $lines += ("  {0}  -> {1} world(s)" -f $c, $n)
        }
        $lines += @(
            "",
            "In Minecraft, create the world (or open the one you play) and let it load fully,",
            "then quit the game and run this again. Turning on Beta APIs on the create screen",
            "does not create the world - you have to press Create and load in."
        )
        throw ($lines -join [Environment]::NewLine)
    }

    if ($WorldName) {
        $match = @($worlds | Where-Object { $_.Name -eq $WorldName })
        if ($match.Count -eq 0) { $match = @($worlds | Where-Object { $_.Name -like "*$WorldName*" }) }
        if ($match.Count -eq 0) { throw "No world matching '$WorldName'. Found: " + (($worlds | ForEach-Object { $_.Name }) -join ', ') }
        return $match[0]
    }

    if ($worlds.Count -eq 1) { return $worlds[0] }

    Write-Host ""
    Write-Host "Which world?" -ForegroundColor Cyan
    for ($i = 0; $i -lt $worlds.Count; $i++) {
        Write-Host ("  [{0}] {1}   (last played {2})" -f ($i + 1), $worlds[$i].Name, $worlds[$i].Modified)
    }
    Write-Host ""
    $choice = Read-Host "Type the number and press Enter"
    $idx = 0
    if (-not [int]::TryParse($choice, [ref]$idx) -or $idx -lt 1 -or $idx -gt $worlds.Count) {
        throw "That wasn't one of the numbers in the list."
    }
    return $worlds[$idx - 1]
}

function New-WorldBackup {
    param([string]$WorldPath, [string]$Tag = 'auto', [int]$Keep = 15)
    $backupDir = Join-Path (Get-PackRoot) 'backups'
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    $nameFile = Join-Path $WorldPath 'levelname.txt'
    $name = if (Test-Path $nameFile) { (Get-Content -LiteralPath $nameFile -Raw).Trim() } else { Split-Path -Leaf $WorldPath }
    $stamp = Get-Date -Format 'yyyy-MM-dd_HHmm-ss'
    $zip = Join-Path $backupDir ("{0}__{1}__{2}.zip" -f (Get-SafeName $name), $Tag, $stamp)

    # Copy first: Minecraft keeps level.dat / db files open while the game runs.
    $staging = Join-Path ([System.IO.Path]::GetTempPath()) ((New-Guid).ToString())
    New-Item -ItemType Directory -Path $staging -Force | Out-Null
    try {
        Copy-Item -LiteralPath $WorldPath -Destination (Join-Path $staging 'world') -Recurse -Force -ErrorAction Stop
        Compress-Archive -Path (Join-Path $staging 'world\*') -DestinationPath $zip -CompressionLevel Optimal
    } finally {
        Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
    }

    # Trim old auto backups so the folder does not grow forever. Manual ones are kept.
    $old = @(Get-ChildItem $backupDir -Filter '*__auto__*.zip' -File | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep)
    foreach ($o in $old) { Remove-Item $o.FullName -Force -ErrorAction SilentlyContinue }

    return $zip
}

function Get-MatchKey {
    # Pack names in manifests vary in punctuation - "Nature's Touch", "Natures Touch",
    # "Nature’s Touch" are all the same pack. Compare on letters and digits only.
    param([string]$Text)
    return (($Text -replace "[^\p{L}\p{N}]", '').ToLowerInvariant())
}

function Resolve-ProfilePacks {
    param($Matchers, $Installed, [string]$Kind)
    # Matchers are plain-English name fragments so the profiles stay human-editable.
    $resolved = @()
    $missing  = @()
    foreach ($m in $Matchers) {
        $key = Get-MatchKey $m
        $hit = @($Installed | Where-Object { $_.kind -eq $Kind -and (Get-MatchKey $_.name).Contains($key) })
        if ($hit.Count -eq 0) { $missing += $m; continue }
        foreach ($h in $hit) {
            if ($resolved | Where-Object { $_.uuid -eq $h.uuid }) { continue }
            $resolved += $h
        }
    }
    return [pscustomobject]@{ Packs = $resolved; Missing = $missing }
}

function Write-WorldPackList {
    param([string]$WorldPath, [string]$FileName, $Packs)
    $entries = @()
    foreach ($p in $Packs) {
        $entries += [pscustomobject]@{
            pack_id = $p.uuid
            version = @([int]$p.version[0], [int]$p.version[1], [int]$p.version[2])
        }
    }
    $target = Join-Path $WorldPath $FileName
    if ($entries.Count -eq 0) {
        '[]' | Set-Content -LiteralPath $target -Encoding UTF8
    } else {
        # ConvertTo-Json collapses a single-element array, so force array syntax.
        $json = ConvertTo-Json -InputObject @($entries) -Depth 5
        if ($json.TrimStart().StartsWith('{')) { $json = "[$json]" }
        $json | Set-Content -LiteralPath $target -Encoding UTF8
    }
}

function Assert-MinecraftClosed {
    $proc = @(Get-Process -Name 'Minecraft.Windows', 'Minecraft' -ErrorAction SilentlyContinue)
    if ($proc.Count -gt 0) {
        Write-Warn2 "Minecraft is running. Close it completely, then press Enter."
        Read-Host "Press Enter once Minecraft is closed" | Out-Null
    }
}

function Import-FromDownloads {
    # Plug and play: pick addon files straight out of the Windows Downloads
    # folder so nothing has to be dragged around by hand.
    $target = Join-Path (Get-PackRoot) 'addons\downloads'
    New-Item -ItemType Directory -Path $target -Force | Out-Null

    $sources = @()
    foreach ($d in @(
        (Join-Path $env:USERPROFILE 'Downloads'),
        (Join-Path $env:USERPROFILE 'OneDrive\Downloads'),
        (Join-Path $env:USERPROFILE 'Desktop')
    )) { if ($d -and (Test-Path $d)) { $sources += $d } }

    $copied = @()
    foreach ($dir in $sources) {
        $found = @(Get-ChildItem $dir -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -in '.mcpack', '.mcaddon' })
        foreach ($f in $found) {
            $dest = Join-Path $target $f.Name
            if ((Test-Path $dest) -and ((Get-Item $dest).Length -eq $f.Length)) { continue }
            Copy-Item -LiteralPath $f.FullName -Destination $dest -Force
            $copied += $f.Name
        }
    }
    return $copied
}

function Get-Sources {
    $p = Join-Path (Get-PackRoot) 'addons\sources.json'
    if (-not (Test-Path $p)) { return @() }
    return @(Get-Content -LiteralPath $p -Raw | ConvertFrom-Json)
}

function Open-SourcePages {
    param([switch]$OptionalToo)
    $list = @(Get-Sources | Where-Object { $OptionalToo -or -not $_.optional })
    foreach ($s in $list) {
        Start-Process $s.url | Out-Null
        Start-Sleep -Milliseconds 400
    }
    return $list.Count
}

function Start-Minecraft {
    try { Start-Process 'minecraft://' | Out-Null; return $true } catch { return $false }
}

function Set-OptionsFile {
    # Rewrites only keys that already exist in Minecraft's options.txt, then reads
    # the file back and reports what actually landed. Never invents keys.
    param([string]$Path, [hashtable]$Values)

    $lines   = @(Get-Content -LiteralPath $Path)
    $changed = @()
    $absent  = @()
    $same    = @()

    foreach ($key in $Values.Keys) {
        $want  = $Values[$key]
        $index = -1
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match ("^{0}:" -f [regex]::Escape($key))) { $index = $i; break }
        }
        if ($index -lt 0) { $absent += $key; continue }

        $old = ($lines[$index] -split ':', 2)[1]
        if ("$old" -eq "$want") { $same += $key; continue }
        $lines[$index] = "{0}:{1}" -f $key, $want
        $changed += [pscustomobject]@{ Key = $key; From = $old; To = $want; Landed = $false }
    }

    if ($changed.Count -gt 0) {
        Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8
        $verify = @(Get-Content -LiteralPath $Path)
        foreach ($c in $changed) {
            $hit = @($verify | Where-Object { $_ -match ("^{0}:" -f [regex]::Escape($c.Key)) })
            $c.Landed = [bool]($hit.Count -and (($hit[0] -split ':', 2)[1] -eq "$($c.To)"))
        }
    }

    return [pscustomobject]@{ Changed = $changed; Absent = $absent; Unchanged = $same }
}
