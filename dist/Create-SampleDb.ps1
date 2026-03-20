# Create-SampleDb.ps1
# Creates a pre-populated sample database for the Tasklog distributable package.
#
# How it works:
#   1. Copies the development database (preserving schema and EF migrations history)
#   2. Runs the seed SQL script against the copy using a temporary .NET tool
#      (no external sqlite3 binary needed - uses the same SQLite library as the backend)
#
# Prerequisites:
#   - .NET SDK (same version used to build the backend)
#   - The development database must exist at the expected path
#
# Usage:
#   .\Create-SampleDb.ps1

param(
    [string]$SourceDb = "$PSScriptRoot\..\backend\Tasklog.Api\TasklogDatabase.db",
    [string]$SeedScript = "$PSScriptRoot\seed-sample-data.sql",
    [string]$OutputDir = "$PSScriptRoot\sample",
    [string]$OutputDb = "$PSScriptRoot\sample\TasklogDatabase.db"
)

$ErrorActionPreference = "Stop"

# --- Validate prerequisites ---

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Error ".NET SDK is not installed or not on PATH."
    exit 1
}

$resolvedSourceDb = Resolve-Path $SourceDb -ErrorAction SilentlyContinue
if (-not $resolvedSourceDb) {
    Write-Error "Source database not found at: $SourceDb"
    exit 1
}

$resolvedSeedScript = Resolve-Path $SeedScript -ErrorAction SilentlyContinue
if (-not $resolvedSeedScript) {
    Write-Error "Seed script not found at: $SeedScript"
    exit 1
}

# --- Create output directory ---

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    Write-Host "Created output directory: $OutputDir"
}

# --- Copy database (preserves schema + migrations history) ---

Write-Host "Copying database from: $resolvedSourceDb"
Copy-Item -Path $resolvedSourceDb -Destination $OutputDb -Force
Write-Host "Database copied to: $OutputDb"

# --- Run seed script using .NET ---

# Build a temporary .NET project that executes the SQL seed script.
# This avoids requiring sqlite3 on PATH - it uses the Microsoft.Data.Sqlite
# NuGet package, the same SQLite library the backend already depends on.

$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "tasklog-seed-$(Get-Random)"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
    # Create a minimal .NET console project.
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
    Console.WriteLine(table + ": " + count);
}
'@
    Set-Content -Path "$tempDir\Program.cs" -Value $program

    Write-Host "Running seed script..."
    $resolvedOutputDb = Resolve-Path $OutputDb
    dotnet run --project $tempDir -- "$resolvedOutputDb" "$resolvedSeedScript"

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to run seed script"
        Remove-Item $OutputDb -Force
        exit 1
    }

    Write-Host ""
    Write-Host "Sample database created successfully!"
    Write-Host "  Location: $resolvedOutputDb"
}
finally {
    # Clean up temporary project.
    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}
