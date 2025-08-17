import type { PlaybackStopPayload } from "lib/jellyfin/webhook";
import type { JellyfinMiniApi } from "lib/jellyfin/api";
import type { AnilistScrobbler } from "lib/scrobbler";

import { log } from "lib/logger";

/**
 * Webhook dispatch handler
 * @async
 * @param payload - request payload body
 * @param reqid - request id
 * @param api - jellyfin api instance
 * @param scrobbler - anilist scrobbler instance
 * @return {Response} response to send to client
 */
export async function webhookPlaybackStop(
  payload: PlaybackStopPayload,
  reqid: string,
  api: JellyfinMiniApi,
  scrobbler: AnilistScrobbler,
): Promise<Response> {
  if (!payload.PlayedToCompletion || payload.ItemType != "Episode") {
    log(
      "webhook/playbackstop: Not played to completion or not an episode.",
      "info",
      reqid,
    );
    return new Response("Not played to completion or not an episode.", {
      status: 200,
      statusText: `OK`,
    });
  }

  const anilistIdString = await api.getProviderFromSeries(
    payload.SeriesId,
    "anilist",
  );

  const anilistId: number = anilistIdString ? parseInt(anilistIdString, 10) : 0;

  if (anilistId == 0 || isNaN(anilistId)) {
    const errorMsg = `No or invalid "Provider_AniList" in payload! Provider_AniList=${payload.Provider_anilist}`;
    log(`webhook/playbackstop: ${errorMsg}`, "error", reqid);
    return new Response(`${errorMsg}`, {
      status: 404,
      statusText: `Not found`,
    });
  }

  log(
    `webhook/playbackstop: Detected as "${payload.SeriesName} - ${payload.EpisodeNumber} - ${payload.Name}" ...`,
    "info",
    reqid,
  );

  const result = await scrobbler.scrobble(
    anilistId,
    payload.EpisodeNumber,
    payload.SeasonNumber,
  );

  if (result.success) {
    log(`webhook/playbackstop: ${result.message}`, "done", reqid);
    return new Response(result.message, {
      status: 200,
      statusText: "OK",
    });
  } else {
    log(`webhook/playbackstop: ${result.message}`, result.level, reqid);
    return new Response(result.message, {
      status: result.level == "error" ? 500 : 400,
      statusText:
        result.level == "error" ? "Internal Server Error" : "Bad Request",
    });
  }
}

// vim: tabstop=2 shiftwidth=2 softtabstop=0 smarttab expandtab
