param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Debug'
)

$solution = Join-Path $PSScriptRoot 'IrukaDark.WinUI.sln'

Write-Host "Restoring packages..."
dotnet restore $solution

Write-Host "Building ($Configuration)..."
dotnet build $solution -c $Configuration

Write-Host "Running tests ($Configuration)..."
dotnet test $solution -c $Configuration -f net8.0-windows10.0.19041.0
