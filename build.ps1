# build.ps1
# Builds the Tasklog distributable zip for Windows x64.
#
# What it does:
#   1. Publishes the .NET backend as a self-contained single-file exe
#   2. Builds the Next.js frontend in standalone mode
#   3. Downloads a portable Node.js binary (cached for reuse)
#   4. Publishes the launcher exe
#   5. Assembles everything into a folder with sample data
#   6. Zips it into Tasklog-win-x64.zip
#
# Prerequisites:
#   - .NET SDK (10.0+)
#   - Node.js and npm (for building the frontend)
#   - Internet connection (first run only, to download portable Node.js)
#
# Usage:
#   .\build.ps1
#   .\build.ps1 -NodeVersion "22.16.0"

param(
    [string]$NodeVersion = "22.16.0",
    [string]$OutputName = "Tasklog-win-x64"
)

$ErrorActionPreference = "Stop"

# --- Paths ---

$RepoRoot = $PSScriptRoot
$BackendDir = "$RepoRoot\backend\Tasklog.Api"
$FrontendDir = "$RepoRoot\frontend"
$LauncherDir = "$RepoRoot\launcher\Tasklog.Launcher"
$DistDir = "$RepoRoot\dist"
$BuildDir = "$RepoRoot\build"
$ReleaseDir = "$RepoRoot\release"
$OutputDir = "$BuildDir\$OutputName"
$ZipPath = "$ReleaseDir\$OutputName.zip"
$NodeCacheDir = "$BuildDir\.node-cache"

# --- Helper functions ---

function Write-Step($message) {
    Write-Host ""
    Write-Host "== $message ==" -ForegroundColor Cyan
    Write-Host ""
}

function Assert-ExitCode($step) {
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAILED: $step" -ForegroundColor Red
        exit 1
    }
}

# --- Clean previous build ---

Write-Step "Cleaning previous build"

if (Test-Path $OutputDir) {
    Remove-Item $OutputDir -Recurse -Force
    Write-Host "Removed $OutputDir"
}
if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
    Write-Host "Removed $ZipPath"
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

# --- Step 1: Publish .NET backend ---

Write-Step "Publishing .NET backend (self-contained, win-x64)"

Push-Location $BackendDir
dotnet publish -p:PublishProfile=win-x64-distributable
Assert-ExitCode "dotnet publish backend"
Pop-Location

# Copy published backend to output.
$backendPublishDir = "$BackendDir\bin\publish\win-x64"
New-Item -ItemType Directory -Path "$OutputDir\backend" -Force | Out-Null
Copy-Item "$backendPublishDir\*" "$OutputDir\backend\" -Recurse
Write-Host "Backend copied to $OutputDir\backend\"

# --- Step 2: Build Next.js frontend ---

Write-Step "Building Next.js frontend (standalone)"

Push-Location $FrontendDir
npm ci
Assert-ExitCode "npm ci"

npm run build
Assert-ExitCode "npm run build"
Pop-Location

# Copy standalone output to the distributable.
# Next.js standalone includes: server.js, package.json, node_modules (minimal)
$standaloneDir = "$FrontendDir\.next\standalone"
New-Item -ItemType Directory -Path "$OutputDir\frontend" -Force | Out-Null
Copy-Item "$standaloneDir\*" "$OutputDir\frontend\" -Recurse

# Static assets and public files need to be copied separately.
# Next.js standalone docs: static files must be at .next/static relative to server.js
$staticSrc = "$FrontendDir\.next\static"
if (Test-Path $staticSrc) {
    New-Item -ItemType Directory -Path "$OutputDir\frontend\.next\static" -Force | Out-Null
    Copy-Item "$staticSrc\*" "$OutputDir\frontend\.next\static\" -Recurse
    Write-Host "Static assets copied"
}

$publicSrc = "$FrontendDir\public"
if (Test-Path $publicSrc) {
    New-Item -ItemType Directory -Path "$OutputDir\frontend\public" -Force | Out-Null
    Copy-Item "$publicSrc\*" "$OutputDir\frontend\public\" -Recurse
    Write-Host "Public assets copied"
}

Write-Host "Frontend copied to $OutputDir\frontend\"

# --- Step 3: Download portable Node.js ---

Write-Step "Preparing portable Node.js $NodeVersion"

$nodeZipName = "node-v$NodeVersion-win-x64.zip"
$nodeUrl = "https://nodejs.org/dist/v$NodeVersion/$nodeZipName"
$nodeCachedZip = "$NodeCacheDir\$nodeZipName"
$nodeExtractDir = "$NodeCacheDir\node-v$NodeVersion-win-x64"

New-Item -ItemType Directory -Path $NodeCacheDir -Force | Out-Null

if (-not (Test-Path $nodeCachedZip)) {
    Write-Host "Downloading from $nodeUrl ..."
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeCachedZip -UseBasicParsing
    Write-Host "Downloaded to $nodeCachedZip"
} else {
    Write-Host "Using cached Node.js at $nodeCachedZip"
}

