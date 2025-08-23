#Requires -RunAsAdministrator

param (
    [Parameter(Mandatory=$true)]
    [string]$InstallPath = "C:\Program Files\AnilistScrobbler",
    [string]$InstanceName = $null
)

# Pre-flight checks
function Test-CommandExists {
    param([string]$Command)

    # First, check using standard Get-Command
    $standardCheck = $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
    if ($standardCheck) {
        return $true
    }

    # Check common Bun installation locations
    $bunLocations = @(
        "$env:USERPROFILE\.bun\bin\bun.exe"
    )

    foreach ($location in $bunLocations) {
        if (Test-Path $location) {
            # Add the directory to PATH for the current session
            $bundDir = Split-Path $location -Parent
            $env:Path += ";$bundDir"
            return $true
        }
    }

    return $false
}

function Test-ChocolateyInstalled {
    return $null -ne (Get-Command choco -ErrorAction SilentlyContinue)
}

function Test-PrerequisiteTools {
    $prerequisites = @("git", "bun", "nssm")

    foreach ($tool in $prerequisites) {
        if (-not (Test-CommandExists $tool)) {
            if (-not (Try-Install $tool )) {
                Write-Error "ERR: Please install $tool."
                exit 1
            }
        }
    }
}

function Try-Install {
    param([string]$Tool)

    switch ($Tool) {
        "bun" {
            Write-Host "Bun not found. Installing Bun..."
            powershell -Command "irm bun.sh/install.ps1 | iex"
            return $true
        }
        "git" {
            if (-not (Test-ChocolateyInstalled)) {
                Write-Error "ERR: Chocolatey is required to install Git. Please install Chocolatey first."
                return $false
            }
            Write-Host "Git not found. Installing via Chocolatey..."
            choco install git -y
        }
        "nssm" {
            if (-not (Test-ChocolateyInstalled)) {
                Write-Error "ERR: Chocolatey is required to install NSSM. Please install Chocolatey first."
                return $false
            }
            Write-Host "NSSM not found. Installing via Chocolatey..."
            choco install nssm -y
        }
        default {
            Write-Error "Unknown tool: $Tool"
            return $false
        }
    }

    # Refresh environment variables after installation
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

    return $true
}

function Show-Usage {
    Write-Host "Usage: $($MyInvocation.MyCommand.Name) -InstallPath <path> [-InstanceName <name>]"
    Write-Host "`nSingle Instance:"
    Write-Host "$($MyInvocation.MyCommand.Name) -InstallPath 'C:\Program Files\AnilistScrobbler'"
    Write-Host "`nMulti Instance:"
    Write-Host "$($MyInvocation.MyCommand.Name) -InstallPath 'C:\Program Files\AnilistScrobbler' -InstanceName myanilistuser"
    exit 1
}

function Invoke-RepositoryCloneOrPull {
    param(
        [string]$InstallTarget,
        [string]$InstallSource
    )

    if (-not (Test-Path $InstallTarget)) {
        Write-Host "Cloning anilist-scrobbler into $InstallTarget ..."
        git clone "https://github.com/$InstallSource.git" $InstallTarget
        if ($LASTEXITCODE -ne 0) {
            Write-Error "ERR: Failed to clone repository."
            exit 2
        }
    }
    else {
        Push-Location $InstallTarget
        $remoteCheck = git remote -v | Select-String $InstallSource
        if (-not $remoteCheck) {
            Write-Error "ERR: $InstallTarget does not contain a clone of $InstallSource!"
            exit 2
        }

        Write-Host "Updating anilist-scrobbler ..."
        git pull
        if ($LASTEXITCODE -ne 0) {
            Write-Error "ERR: Failed to update repository."
            exit 2
        }
        Pop-Location
    }
}

function Build-Binary {
    param([string]$InstallTarget)

    Push-Location $InstallTarget
    try {
        Write-Host "Building binary ..."
        New-Item -Path "etc" -ItemType Directory -Force | Out-Null
        bun install --no-save --production
        if ($LASTEXITCODE -ne 0) {
            Write-Error "ERR: Failed to build the binary."
            exit 2
        }
    }
    finally {
        Pop-Location
    }
}

function Install-NssmService {
    param(
        [string]$InstallTarget,
        [string]$InstanceName = $null
    )

    $serviceName = if ($InstanceName) { "AnilistScrobbler-$InstanceName" } else { "AnilistScrobbler" }
    $configFile = if ($InstanceName) { "$InstallTarget\etc\config-$InstanceName.toml" } else { "$InstallTarget\etc\config.toml" }

    # Check if service already exists
    $existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($existingService) {
        Write-Warning "Service $serviceName already exists. Skipping installation."
    } else {
        $binaryPath = "$InstallTarget\bin\anilist-scrobbler"
        nssm install $serviceName $binaryPath
        nssm set $serviceName AppEnvironmentExtra "ANILISTWATCHED_CONFIG=$configFile"
        nssm set $serviceName AppDirectory $InstallTarget
        Write-Host "Service $serviceName installed successfully."
    }

    # Configuration guidance
    if (-not (Test-Path $configFile)) {
        Write-Host "Please complete the configuration before starting the service:"
        Write-Host "  `$env:ANILISTWATCHED_CONFIG = '$configFile'"
        Write-Host "  &'$binaryPath' configure --anilist-token MY_VERY_LONG_TOKEN_STRING_HERE"
        Write-Host "  &'$binaryPath' configure --jellyfin-api-key MY_API_KEY"
        Write-Host "  nssm start $serviceName"
    }
}

# Main script execution
Test-PrerequisiteTools
if ($PSBoundParameters.Count -lt 1) {
    Show-Usage
}

$InstallSource = "sjorge/jellyfin-webhook-anilist-scrobbler"
$InstallPath = if ([System.IO.Path]::IsPathRooted($InstallPath)) {
    $InstallPath
} else {
    [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $InstallPath))
}

Invoke-RepositoryCloneOrPull -InstallTarget $InstallPath -InstallSource $InstallSource
Build-Binary -InstallTarget $InstallPath
if ($InstanceName) {
    Install-NssmService -InstallTarget $InstallPath -InstanceName $InstanceName
}
else {
    Install-NssmService -InstallTarget $InstallPath
}
