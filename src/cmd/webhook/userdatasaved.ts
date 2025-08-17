import type { UserDataSavedPayload } from "lib/jellyfin/webhook";
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
export async function webhookUserDataSaved(
  payload: UserDataSavedPayload,
  reqid: string,
  api: JellyfinMiniApi,
  scrobbler: AnilistScrobbler,
): Promise<Response> {
  // we are only interested in toggle played events for episodes
  // WARN: when an entire season or show is marked as watched, we receive a notification for each episode
  // XXX: Do we want to handle unscrobble when marked Played=false, if we do see the warning above
  if (
    payload.SaveReason != "TogglePlayed" ||
    !payload.Played ||
    payload.ItemType != "Episode"
  ) {
    const errorMsg = `Event is not for an episode marked as played. SaveReason=${payload.SaveReason} Played=${payload.Played} ItemType=${payload.ItemType}`;
    log(`webhook/userdatasaved: ${errorMsg}`, "info", reqid);
    return new Response(errorMsg, {
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
    log(`webhook/userdatasaved: ${errorMsg}`, "error", reqid);
    return new Response(`${errorMsg}`, {
      status: 404,
      statusText: `Not found`,
    });
  }

  log(
    `webhook/userdatasaved: Detected as "${payload.SeriesName} - ${payload.EpisodeNumber} - ${payload.Name}" ...`,
    "info",
    reqid,
  );

  const result = await scrobbler.scrobble(
    anilistId,
    payload.EpisodeNumber,
    payload.SeasonNumber,
  );

  if (result.success) {
    log(`webhook/userdatasaved: ${result.message}`, "done", reqid);
    return new Response(result.message, {
      status: 200,
      statusText: "OK",
    });
  } else {
    log(`webhook/userdatasaved: ${result.message}`, result.level, reqid);
    return new Response(result.message, {
      status: result.level == "error" ? 500 : 400,
      statusText:
        result.level == "error" ? "Internal Server Error" : "Bad Request",
    });
  }
}
// vim: tabstop=2 shiftwidth=2 softtabstop=0 smarttab expandtab
