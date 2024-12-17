import type { Config } from "lib/config";
import type { PlaybackStopPayload } from "lib/jellyfin/webhook";

import { log } from "lib/logger";

import AniList from "anilist-node";
import type { UpdatedEntry, UpdateEntryOptions } from "anilist-node";
/**
 * Type partial UpdateEntryOptions
 *
 * We cannot use UpdateEntryOptions for updating as not all properties are writable,
 * this is a workaround for the broken type in anilist-node.
 */
type UpdateEntryOptionsPartial = {
  progress?: number;
  status?: "CURRENT" | "COMPLETED";
};

/**
 * Type for storing our Scrobble result
 * @property success - records if the scrobble was successful
 * @property message - message to go along with the scrobble result
 * @property level - the log level to use for the message
 */
export type ScrobbleResult = {
  success: boolean;
  message: string;
  level: "error" | "warn" | "info";
};

export class AnilistScrobbler {
  private api: AniList;
  private config: Config;
  private profileId?: number;

  /**
   * Scrobbler for Anilist
   * @param config - Anilist watched configuration object
   */
  public constructor(config: Config) {
    this.config = config;

    if (this.config.anilist.token == undefined) {
      throw new Error("Missing anilist.token in the configuration.");
    }

    this.api = new AniList(this.config.anilist.token);
  }

  /**
   * Perform some initialization requried
   * @async
   */
  public async init(): Promise<void> {
    const profile = await this.api.user.getAuthorized();
    if (profile.id == undefined) {
      throw new Error("Failed to authenticate to anilist.");
    } else {
      this.profileId = profile.id;
    }
  }

  /**
   * Scrobble playback to Anilist
   * @async
   * @param id - Anilist Anime ID
   * @param episode - Watched episode
   * @param season - Watched season (we only support season 1, specials are not scrobbleable)
   * @return {ScrobbleResult} state information on the success of the scrobbling
   */
  public async scrobble(
    id: number,
    episode: number,
    season: number = 1,
  ): Promise<ScrobbleResult> {
    if (this.api == undefined || this.profileId == undefined)
      return {
        success: false,
        level: "error",
        message: "Not initialized!",
      } as ScrobbleResult;

    if (season != 1)
      return {
        success: false,
        level: "warn",
        message: "Can only scrobble normal episodes (season != 1)!",
      } as ScrobbleResult;

    try {
      let result: UpdatedEntry | undefined;
      for (const list of await this.api.lists.anime(this.profileId)) {
        if (list.name == "Watching") {
          // only increase progress if in Watching list
          for (const entry of list.entries) {
            if (entry.id == undefined) continue;
            if (entry.media.id != id) continue;

            // sanity check before advancing progress
            if (entry.progress >= episode) {
              return {
                success: false,
                level: "warn",
                message: `Skipping update for anime (${id}), anilist progress (${entry.progress}) >= current episode (${episode}).`,
              } as ScrobbleResult;
            } else if (
              entry.media.episodes == undefined ||
              entry.media.episodes < episode
            ) {
              return {
                success: false,
                level: "warn",
                message: `Skipping update for anime (${id}), current progress (${episode}) > max episodes(${entry.media.episodes}).`,
              } as ScrobbleResult;
            }

            // create updated entry (UpdateEntryOptions type is broken)
            const updatedEntry: UpdateEntryOptionsPartial = {
              progress: episode,
            };
            if (updatedEntry.progress == entry.media.episodes) {
              // mark as completed if episode is final episode
              updatedEntry.status = "COMPLETED";
            }

            // apply update
            result = await this.api.lists.updateEntry(
              entry.id,
              updatedEntry as UpdateEntryOptions,
            );
            break;
          }
        } else if (list.name == "Planning") {
          // allow Planning -> Watching if episode 1 is played
          for (const entry of list.entries) {
            if (entry.id == undefined) continue;
            if (entry.media.id != id) continue;

            if (episode != 1)
              return {
                success: false,
                level: "warn",
                message: `Skipping update for anime (${id}), on "Planning" list but this is not the first episode.`,
              } as ScrobbleResult;

            // create updated entry (UpdateEntryOptions type is broken)
            const updatedEntry: UpdateEntryOptionsPartial = {
              progress: episode,
              status: "CURRENT",
            };
            if (updatedEntry.progress == entry.media.episodes) {
              // mark as completed if episode is final episode
              updatedEntry.status = "COMPLETED";
            }

            // apply update
            result = await this.api.lists.updateEntry(
              entry.id,
              updatedEntry as UpdateEntryOptions,
            );
            break;
          }
        }
      }

      if (result === undefined)
        return {
          success: false,
          level: "warn",
          message: `Anime (${id}) not on "Watching" or "Planning" list`,
        } as ScrobbleResult;

      if (result.status == "COMPLETED")
        return {
          success: true,
          level: "info",
          message: `Anime (${id}) marked completed.`,
        } as ScrobbleResult;

      const success = result.status == "CURRENT" || result.progress == episode;
      return {
        success: success,
        level: success ? "info" : "error",
        message: success
          ? `Anime (${id}) is ${result.status} and progess set to ${result.progress}.`
          : `API returned unexpected result: ${JSON.stringify(result)}`,
      } as ScrobbleResult;
    } catch {
      return {
        success: false,
        level: "error",
        message: `Something went wrong while connecting to anilist.`,
      } as ScrobbleResult;
    }
  }

  /**
   * Webhook dispatch handler
   * @async
   * @param payload - request payload body
   * @param reqid - request id
   * @return {Response} response to send to client
   */
  public async webhookPlaybackStop(
    payload: PlaybackStopPayload,
    reqid: string,
  ): Promise<Response> {
    const anilistId: number = payload.Provider_AniList
      ? parseInt(payload.Provider_AniList, 10)
      : 0;

    if (anilistId == 0 || isNaN(anilistId)) {
      const errorMsg = `No or invalid "Provider_AniList" in payload!`;
      log(
        `webhook/playbackstop: ${errorMsg} Provider_AniList=${payload.Provider_AniList}`,
        "error",
        reqid,
      );
      return new Response(`${errorMsg}\nPayload = ${JSON.stringify(payload)}`, {
        status: 404,
        statusText: `Not found`,
      });
    }

    if (!payload.PlayedToCompletion || payload.ItemType != "Episode") {
      log(
        "webhook/playbackstop: Not an epsisode or episode not played to completion",
        "info",
        reqid,
      );
      return new Response(
        `Not an epsisode or episode not played to completion.`,
        {
          status: 200,
          statusText: `OK`,
        },
      );
    }

    const result = await this.scrobble(
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
}

// vim: tabstop=2 shiftwidth=2 softtabstop=0 smarttab expandtab