if (-not (Test-Path $nodeExtractDir)) {
    Write-Host "Extracting..."
    Expand-Archive -Path $nodeCachedZip -DestinationPath $NodeCacheDir -Force
}

# Copy just the node.exe to the output (we only need the runtime, not npm).
New-Item -ItemType Directory -Path "$OutputDir\node" -Force | Out-Null
Copy-Item "$nodeExtractDir\node.exe" "$OutputDir\node\node.exe"
Write-Host "Node.js portable binary copied to $OutputDir\node\"

# --- Step 4: Publish launcher ---

Write-Step "Publishing launcher (self-contained, win-x64)"

Push-Location $LauncherDir
dotnet publish -p:PublishProfile=win-x64-distributable
Assert-ExitCode "dotnet publish launcher"
Pop-Location

# Copy the launcher exe to the root of the output directory.
$launcherPublishDir = "$LauncherDir\bin\publish\win-x64"
Copy-Item "$launcherPublishDir\Tasklog.Launcher.exe" "$OutputDir\Tasklog.exe"
Write-Host "Launcher copied as $OutputDir\Tasklog.exe"

# --- Step 5: Create sample database ---

Write-Step "Creating sample database"

# Copy dev database (preserves schema + EF migrations history), then seed it
# with sample data using a temporary .NET project (no sqlite3 needed).
Copy-Item "$BackendDir\TasklogDatabase.db" "$OutputDir\backend\TasklogDatabase.db" -Force

$seedScript = Resolve-Path "$DistDir\seed-sample-data.sql"
$sampleDb = Resolve-Path "$OutputDir\backend\TasklogDatabase.db"

# Create a temporary .NET console project to run the SQL seed script.
# Uses Microsoft.Data.Sqlite - the same SQLite library the backend depends on.
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "tasklog-seed-$(Get-Random)"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
    $csproj = @"
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.Data.Sqlite" Version="9.0.12" />
  </ItemGroup>
</Project>
"@
    Set-Content -Path "$tempDir\SeedDb.csproj" -Value $csproj

    $program = @'
using Microsoft.Data.Sqlite;

var dbPath = args[0];
var sqlPath = args[1];
var sql = File.ReadAllText(sqlPath);

using var connection = new SqliteConnection("Data Source=" + dbPath);
connection.Open();

using var command = connection.CreateCommand();
command.CommandText = sql;
command.ExecuteNonQuery();

// Print counts to verify.
string[] tables = ["Projects", "Tasks", "Labels", "LabelTaskModel"];
foreach (var table in tables)
{
    using var countCmd = connection.CreateCommand();
    countCmd.CommandText = "SELECT COUNT(*) FROM " + table;
    var count = countCmd.ExecuteScalar();
    Console.WriteLine("  " + table + ": " + count);
}
'@
    Set-Content -Path "$tempDir\Program.cs" -Value $program

    dotnet run --project $tempDir -- "$sampleDb" "$seedScript"
    Assert-ExitCode "seed sample database"

    Write-Host "Sample database created"
}
finally {
    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}

# --- Step 6: Add README ---

Write-Step "Adding README"

$readmeContent = @"
========================================
  Tasklog - Quick Start
========================================

1. Double-click "Tasklog.exe" to start the application.

2. A console window will appear showing:
   - The local URL (http://localhost:3000) for this computer
   - A LAN URL (http://192.168.x.x:3000) for your phone

3. Open the URL in your browser to use Tasklog.

4. To use on your phone: connect to the same Wi-Fi network
   and open the LAN URL shown in the console.

5. Press any key in the console window to stop Tasklog.


TROUBLESHOOTING

- If Windows Firewall asks for permission, click "Allow access"
  so your phone can connect over the local network.

- If the app does not start, make sure you extracted the
  full zip before running (do not run from inside the zip).

- Tasklog stores its data in backend\TasklogDatabase.db.
  Your changes are saved automatically.


ABOUT

Tasklog is a self-hosted task management app.
Built with .NET, Next.js, and SQLite.

Source: https://github.com/hydraInsurgent/Tasklog
"@

Set-Content -Path "$OutputDir\README.txt" -Value $readmeContent -Encoding UTF8
Write-Host "README.txt created"

# --- Step 7: Create zip ---

Write-Step "Creating zip archive"

if (-not (Test-Path $ReleaseDir)) {
    New-Item -ItemType Directory -Path $ReleaseDir | Out-Null
}
Compress-Archive -Path "$OutputDir\*" -DestinationPath $ZipPath -Force
$zipSize = [math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
Write-Host "Created: $ZipPath ($zipSize MB)" -ForegroundColor Green

# --- Done ---

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Build complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Output: $ZipPath"
Write-Host "  Size:   $zipSize MB"
Write-Host ""
Write-Host "  Upload this zip to GitHub Releases."
Write-Host ""
