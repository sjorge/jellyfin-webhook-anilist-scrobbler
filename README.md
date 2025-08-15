# Jellyfin Webhook AniList Watched

A Jellyfin webhook service that automatically updates your AniList anime progress when you watch episodes or manually mark them as watched/unwatched.

## ✨ Features

- **Automatic Progress Updates**: Updates AniList when episodes are played to completion
- **Manual Mark Support**: Handles when you manually mark episodes as watched/unwatched
- **Multi-User Support**: Configure separate AniList tokens for different Jellyfin users
- **Auto-Add Anime**: Automatically adds anime to your "Watching" list if not already present
- **Smart Episode Detection**: Intelligently determines episode play state with fallback mechanisms
- **Robust Error Handling**: Retry logic and fallback methods for reliable operation
- **Windows Service**: Easy installation and management as a Windows service

## 🚀 Quick Start

### Prerequisites

- **Jellyfin Server** with webhooks enabled
- **AniList Account** with API token
- **Windows** (for the provided service setup)
- **Bun** runtime (for compilation)

### 1. Get Your AniList Token

1. Go to [AniList](https://anilist.co/settings/developer)
2. Create a new client
3. Copy your access token

### 2. Configure Jellyfin Webhooks

1. In Jellyfin Admin Dashboard, go to **Advanced** → **Webhooks**
2. Add a new webhook with URL: `http://your-server:4091`
3. Select these notification types:
   - `PlaybackStop` (for automatic progress updates)
   - `UserDataSaved` (for manual mark handling)

### 3. Setup the Service

1. **Clone the repository:**
   ```bash
   git clone https://github.com/AtaraxyState/jellyfin-webhook-anilistwatched.git
   cd jellyfin-webhook-anilistwatched
   ```

2. **Run the setup script as Administrator:**
   ```powershell
   # Run PowerShell as Administrator
   .\scripts\setup-nssm-service.ps1
   ```

   The script will:
   - Compile the TypeScript code
   - Install the Windows service
   - Configure it to start automatically
   - Start the service

3. **Configure the service:**
   ```powershell
   # Edit configuration (optional)
   notepad C:\Users\%USERNAME%\.config\anilistwatched\config.toml
   ```

## ⚙️ Configuration

### Basic Configuration

Create or edit `C:\Users\%USERNAME%\.config\anilistwatched\config.toml`:

```toml
[webhook]
bind = "0.0.0.0"
port = 4091

[anilist]
# Option A: Multi-user tokens (recommended)
users = {
  "Nilaun" = { token = "your-anilist-token-here", displayName = "Nilaun" }
  "Rain" = { token = "your-anilist-token-here", displayName = "Rain" }
}

# Option B: Global token only (legacy)
# token = "your-anilist-token-here"

[jellyfin]
apiKey = "your-jellyfin-api-key"
url = "http://your-jellyfin-server:8096"
libraryName = "Anime"
```

### Multi-User Configuration

**Recommended approach** - Use Jellyfin usernames as keys:

```toml
[anilist]
users = {
  "JellyfinUsername1" = { 
    token = "anilist-token-1", 
    displayName = "Optional Display Name" 
  }
  "JellyfinUsername2" = { 
    token = "anilist-token-2", 
    displayName = "Another User" 
  }
}
```

**Benefits:**
- Each user has their own AniList account
- Webhooks automatically route to the correct user
- No need to manage GUIDs or user IDs

### Jellyfin API Key

1. In Jellyfin Admin Dashboard, go to **Advanced** → **API Keys**
2. Create a new API key
3. Add it to your `config.toml`

## 🔧 Service Management

### Using PowerShell Scripts

The setup script provides these functions:

```powershell
# Install/Update service
.\scripts\setup-nssm-service.ps1

# Install without compilation (if already compiled)
.\scripts\setup-nssm-service.ps1 -SkipCompile

# Manual service management
Start-Service AniListWebhook
Stop-Service AniListWebhook
Restart-Service AniListWebhook
Remove-Service AniListWebhook
```

### Manual Service Management

```powershell
# Start the service
Start-Service AniListWebhook

# Stop the service
Stop-Service AniListWebhook

# Check service status
Get-Service AniListWebhook

# View logs
Get-Content C:\Users\%USERNAME%\.config\anilistwatched\service.log -Tail 50
Get-Content C:\Users\%USERNAME%\.config\anilistwatched\service.err.log -Tail 50
```

## 📊 How It Works

### 1. PlaybackStop Webhook
- **Trigger**: Episode played to completion
- **Action**: Updates AniList progress
- **Auto-Add**: If anime not in any list, adds to "Watching"

### 2. UserDataSaved Webhook
- **Trigger**: Manual mark as watched/unwatched
- **Smart Detection**: Queries Jellyfin API to determine actual state
- **Fallback**: Uses series-level query if direct episode query fails
- **Actions**: 
  - Watched → Update AniList progress
  - Unwatched → Reset progress to 0

### 3. Multi-User Routing
- Webhook receives `NotificationUsername` from Jellyfin
- Looks up user-specific AniList token
- Creates user-specific API instance
- Updates correct AniList account

## 🛠️ Development

### Building from Source

```bash
# Install dependencies
bun install

# Type check
bun run check

# Compile to executable
bun run compile

# Run in development
bun run dev
```

### Project Structure

```
src/
├── cmd/
│   ├── webhook.ts          # Main webhook server
│   ├── webhook/
│   │   ├── playbackstop.ts # PlaybackStop handler + UserDataSaved
│   │   └── sync.ts         # Sync command
│   └── configure.ts        # Configuration utility
├── lib/
│   ├── config.ts           # Configuration management
│   ├── logger.ts           # Logging utilities
│   └── jellyfin/
│       ├── api.ts          # Jellyfin API client
│       └── webhook.ts      # Webhook type definitions
scripts/
└── setup-nssm-service.ps1  # Windows service setup
```

## 🔍 Troubleshooting

### Common Issues

**Service won't start:**
- Check `service.err.log` for configuration errors
- Ensure AniList tokens are valid
- Verify Jellyfin API key and URL

**Webhooks not working:**
- Check if service is running: `Get-Service AniListWebhook`
- Verify webhook URL in Jellyfin settings
- Check firewall settings for port 4091

**Episode state detection issues:**
- Check `service.log` for retry attempts
- Verify user has proper Jellyfin permissions
- Check if AniList tokens are correctly configured

### Logs

- **Service Log**: `C:\Users\%USERNAME%\.config\anilistwatched\service.log`
- **Error Log**: `C:\Users\%USERNAME%\.config\anilistwatched\service.err.log`

### Debug Information

The service logs:
- Configured users at startup
- Webhook processing details
- API retry attempts and fallbacks
- AniList update results

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Original project by [sjorge](https://github.com/sjorge/jellyfin-webhook-anilistwatched)
- Enhanced with multi-user support and improved reliability
- Built with TypeScript and Bun for modern development experience

## 📞 Support

If you encounter issues:

1. Check the logs first
2. Review this README and configuration
3. Open an issue on GitHub with:
   - Error messages from logs
   - Your configuration (without tokens)
   - Steps to reproduce

---

**Happy Anime Tracking! 🎌**
