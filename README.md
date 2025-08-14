# Anilist Watched

Jellyfin webhook target that will mark shows as watched on anilist.

To install dependencies:

```bash
bun install
```

Copy `bin/jw-anilist-watched` to somewhere in your path.

```bash
# local user
cp bin/jw-anilist-watched ~/.local/bin

# system wide
sudo cp bin/jw-anilist-watched /usr/local/bin
```

# Configuration
## *Anilist Token*
1. visit https://anilist.co/settings/developer
1. click *Create New Client*
1. enter `https://anilist.co/api/v2/oauth/pin` as the *Redirect URL*
1. approve the generated token by visting `https://anilist.co/api/v2/oauth/authorize?client_id={clientID}&response_type=token` (do not forget to replace clientID in the URL!)

```bash
jw-anilist-watched configure --anilist-token MY_VERY_LONG_TOKEN_STRING_HERE
```

## Jellyfin API key
API key is needed to lookup the Anilist ID from the series, the PlaybackStop notification for episodes which we need for scrobbling does not include those.

```bash
jw-anilist-watched configure --jellyfin-api-key MY_API_KEY
```

## Jellyfin webhook
This will only work when the AniList ProviderID is present, this should be the case when anilist is the highest provider set for the library.

1. Install the webhook plugin in Jellyfin
1. Go to the webhook plugin configuration page
1. Click `Add Generic Destination`
1. Set the `Webhook Url` to the URL where **anilist-watched** is listening and use the */* endpoint e.g. `http://localhost:4035/`
1. Only check `Playback Stop` under `Notification Type`
1. Only check your user under `User Filter`
1. Only check `Episodes` under `Item Type`
1. Check `Send All Properties (ignores template)`

# Windows Service Setup and Deployment

For Windows users, this project includes a PowerShell script to automatically set up and deploy the AniList webhook as a Windows service. This provides several advantages:

- **Automatic Startup**: Service starts automatically when Windows boots
- **Background Operation**: Runs continuously in the background
- **Easy Management**: Use standard Windows service management tools
- **Automatic Compilation**: Always runs the latest version of your code
- **Professional Deployment**: Proper logging, error handling, and service configuration

## Prerequisites

Before running the setup script, ensure you have:

1. **Administrator Privileges**: The script must be run as Administrator
2. **Bun Runtime**: For automatic compilation (install from [bun.sh](https://bun.sh))
3. **PowerShell Execution Policy**: Set to allow script execution
4. **Git Repository**: Clone the project to your desired location

## Quick Setup

### 1. **Run as Administrator**
Right-click on PowerShell and select "Run as Administrator"

### 2. **Navigate to Project Directory**
```powershell
cd "D:\Documents\Git\jellyfin-webhook-anilistwatched"
```

### 3. **Execute Setup Script**
```powershell
.\scripts\setup-nssm-service.ps1
```

The script will:
- ✅ Automatically compile your latest code
- ✅ Install NSSM (if not present)
- ✅ Create the Windows service
- ✅ Configure logging and firewall rules
- ✅ Start the service automatically

## Advanced Setup Options

### **Skip Compilation**
If you want to use a pre-compiled binary:
```powershell
.\scripts\setup-nssm-service.ps1 -SkipCompile
```

### **Configure Settings**
To set up configuration during installation:
```powershell
.\scripts\setup-nssm-service.ps1 -Configure
```

### **Custom Service Name**
```powershell
.\scripts\setup-nssm-service.ps1 -ServiceName "MyAniListWebhook"
```

### **Custom Paths**
```powershell
.\scripts\setup-nssm-service.ps1 -AppDirectory "C:\MyCustomPath" -LogDir "C:\MyLogs"
```

## Service Management

### **Check Service Status**
```powershell
sc query AniListWebhook
```

### **Start/Stop Service**
```powershell
# Start the service
nssm start AniListWebhook

# Stop the service
nssm stop AniListWebhook

# Restart the service
nssm restart AniListWebhook
```

### **View Service Logs**
```powershell
# View main service log
Get-Content "C:\ProgramData\AniListWebhook\service.log" -Tail 50

# Follow logs in real-time
Get-Content "C:\ProgramData\AniListWebhook\service.log" -Tail 100 -Wait

# View error log
Get-Content "C:\ProgramData\AniListWebhook\service.err.log" -Tail 20
```

### **Remove Service**
```powershell
nssm remove AniListWebhook confirm
```

## Configuration File

The service uses a TOML configuration file located at:
```
%USERPROFILE%\.config\anilistwatched\config.toml
```

Example configuration:
```toml
[webhook]
bind = "0.0.0.0"
port = 4091

[anilist]
token = "your_anilist_token_here"

[jellyfin]
apiKey = "your_jellyfin_api_key_here"
url = "http://192.168.1.100:8096"
libraryName = "Anime"
```

## Troubleshooting

### **Service Won't Start**
1. Check the error log: `Get-Content "C:\ProgramData\AniListWebhook\service.err.log"`
2. Verify configuration file exists and has correct permissions
3. Ensure AniList token and Jellyfin API key are valid

### **Compilation Errors**
1. Verify Bun is installed: `bun --version`
2. Check for TypeScript errors: `bun run check`
3. Ensure all dependencies are installed: `bun install`

### **Permission Issues**
1. Run PowerShell as Administrator
2. Check firewall settings
3. Verify service account has access to configuration files

### **Webhook Not Receiving Data**
1. Verify Jellyfin webhook configuration
2. Check service is running and listening on correct port
3. Test webhook endpoint manually
4. Review service logs for incoming requests

## Features

### **Automatic Compilation**
- Always runs the latest version of your code
- No manual compilation required
- Automatic error detection during build

### **Smart Service Management**
- Automatic NSSM installation via Chocolatey
- Proper service account configuration
- Environment variable setup for configuration

### **Professional Logging**
- Structured logging to dedicated directories
- Separate stdout and stderr streams
- Easy log monitoring and debugging

### **Security Features**
- Firewall rule configuration
- Service account isolation
- Secure credential handling

## Updating the Service

To update the service with new code:

1. **Pull Latest Changes**
   ```bash
   git pull origin main
   ```

2. **Re-run Setup Script**
   ```powershell
   .\scripts\setup-nssm-service.ps1
   ```

The script will automatically:
- Compile the new code
- Stop the existing service
- Install the updated version
- Restart the service

## System Requirements

- **Windows 10/11** or **Windows Server 2016+**
- **PowerShell 5.1+** (Windows 10+ includes this by default)
- **Administrator privileges** for service installation
- **Bun runtime** for TypeScript compilation
- **Internet access** for NSSM installation (if needed)

## Support

If you encounter issues:

1. Check the service logs first
2. Verify all prerequisites are met
3. Review the troubleshooting section above
4. Check the [GitHub Issues](https://github.com/AtaraxyState/jellyfin-webhook-anilistwatched/issues) page
