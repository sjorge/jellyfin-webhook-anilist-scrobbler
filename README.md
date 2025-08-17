# Jellyfin AniList Scrobbler Webhook

A simple Jellyfin webhook that scrobbles your anime watching progress to AniList.

## 🚀 Quick Start

### Requirements
- A Jellyfin server
  - [Webhook plugin](https://jellyfin.org/docs/general/server/notifications/) installed
  - [AniList plugin](https://github.com/jellyfin/jellyfin-plugin-anilist) installed and must have an AniList account available
- AniList account(s)
- [Bun runtime](https://bun.sh/) (for building only; the binary can be moved to a different system)
- Git (for building only, to clone the repository)

### 1. Building the Scrobbler Webhook

#### Linux

Clone the source and compile the `anilist-scrobbler` binary.

```bash
git clone https://github.com/sjorge/jellyfin-webhook-anilist-scrobbler.git
cd jellyfin-webhook-anilist-scrobbler
bun install --no-save --production
```

You can store all files in /opt/anilistscrobbler for a tidy and self-contained setup, or you can copy bin/anilist-scrobbler to your system PATH.

```bash
# Self-contained
mkdir -p /opt/anilistscrobbler/{bin,etc}
cp bin/anilist-scrobbler /opt/anilistscrobbler/bin

# System-wide
sudo cp bin/anilist-scrobbler /usr/local/bin
```

Set up the systemd service.

📝 For multiple users, use the multi-instance option.

⚠️ Update the **ANILISTWATCHED_CONFIG** env var and uncomment the "require" line if `/opt/anilistscrobbler` is a separate mount.

🛑 Ensure there is a configuration file before starting the instance(s) to avoid failures.

```bash
## Single Instance
cp docs/systemd/single-instance.service /usr/lib/systemd/system/anilist-scrobbler.service
systemctl daemon-reload
systemctl enable --now anilist-scrobbler.service

## Multi Instance
cp docs/systemd/multi-instance@.service /usr/lib/systemd/system/anilist-scrobbler@.service
systemctl daemon-reload
systemctl enable --now anilist-scrobbler@user1.service
systemctl enable --now anilist-scrobbler@user2.service
```

### 2. Generating AniList API Token

📝 For multiple users, do this for each AniList account.

1. Go to [AniList](https://anilist.co/settings/developer) developer settings.
1. Create a new client.
1. Enter `https://anilist.co/api/v2/oauth/pin` as the *Redirect URL*.
1. Approve the generated token by visiting `https://anilist.co/api/v2/oauth/authorize?client_id={clientID}&response_type=token` (make sure to replace `clientID` in the URL!).
1. Copy your access token for later use.

### 3. Generating Webhook Configuration

A Jellyfin API key is needed to look up the AniList ID from the series, as the PlaybackStop notification for episodes does not include them.

⚠️ Use the same path as configured in the service for the **ANILISTWATCHED_CONFIG** env var.

📝 For multiple users, create separate configuration files named `config-<instance>.toml`, e.g., `config-user1.toml`. Use the same Jellyfin API key, but each config should have its own AniList token.

1. Set the environment variable and configure the Jellyfin API key and AniList token:

```bash
export ANILISTWATCHED_CONFIG=/opt/anilistscrobbler/etc/config.toml
anilist-scrobbler configure --jellyfin-api-key MY_API_KEY
anilist-scrobbler configure --anilist-token MY_VERY_LONG_TOKEN_STRING_HERE
```

2. If using multiple instances, make sure they have a unique port. The default port is *4091*, so you can, for example, increase it by 1 for each new user:

```bash
anilist-scrobbler configure --webhook-port 4092
```

### 4. Configure Webhook in Jellyfin

📝 For multiple users, set up separate webhooks with different `User Filter` and port in the `Webhook URL`.

1. Go to the Jellyfin dashboard.
1. Navigate to Plugins -> Catalog, and install the Webhook plugin.
1. Go to the webhook plugin configuration page.
1. Click `Add Generic Destination`.
1. Set the `Webhook URL` to the URL where this webhook is listening, using the `/` endpoint, e.g., `http://localhost:4091/`.
1. Only check `Playback Stop` under `Notification Type`.
1. Optionally also check `User Data Saved` under `Notification Type` to scrobble manually marked as watched episodes.
1. Only check your user under `User Filter`.
1. Only check `Episodes` under `Item Type`.
1. Check `Send All Properties (ignores template)`.

## 🛠️ Development

To install dependencies, run:
```bash
bun install --no-save
```

Here are some extra commands to help with development:

Type checking:
```bash
bun run check
```

Linting:
```bash
bun run lint
```

Prettifier:
```bash
bun run pretty:write
```

To compile a new binary, use:
```bash
bun run compile
```

To run in development mode without compiling a binary every time, execute:
```bash
export ANILISTWATCHED_CONFIG=/opt/anilistscrobbler/etc/config.toml
bun run start -- webhook
```
