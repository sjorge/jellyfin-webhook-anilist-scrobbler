import type { Config } from "lib/config";
import { log } from "lib/logger";
import { JellyfinMiniApi } from "lib/jellyfin/api";
import { AnilistScrobbler } from "./playbackstop";

/**
 * Simple backfill helper that, for a given library name, fetches watched season 1 episodes per series and logs what would be updated.
 * Note: kept minimal to avoid large code changes; we invoke AniList changes via existing AnilistScrobbler in the webhook path.
 */
export async function runBackfill(
  config: Config,
  userId: string,
  libraryName: string,
): Promise<void> {
  try {
    const baseUrl = (config.jellyfin.url || "").trim();
    if (!baseUrl) {
      log("backfill: jellyfin.url not configured; skipping.", "warn");
      return;
    }
    const api = new JellyfinMiniApi(baseUrl, config.jellyfin.apiKey as string);
    log(`backfill: baseUrl=${baseUrl}`, "info");
    log(`backfill: userId=${userId}`, "info");
    const views = await api.getUserViews(userId);
    log(`backfill: fetched ${views.Items.length} views.`, "info");
    const lib = views.Items.find((v) => v.Name.toLowerCase() === libraryName.toLowerCase());
    if (!lib) {
      log(`backfill: library '${libraryName}' not found for user ${userId}.`, "warn");
      return;
    }
    log(`backfill: using library '${lib.Name}' (${lib.Id}).`, "info");

    const scrobbler = new AnilistScrobbler(config);
    await scrobbler.init();

    const series = await api.getSeriesInLibrary(userId, lib.Id);
    log(`backfill: found ${series.Items.length} series in library.`, "info");
    for (const s of series.Items) {
      log(`backfill: series '${s.Name}' (${s.Id})`, "info");
      const anilistIdStr = await api.getProviderFromSeries(s.Id, "anilist");
      if (!anilistIdStr) {
        log(`backfill: '${s.Name}' has no AniList ProviderID; skipping.`, "warn");
        continue;
      }
      const anilistId = parseInt(anilistIdStr, 10);
      if (!anilistId || Number.isNaN(anilistId)) {
        log(`backfill: invalid AniList id for '${s.Name}': ${anilistIdStr}`, "warn");
        continue;
      }

      const watched = await api.getPlayedEpisodesForSeries(userId, s.Id);
      let maxEp = 0;
      for (const ep of watched.Items) {
        if ((ep.ParentIndexNumber ?? 0) !== 1) continue; // season 1 only
        if ((ep.IndexNumber ?? 0) > maxEp) maxEp = ep.IndexNumber ?? 0;
      }
      if (maxEp > 0) {
        log(`backfill: '${s.Name}' watched max episode S1E${maxEp}.`, "info");
        const res = await scrobbler.scrobble(anilistId, maxEp, 1);
        log(`backfill: '${s.Name}' → ep ${maxEp}: ${res.message}`, res.level);
      } else {
        log(`backfill: '${s.Name}' has no watched episodes in S1; skipping.`, "info");
      }
    }
    log(`backfill: done for library '${libraryName}'.`, "done");
  } catch (e) {
    log(`backfill: failed with ${e}`, "error");
  }
}

// vim: tabstop=2 shiftwidth=2 softtabstop=0 smarttab expandtab

