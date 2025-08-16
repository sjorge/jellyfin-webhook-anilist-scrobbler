import type { Config } from "lib/config";
import type { PlaybackStopPayload } from "lib/jellyfin/webhook";

import { log } from "lib/logger";

import AniList from "anilist-node";
import type { UpdatedEntry, UpdateEntryOptions } from "anilist-node";
import { JellyfinMiniApi } from "lib/jellyfin/api";

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
  private jellyfin: {
    [url: string]: JellyfinMiniApi;
  } = {};

  /**
   * Scrobbler for Anilist
   * @param config - Anilist watched configuration object
   */
  public constructor(config: Config) {
    this.config = config;

    if (this.config.anilist.token == undefined) {
      throw new Error("Missing anilist.token in the configuration.");
    }

    if (this.config.jellyfin.apiKey == undefined) {
      throw new Error("Missing jellyfin.apiKey in the configuration.");
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
   * Creates an updated entry object for Anilist anime list tracking.
   * @param {number} episode - The current episode number being watched.
   * @param {number} [maxEpisodes] - Optional total number of episodes in the anime.
   * @returns {UpdateEntryOptions} An object with updated entry details.
   */
  private createUpdatedEntry(
    episode: number,
    maxEpisodes?: number,
  ): UpdateEntryOptions {
    const updatedEntry: Partial<UpdateEntryOptions> = {
      status: "CURRENT",
      progress: episode,
    };

    if (maxEpisodes && episode === maxEpisodes) {
      updatedEntry.status = "COMPLETED";
    }

    return updatedEntry as UpdateEntryOptions;
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
            const updatedEntry = this.createUpdatedEntry(
              episode,
              entry.media.episodes,
            );

            // apply update
            result = await this.api.lists.updateEntry(entry.id, updatedEntry);
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
            const updatedEntry = this.createUpdatedEntry(
              episode,
              entry.media.episodes,
            );

            // apply update
            result = await this.api.lists.updateEntry(entry.id, updatedEntry);
            break;
          }
        }
      }

      if (result === undefined) {
        if (this.config.anilist.autoAdd) {
          try {
            // XXX: potential issue with 1 episode shows!
            const updatedEntry = this.createUpdatedEntry(episode);
            result = await this.api.lists.addEntry(id, updatedEntry);
          } catch (error) {
            return {
              success: false,
              level: "error",
              message: `Anime (${id}) could not be added to list: ${error instanceof Error ? error.message : "Unknown error"}`,
            };
          }
        } else {
          return {
            success: false,
            level: "warn",
            message: `Anime (${id}) not on "Watching" or "Planning" list`,
          } as ScrobbleResult;
        }
      }

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
    } catch (error) {
      return {
        success: false,
        level: "error",
        message: `Something went wrong while connecting to anilist: ${error instanceof Error ? error.message : "Unknown error"}`,
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

    // initialize jellyfin API if required
    if (this.jellyfin[payload.ServerUrl] === undefined) {
      this.jellyfin[payload.ServerUrl] = new JellyfinMiniApi(
        payload.ServerUrl,
        this.config.jellyfin.apiKey as string,
      );
    }

    const anilistIdString = await this.jellyfin[
      payload.ServerUrl
    ].getProviderFromSeries(payload.SeriesId, "anilist");

    const anilistId: number = anilistIdString
      ? parseInt(anilistIdString, 10)
      : 0;

    if (anilistId == 0 || isNaN(anilistId)) {
      const errorMsg = `No or invalid "Provider_AniList" in payload!`;
      log(
        `webhook/playbackstop: ${errorMsg} Provider_AniList=${payload.Provider_anilist}`,
        "error",
        reqid,
      );
      return new Response(`${errorMsg}\nPayload = ${JSON.stringify(payload)}`, {
        status: 404,
        statusText: `Not found`,
      });
    }

    log(
      `webhook/playbackstop: Detected as "${payload.SeriesName} - ${payload.EpisodeNumber} - ${payload.Name}" ...`,
      "info",
      reqid,
    );

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
