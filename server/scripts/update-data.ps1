$ErrorActionPreference = "Stop"
$root = Join-Path $PSScriptRoot "..\..\data\cricsheet"
New-Item -ItemType Directory -Force $root | Out-Null
$sets = "ipl_male", "wpl_female", "sma_male", "t20s_male", "odis_male", "tests_male", "t20s_female", "odis_female", "tests_female"
foreach ($s in $sets) {
  $zip = Join-Path $env:TEMP "$s.zip"
  Write-Host "Downloading $s ..."
  Invoke-WebRequest "https://cricsheet.org/downloads/${s}_json.zip" -OutFile $zip
  Expand-Archive $zip -DestinationPath $root -Force
  Remove-Item $zip
}
Write-Host "Download complete."