import { Command } from "@commander-js/extra-typings";
import type { Config } from "lib/config";
import { readConfig, validateConfig } from "lib/config";
import { banner, log } from "lib/logger";
import { JellyfinMiniApi } from "lib/jellyfin/api";
import { AnilistScrobbler } from "cmd/webhook/playbackstop";

async function syncAction(): Promise<void> {
  banner();
  const config: Config = readConfig();
  if (!validateConfig(config, true)) return;

  // Log configured users for debugging/monitoring
  if (config.anilist.users && Object.keys(config.anilist.users).length > 0) {
    const userCount = Object.keys(config.anilist.users).length;
    const userList = Object.keys(config.anilist.users).map(username => {
      const user = config.anilist.users![username];
      return `${username}${user.displayName ? ` (${user.displayName})` : ''}`;
    }).join(', ');
    log(`sync: configured ${userCount} user(s): ${userList}`, "info");
  } else if (config.anilist.token) {
    log("sync: using global AniList token", "info");
  } else {
    log("sync: no AniList tokens configured", "warn");
  }

  const baseUrl = (config.jellyfin.url || "").trim();
  if (!baseUrl) {
    log("sync: jellyfin.url not configured; cannot backfill.", "error");
    return;
  }

  try {
    const api = new JellyfinMiniApi(baseUrl, config.jellyfin.apiKey as string);
    const scrobbler = new AnilistScrobbler(config);
    await scrobbler.init();

    log("sync: backfill is available via AuthenticationSucceeded webhook or future CLI args.", "info");
  } catch (e) {
    log(`sync: failed with ${e}`, "error");
  }
}

export function addSyncCommand(program: Command): void {
  program.command("sync").description("backfill progress from Jellyfin to AniList").action(syncAction);
}

// vim: tabstop=2 shiftwidth=2 softtabstop=0 smarttab expandtab

