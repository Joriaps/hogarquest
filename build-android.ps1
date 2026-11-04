# HogarQuest - build debug APK
# Usage:  powershell -ExecutionPolicy Bypass -File .\build-android.ps1 [-SkipWebBuild] [-SyncUrl https://xxx.onrender.com]
# -SyncUrl deja el servidor de sincronización ya puesto en la app (si no, se escribe en Ajustes).
param([switch]$SkipWebBuild, [string]$SyncUrl = '')
if ($SyncUrl) { $env:VITE_SYNC_URL = $SyncUrl }

# 'Continue' so that warnings printed to stderr by npx/gradle don't abort the script;
# failures are detected through $LASTEXITCODE below.
$ErrorActionPreference = 'Continue'
$root = $PSScriptRoot
Set-Location $root

$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

if (-not $SkipWebBuild) {
    Step 'vite build'
    & npx vite build
    if ($LASTEXITCODE -ne 0) { throw "vite build failed ($LASTEXITCODE)" }
}

Step 'cap sync'
& npx cap sync
if ($LASTEXITCODE -ne 0) { throw "cap sync failed ($LASTEXITCODE)" }

# local.properties is git-ignored / regenerated; make sure it points to the SDK
$lp = Join-Path $root 'android\local.properties'
if (-not (Test-Path $lp)) {
    $sdk = $env:ANDROID_HOME.Replace('\', '\\').Replace(':', '\:')
    [IO.File]::WriteAllText($lp, "sdk.dir=$sdk`n", (New-Object System.Text.UTF8Encoding $false))
}

Step 'gradle assembleDebug'
Push-Location (Join-Path $root 'android')
try {
    # --no-daemon: sin él, el daemon de Gradle mantiene abierta la salida y el script no termina
    & .\gradlew.bat assembleDebug --no-daemon
    if ($LASTEXITCODE -ne 0) { throw "gradle assembleDebug failed ($LASTEXITCODE)" }
} finally { Pop-Location }

$apk = Join-Path $root 'android\app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $apk)) { throw "APK not found: $apk" }
$dest = Join-Path $root 'HogarQuest.apk'
Copy-Item $apk $dest -Force
$mb = [Math]::Round((Get-Item $dest).Length / 1MB, 2)
Write-Host "`nOK -> $dest ($mb MB)" -ForegroundColor Green
