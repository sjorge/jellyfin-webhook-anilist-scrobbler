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
## *anilist token*
1. visit https://anilist.co/settings/developer
1. click *Create New Client*
1. enter `https://anilist.co/api/v2/oauth/pin` as the *Redirect URL*
1. approve the generated token by visting `https://anilist.co/api/v2/oauth/authorize?client_id={clientID}&response_type=token` (do not forget to replace clientID in the URL!)

```bash
akiba configure --anilist-token MY_VERY_LONG_TOKEN_STRING_HERE
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
