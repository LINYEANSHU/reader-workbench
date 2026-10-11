[CmdletBinding()]
param(
    [ValidateRange(1, 65535)] [int] $Port = 4317,
    [string] $ConfigDir,
    [switch] $NoOpen,
    [switch] $Demo
)

$ErrorActionPreference = 'Stop'
$readerRoot = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ConfigDir)) {
    $ConfigDir = Join-Path $readerRoot '.reader-runtime/user-config'
}
$readerCli = Join-Path $readerRoot 'bin/reader-workbench.mjs'
$readerBuild = Join-Path $readerRoot 'dist/cli.mjs'
if (-not (Test-Path -LiteralPath $readerBuild)) {
    throw 'Build missing. Run npm ci and npm run build in the Reader Workbench directory first.'
}
$readerNode = (Get-Command node -ErrorAction Stop).Source
$readerPreviousOffice = $env:READER_LIBREOFFICE
$readerPreviousSpeech = $env:READER_SPEECH_ASSET_DIR
$readerPreviousTemp = $env:TEMP
$readerPreviousTmp = $env:TMP
$readerOffice = Join-Path $readerRoot '.reader-runtime/LibreOffice/program/soffice.com'
$readerSpeech = Join-Path $readerRoot '.reader-runtime/sensevoice-small-int8'
try {
    $readerTemporaryDirectory = Join-Path $readerRoot '.reader-runtime/tmp'
    New-Item -ItemType Directory -Path $readerTemporaryDirectory -Force | Out-Null
    $env:TEMP = $readerTemporaryDirectory
    $env:TMP = $readerTemporaryDirectory
    if (-not $env:READER_LIBREOFFICE -and (Test-Path -LiteralPath $readerOffice)) {
        $env:READER_LIBREOFFICE = $readerOffice
    }
    if (-not $env:READER_SPEECH_ASSET_DIR -and (Test-Path -LiteralPath (Join-Path $readerSpeech 'model.int8.onnx')) -and (Test-Path -LiteralPath (Join-Path $readerSpeech 'tokens.txt'))) {
        $env:READER_SPEECH_ASSET_DIR = $readerSpeech
    }
    $readerArguments = @($readerCli, 'web', '--port', [string] $Port, '--config-dir', $ConfigDir)
    if ($NoOpen) { $readerArguments += '--no-open' }
    if ($Demo) { $readerArguments += '--demo' }
    & $readerNode @readerArguments
}
finally {
    $env:READER_LIBREOFFICE = $readerPreviousOffice
    $env:READER_SPEECH_ASSET_DIR = $readerPreviousSpeech
    $env:TEMP = $readerPreviousTemp
    $env:TMP = $readerPreviousTmp
}
