<# Opens every addon's official project page in the browser, in order. #>
param([switch]$Quiet)
. "$PSScriptRoot\Common.ps1"

$sources = @(Get-Sources)
Write-Host ""
Write-Host "Opening $($sources.Count) project pages. On each one: click Download, leave the file in your Downloads folder." -ForegroundColor Cyan
Write-Host ""
foreach ($s in $sources) {
    $tag = if ($s.optional) { ' (optional)' } else { '' }
    Write-Host ("  {0}{1}" -f $s.name, $tag)
}
Write-Host ""
[void](Open-SourcePages -OptionalToo)
Write-Host "When the downloads are done, run START-HERE.cmd (or 2-INSTALL-ADDONS.cmd)." -ForegroundColor Cyan
if (-not $Quiet) { Read-Host "Press Enter to close" | Out-Null }
