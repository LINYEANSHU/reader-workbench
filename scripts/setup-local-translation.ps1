param([string]$Python = 'python', [string]$RuntimeDirectory = (Join-Path $PSScriptRoot '../.reader-runtime/translation'), [switch]$Repair)
$ErrorActionPreference = 'Stop'
$translationArguments = @((Join-Path $PSScriptRoot 'setup-local-translation.py'), '--runtime', $RuntimeDirectory)
if ($Repair) { $translationArguments += '--repair' }
& $Python @translationArguments
exit $LASTEXITCODE
