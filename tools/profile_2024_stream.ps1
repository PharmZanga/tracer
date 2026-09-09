param(
  [string]$WorkbookPath = 'C:\Users\Zanga Musakuzi\Desktop\tracer dashboard\FEBRUARY-DECEMBER 2024.xlsx',
  [string]$OutputPath = '.\tmp\tracer-2024-profile.json'
)

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-SharedStrings($zip) {
  $strings = [System.Collections.Generic.List[string]]::new()
  $entry = $zip.GetEntry('xl/sharedStrings.xml')
  $settings = [System.Xml.XmlReaderSettings]::new()
  $settings.IgnoreWhitespace = $true
  $reader = [System.Xml.XmlReader]::Create($entry.Open(), $settings)
  while ($reader.Read()) {
    if ($reader.NodeType -eq [System.Xml.XmlNodeType]::Element -and $reader.LocalName -eq 'si') {
      $outer = $reader.ReadOuterXml()
      $value = [regex]::Matches($outer, '<t[^>]*>(.*?)</t>') | ForEach-Object { [System.Net.WebUtility]::HtmlDecode($_.Groups[1].Value) }
      $strings.Add(($value -join ''))
    }
  }
  $reader.Dispose()
  return $strings
}

function Get-ColumnIndex([string]$reference) {
  $letters = ([regex]::Match($reference, '^[A-Z]+')).Value
  $result = 0
  foreach ($char in $letters.ToCharArray()) { $result = $result * 26 + ([int][char]$char - [int][char]'A' + 1) }
  return $result - 1
}

function Clean-Text($value) {
  if ($null -eq $value) { return $null }
  $text = ([string]$value -replace '\s+', ' ').Trim()
  return $(if ($text) { $text } else { $null })
}

function Add-Count($map, [string]$key, [int]$value = 1) {
  if (-not $map.ContainsKey($key)) { $map[$key] = 0 }
  $map[$key] += $value
}

$zip = [System.IO.Compression.ZipFile]::OpenRead($WorkbookPath)
$shared = Get-SharedStrings $zip
$sheetEntry = $zip.GetEntry('xl/worksheets/sheet1.xml')
$settings = [System.Xml.XmlReaderSettings]::new()
$settings.IgnoreWhitespace = $true
$reader = [System.Xml.XmlReader]::Create($sheetEntry.Open(), $settings)

$headers = @()
$profile = [ordered]@{
  workbook = [System.IO.Path]::GetFileName($WorkbookPath)
  sharedStrings = $shared.Count
  rows = 0
  columns = @()
  dates = @{}
  provinces = @{}
  districtsByProvince = @{}
  levels = @{}
  missingCoreFields = [ordered]@{ date = 0; province = 0; district = 0; level = 0; facility = 0; item = 0; quantity = 0; amc = 0; mos = 0; availability = 0 }
  invalidAvailability = 0
  invalidMos = 0
  sampleRows = @()
}

while ($reader.Read()) {
  if ($reader.NodeType -ne [System.Xml.XmlNodeType]::Element -or $reader.LocalName -ne 'row') { continue }
  $rowNumber = [int]$reader.GetAttribute('r')
  $rowXml = $reader.ReadOuterXml()
  $rowReader = [System.Xml.XmlReader]::Create([System.IO.StringReader]::new($rowXml), $settings)
  $values = @{}
  while ($rowReader.Read()) {
    if ($rowReader.NodeType -ne [System.Xml.XmlNodeType]::Element -or $rowReader.LocalName -ne 'c') { continue }
    $reference = $rowReader.GetAttribute('r')
    $type = $rowReader.GetAttribute('t')
    $cellXml = $rowReader.ReadOuterXml()
    $match = [regex]::Match($cellXml, '<v>(.*?)</v>')
    if (-not $match.Success) { continue }
    $raw = [System.Net.WebUtility]::HtmlDecode($match.Groups[1].Value)
    $value = if ($type -eq 's') { $shared[[int]$raw] } else { $raw }
    $values[(Get-ColumnIndex $reference)] = $value
  }
  $rowReader.Dispose()

  if ($rowNumber -eq 1) {
    $headers = @(0..18 | ForEach-Object { Clean-Text $values[$_] })
    $profile.columns = $headers
    continue
  }

  $profile.rows++
  $record = @{}
  for ($index = 0; $index -lt $headers.Count; $index++) {
    if ($headers[$index]) { $record[$headers[$index]] = Clean-Text $values[$index] }
  }
  $dateValue = $record['DATE']
  if ($dateValue -match '^\d+(\.\d+)?$') { $dateValue = [DateTime]::FromOADate([double]$dateValue).ToString('yyyy-MM-dd') }
  $province = Clean-Text $record['PROVINCE']
  $district = Clean-Text $record['DISTRICT']
  $level = Clean-Text $record['FACILITY LEVEL']
  $facility = Clean-Text $record['FACILITY NAME']
  $item = Clean-Text $record['DESCRIPTION OF ITEM']

  if ($dateValue) { Add-Count $profile.dates $dateValue } else { $profile.missingCoreFields.date++ }
  if ($province) { Add-Count $profile.provinces $province } else { $profile.missingCoreFields.province++ }
  if ($district) {
    if (-not $profile.districtsByProvince.ContainsKey($province)) { $profile.districtsByProvince[$province] = @{} }
    Add-Count $profile.districtsByProvince[$province] $district
  } else { $profile.missingCoreFields.district++ }
  if ($level) { Add-Count $profile.levels $level } else { $profile.missingCoreFields.level++ }
  if (-not $facility) { $profile.missingCoreFields.facility++ }
  if (-not $item) { $profile.missingCoreFields.item++ }
  foreach ($field in @('QUANTITY','AMC','MOS','AVAILABILITY')) { if (-not $record[$field]) { $profile.missingCoreFields[$field.ToLower()]++ } }
  if ($record['AVAILABILITY'] -and -not ($record['AVAILABILITY'] -match '^\d+(\.\d+)?%?$')) { $profile.invalidAvailability++ }
  if ($record['MOS'] -and -not ($record['MOS'] -match '^-?\d+(\.\d+)?$')) { $profile.invalidMos++ }
  if ($profile.sampleRows.Count -lt 5) { $profile.sampleRows += [ordered]@{ date = $dateValue; province = $province; district = $district; level = $level; facility = $facility; item = $item; quantity = $record['QUANTITY']; amc = $record['AMC']; mos = $record['MOS']; availability = $record['AVAILABILITY'] } }
}

$reader.Dispose(); $zip.Dispose()
$directory = Split-Path -Parent $OutputPath
if ($directory) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
$profile | ConvertTo-Json -Depth 8 | Set-Content -Path $OutputPath -Encoding utf8
Write-Output ("Profile written: {0} rows, {1} reporting dates, {2} provinces" -f $profile.rows, $profile.dates.Count, $profile.provinces.Count)
