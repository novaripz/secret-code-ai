<#
  Nbt.ps1 - minimal little-endian NBT reader/writer for Bedrock's level.dat.
  Bedrock level.dat layout: 4-byte version, 4-byte payload length, then an
  uncompressed little-endian NBT root compound.

  Only used to flip the world's experiment toggles. Every caller backs the
  world up first and re-parses the file afterwards to prove it is still valid.
#>

function Read-NbtString {
    param([System.IO.BinaryReader]$R)
    $len = $R.ReadUInt16()
    if ($len -eq 0) { return '' }
    return [System.Text.Encoding]::UTF8.GetString($R.ReadBytes($len))
}

function Write-NbtString {
    param([System.IO.BinaryWriter]$W, [string]$S)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes([string]$S)
    $W.Write([uint16]$bytes.Length)
    if ($bytes.Length -gt 0) { $W.Write($bytes) }
}

function Read-NbtPayload {
    param([System.IO.BinaryReader]$R, [byte]$Type)
    switch ($Type) {
        1  { return $R.ReadSByte() }
        2  { return $R.ReadInt16() }
        3  { return $R.ReadInt32() }
        4  { return $R.ReadInt64() }
        5  { return $R.ReadSingle() }
        6  { return $R.ReadDouble() }
        7  { $n = $R.ReadInt32(); return , $R.ReadBytes($n) }
        8  { return Read-NbtString -R $R }
        9  {
            $et = $R.ReadByte()
            $n  = $R.ReadInt32()
            $items = New-Object System.Collections.ArrayList
            for ($i = 0; $i -lt $n; $i++) { [void]$items.Add((Read-NbtPayload -R $R -Type $et)) }
            return [pscustomobject]@{ NbtList = $true; ElementType = $et; Items = $items }
        }
        10 {
            $tags = New-Object System.Collections.ArrayList
            while ($true) {
                $t = $R.ReadByte()
                if ($t -eq 0) { break }
                $name = Read-NbtString -R $R
                $val  = Read-NbtPayload -R $R -Type $t
                [void]$tags.Add([pscustomobject]@{ Type = $t; Name = $name; Value = $val })
            }
            return [pscustomobject]@{ NbtCompound = $true; Tags = $tags }
        }
        11 { $n = $R.ReadInt32(); $a = @(); for ($i = 0; $i -lt $n; $i++) { $a += $R.ReadInt32() }; return , $a }
        12 { $n = $R.ReadInt32(); $a = @(); for ($i = 0; $i -lt $n; $i++) { $a += $R.ReadInt64() }; return , $a }
        default { throw "Unsupported NBT tag type $Type" }
    }
}

function Write-NbtPayload {
    param([System.IO.BinaryWriter]$W, [byte]$Type, $Value)
    switch ($Type) {
        1  { $W.Write([sbyte]$Value) }
        2  { $W.Write([int16]$Value) }
        3  { $W.Write([int32]$Value) }
        4  { $W.Write([int64]$Value) }
        5  { $W.Write([single]$Value) }
        6  { $W.Write([double]$Value) }
        7  { $b = [byte[]]$Value; $W.Write([int32]$b.Length); if ($b.Length) { $W.Write($b) } }
        8  { Write-NbtString -W $W -S $Value }
        9  {
            $W.Write([byte]$Value.ElementType)
            $W.Write([int32]$Value.Items.Count)
            foreach ($i in $Value.Items) { Write-NbtPayload -W $W -Type $Value.ElementType -Value $i }
        }
        10 {
            foreach ($t in $Value.Tags) {
                $W.Write([byte]$t.Type)
                Write-NbtString -W $W -S $t.Name
                Write-NbtPayload -W $W -Type $t.Type -Value $t.Value
            }
            $W.Write([byte]0)
        }
        11 { $a = @($Value); $W.Write([int32]$a.Count); foreach ($i in $a) { $W.Write([int32]$i) } }
        12 { $a = @($Value); $W.Write([int32]$a.Count); foreach ($i in $a) { $W.Write([int64]$i) } }
        default { throw "Unsupported NBT tag type $Type" }
    }
}

function Read-LevelDat {
    param([string]$Path)
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    $ms = New-Object System.IO.MemoryStream(, $bytes)
    $r  = New-Object System.IO.BinaryReader($ms)
    try {
        $header  = $r.ReadInt32()
        $length  = $r.ReadInt32()
        $rootType = $r.ReadByte()
        if ($rootType -ne 10) { throw "level.dat does not start with a compound tag (got type $rootType)." }
        $rootName = Read-NbtString -R $r
        $root     = Read-NbtPayload -R $r -Type 10
        return [pscustomobject]@{
            Header    = $header
            Length    = $length
            RootName  = $rootName
            Root      = $root
            RawLength = $bytes.Length
        }
    } finally { $r.Dispose(); $ms.Dispose() }
}

function Write-LevelDat {
    param([string]$Path, $Level)
    $ms = New-Object System.IO.MemoryStream
    $w  = New-Object System.IO.BinaryWriter($ms)
    try {
        $w.Write([byte]10)
        Write-NbtString -W $w -S $Level.RootName
        Write-NbtPayload -W $w -Type 10 -Value $Level.Root
        $w.Flush()
        $payload = $ms.ToArray()
    } finally { $w.Dispose(); $ms.Dispose() }

    $out = New-Object System.IO.MemoryStream
    $ow  = New-Object System.IO.BinaryWriter($out)
    try {
        $ow.Write([int32]$Level.Header)
        $ow.Write([int32]$payload.Length)
        $ow.Write($payload)
        $ow.Flush()
        [System.IO.File]::WriteAllBytes($Path, $out.ToArray())
    } finally { $ow.Dispose(); $out.Dispose() }
}

function Get-NbtChild {
    param($Compound, [string]$Name)
    foreach ($t in $Compound.Tags) { if ($t.Name -eq $Name) { return $t } }
    return $null
}

function Set-NbtByte {
    param($Compound, [string]$Name, [int]$Value)
    $existing = Get-NbtChild -Compound $Compound -Name $Name
    if ($existing) {
        if ($existing.Type -ne 1) { throw "'$Name' is not a byte tag." }
        $existing.Value = [sbyte]$Value
    } else {
        [void]$Compound.Tags.Add([pscustomobject]@{ Type = [byte]1; Name = $Name; Value = [sbyte]$Value })
    }
}

function New-NbtCompound {
    return [pscustomobject]@{ NbtCompound = $true; Tags = (New-Object System.Collections.ArrayList) }
}

function Set-SimulationDistance {
    # serverChunkTickRange = the world's simulation distance. Restores the
    # original level.dat and returns Ok=$false if anything goes wrong.
    param([string]$WorldPath, [int]$Chunks)

    $levelDat = Join-Path $WorldPath 'level.dat'
    if (-not (Test-Path $levelDat)) { return [pscustomobject]@{ Ok = $false; Reason = 'level.dat not found'; From = $null } }
    $bak = Join-Path $WorldPath 'level.dat.optimize.bak'
    Copy-Item -LiteralPath $levelDat -Destination $bak -Force
    try {
        $level = Read-LevelDat -Path $levelDat
        $tag = Get-NbtChild -Compound $level.Root -Name 'serverChunkTickRange'
        $from = if ($tag) { [int]$tag.Value } else { $null }
        if ($tag) {
            if ($tag.Type -ne 3) { throw 'serverChunkTickRange is not an int tag' }
            $tag.Value = [int]$Chunks
        } else {
            [void]$level.Root.Tags.Add([pscustomobject]@{ Type = [byte]3; Name = 'serverChunkTickRange'; Value = [int]$Chunks })
        }
        Write-LevelDat -Path $levelDat -Level $level

        $check = Read-LevelDat -Path $levelDat
        $ct = Get-NbtChild -Compound $check.Root -Name 'serverChunkTickRange'
        if (-not $ct -or [int]$ct.Value -ne [int]$Chunks) { throw 'verification failed' }
        if ($check.Root.Tags.Count -lt $level.Root.Tags.Count) { throw 'verification failed: tags lost' }
        return [pscustomobject]@{ Ok = $true; Reason = ''; From = $from }
    } catch {
        Copy-Item -LiteralPath $bak -Destination $levelDat -Force
        return [pscustomobject]@{ Ok = $false; Reason = $_.Exception.Message; From = $null }
    }
}
