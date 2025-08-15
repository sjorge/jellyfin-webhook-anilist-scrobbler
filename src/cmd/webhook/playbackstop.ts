import type { Config } from "lib/config";
import type { PlaybackStopPayload, UserDataSavedPayload } from "lib/jellyfin/webhook";

import { log } from "lib/logger";

import AniList from "anilist-node";
import type { UpdatedEntry, UpdateEntryOptions } from "anilist-node";
import { JellyfinMiniApi } from "lib/jellyfin/api";
// sync helpers are not required in this file
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
 * Type for adding new entries to lists
 */
type AddEntryOptions = {
  status?: "CURRENT" | "COMPLETED" | "PLANNING" | "DROPPED" | "PAUSED" | "REPEATING";
  progress?: number;
  score?: number;
  progressVolumes?: number;
  repeat?: number;
  priority?: number;
  private?: boolean;
  hiddenFromStatusLists?: boolean;
  notes?: string;
  startedAt?: { year: number; month: number; day: number };
  completedAt?: { year: number; month: number; day: number };
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
  private jellyfin: {
    [url: string]: JellyfinMiniApi;
  } = {};

  /**
   * Scrobbler for Anilist
   * @param config - Anilist watched configuration object
   */
  public constructor(config: Config) {
    this.config = config;

    // Check if we have either a global token or per-user tokens
    const hasGlobalToken = this.config.anilist.token !== undefined;
    const hasUserTokens = this.config.anilist.users !== undefined && Object.keys(this.config.anilist.users).length > 0;
    
    if (!hasGlobalToken && !hasUserTokens) {
      throw new Error("Missing AniList token configuration! Either provide a global token or per-user tokens.");
    }

    if (this.config.jellyfin.apiKey == undefined) {
      throw new Error("Missing jellyfin.apiKey in the configuration.");
    }

    // Initialize with a default API instance (will be replaced with user-specific ones)
    // Use the first available token for initialization
    const defaultToken = this.config.anilist.token || 
      (this.config.anilist.users && Object.values(this.config.anilist.users)[0]?.token);
    
    if (!defaultToken) {
      throw new Error("No valid AniList token found in configuration.");
    }

    this.api = new AniList(defaultToken);
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
   * Get the AniList token for a specific username
   * @param username - The Jellyfin username
   * @return {string | undefined} The AniList token for the user, or undefined if none found
   */
  private getUserAniListToken(username: string): string | undefined {
    // First try to get user-specific token
    if (this.config.anilist.users && this.config.anilist.users[username]) {
      return this.config.anilist.users[username].token;
    }
    
    // Fall back to global token
    return this.config.anilist.token;
  }

  /**
   * Set a custom AniList API instance (for user-specific tokens)
   * @param api - The AniList API instance to use
   */
  public setApi(api: AniList): void {
    this.api = api;
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
      let animeFound = false;

      // First, check if anime exists in any list
      for (const list of await this.api.lists.anime(this.profileId)) {
        for (const entry of list.entries) {
          if (entry.media.id == id) {
            animeFound = true;
            break;
          }
        }
        if (animeFound) break;
      }

      // If anime is not found in any list, add it to "Watching" list
      if (!animeFound) {
        log(`Anime (${id}) not found in any list. Adding to "Watching" list...`, "info");
        
        try {
          const addEntryOptions: AddEntryOptions = {
            status: "CURRENT" as const,
            progress: episode,
          };
          
          result = await this.api.lists.addEntry(id, addEntryOptions as UpdateEntryOptions);
          animeFound = true;
          
          log(`Anime (${id}) successfully added to "Watching" list with progress ${episode}`, "info");
        } catch (addError) {
          return {
            success: false,
            level: "error",
            message: `Failed to add anime (${id}) to list: ${addError}`,
          } as ScrobbleResult;
        }
      }

      // Now proceed with the existing logic for updating progress
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

    // Get the username from the payload for user-specific token lookup
    const username = payload.NotificationUsername;
    if (!username) {
      const errorMsg = `No NotificationUsername in payload!`;
      log(
        `webhook/playbackstop: ${errorMsg}`,
        "error",
        reqid,
      );
      return new Response(`${errorMsg}\nPayload = ${JSON.stringify(payload)}`, {
        status: 400,
        statusText: `Bad Request`,
      });
    }

    // Check if user has a specific AniList token configured
    const userToken = this.getUserAniListToken(username);
    if (!userToken) {
      const errorMsg = `No AniList token configured for user: ${username}`;
      log(
        `webhook/playbackstop: ${errorMsg}`,
        "error",
        reqid,
      );
      return new Response(`${errorMsg}\nPayload = ${JSON.stringify(payload)}`, {
        status: 400,
        statusText: `Bad Request`,
      });
    }

    // initialize jellyfin API if required
    let rawServerUrl = (payload.ServerUrl || "").trim();
    if (!rawServerUrl && this.config.jellyfin.url) {
      rawServerUrl = this.config.jellyfin.url;
      log(
        `webhook/playbackstop: Using configured jellyfin.url '${rawServerUrl}' as fallback`,
        "info",
        reqid,
      );
    }

    const normalizedServerUrl = /^https?:\/\//i.test(rawServerUrl)
      ? rawServerUrl
      : `http://${rawServerUrl}`;

    if (rawServerUrl !== normalizedServerUrl) {
      log(
        `webhook/playbackstop: Normalized ServerUrl '${rawServerUrl}' -> '${normalizedServerUrl}'`,
        "info",
        reqid,
      );
    }

    if (this.jellyfin[normalizedServerUrl] === undefined) {
      this.jellyfin[normalizedServerUrl] = new JellyfinMiniApi(
        normalizedServerUrl,
        this.config.jellyfin.apiKey as string,
      );
    }

    const anilistIdString = await this.jellyfin[
      normalizedServerUrl
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
      `webhook/playbackstop: Detected as "${payload.SeriesName} - ${payload.EpisodeNumber} - ${payload.Name}" for user ${username}...`,
      "info",
      reqid,
    );

    // Create a new AniList instance with the user's token
    const userApi = new AniList(userToken);
    const userScrobbler = new AnilistScrobbler(this.config);
    userScrobbler.setApi(userApi);
    
    // Initialize the user-specific scrobbler
    await userScrobbler.init();

    const result = await userScrobbler.scrobble(
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

  /**
   * Webhook handler for UserDataSaved (e.g., user manually marked watched)
   * Processes only Episodes and updates AniList progress accordingly.
   */
  public async webhookUserDataSaved(
    payload: UserDataSavedPayload & Partial<PlaybackStopPayload>,
    reqid: string,
  ): Promise<Response> {
    if (payload.ItemType != "Episode") {
      log("webhook/userdatasaved: Not an episode; ignoring", "info", reqid);
      return new Response("Not an episode.", { status: 200, statusText: "OK" });
    }

    // Log basic webhook info
    log(
      `webhook/userdatasaved: Processing UserDataSaved for "${payload.SeriesName}" episode ${payload.EpisodeNumber} (user: ${payload.NotificationUsername})`,
      "info",
      reqid,
    );

    // Get the username from the payload for user-specific token lookup
    const username = payload.NotificationUsername;
    if (!username) {
      const errorMsg = `No NotificationUsername in payload!`;
      log(
        `webhook/userdatasaved: ${errorMsg}`,
        "error",
        reqid,
      );
      return new Response(`${errorMsg}\nPayload = ${JSON.stringify(payload)}`, {
        status: 400,
        statusText: `Bad Request`,
      });
    }

    // Check if user has a specific AniList token configured
    const userToken = this.getUserAniListToken(username);
    if (!userToken) {
      const errorMsg = `No AniList token configured for user: ${username}`;
      log(
        `webhook/userdatasaved: ${errorMsg}`,
        "error",
        reqid,
      );
      return new Response(`${errorMsg}\nPayload = ${JSON.stringify(payload)}`, {
        status: 400,
        statusText: `Bad Request`,
      });
    }

    // initialize jellyfin API if required (same normalization as PlaybackStop)
    let rawServerUrl = (payload.ServerUrl || "").trim();
    if (!rawServerUrl && this.config.jellyfin.url) {
      rawServerUrl = this.config.jellyfin.url;
      log(
        `webhook/userdatasaved: Using configured jellyfin.url '${rawServerUrl}' as fallback`,
        "info",
        reqid,
      );
    }

    const normalizedServerUrl = /^https?:\/\//i.test(rawServerUrl)
      ? rawServerUrl
      : `http://${rawServerUrl}`;

    if (rawServerUrl !== normalizedServerUrl) {
      log(
        `webhook/userdatasaved: Normalized ServerUrl '${rawServerUrl}' -> '${normalizedServerUrl}'`,
        "info",
        reqid,
      );
    }

    if (this.jellyfin[normalizedServerUrl] === undefined) {
      this.jellyfin[normalizedServerUrl] = new JellyfinMiniApi(
        normalizedServerUrl,
        this.config.jellyfin.apiKey as string,
      );
    }

    // Lookup AniList provider id by series
    const anilistIdString = await this.jellyfin[
      normalizedServerUrl
    ].getProviderFromSeries(payload.SeriesId as string, "anilist");

    const anilistId: number = anilistIdString
      ? parseInt(anilistIdString, 10)
      : 0;

    if (anilistId == 0 || isNaN(anilistId)) {
      const errorMsg = `No or invalid \"Provider_AniList\" in payload!`;
      log(
        `webhook/userdatasaved: ${errorMsg} Provider_AniList=${(payload as any).Provider_anilist}`,
        "error",
        reqid,
      );
      return new Response(`${errorMsg}\nPayload = ${JSON.stringify(payload)}`, {
        status: 404,
        statusText: `Not found`,
      });
    }

    const episode = (payload.EpisodeNumber as number) ?? 0;
    const season = (payload.SeasonNumber as number) ?? 1;

    // Add a small delay to allow Jellyfin to update its internal state
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check the current play state of this episode from Jellyfin
    // to determine if it was marked as watched or unwatched
    let isEpisodeWatched = false;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        const episodeInfo = await this.jellyfin[normalizedServerUrl].getEpisodeInfo(
          payload.ItemId as string
        );
        

        
        // Check if we got a valid response
        if (!episodeInfo) {
          throw new Error("Jellyfin API returned undefined response");
        }
        
        if (!episodeInfo.UserData) {
          throw new Error("Jellyfin API response missing UserData");
        }
        
        isEpisodeWatched = episodeInfo.UserData.Played || false;
        
        log(
          `webhook/userdatasaved: Episode ${episode} play state: ${isEpisodeWatched ? 'watched' : 'unwatched'}`,
          "info",
          reqid,
        );
        
        // If we got a valid response, break out of retry loop
        break;
      } catch (error) {
        retryCount++;
        log(
          `webhook/userdatasaved: Failed to get episode play state from Jellyfin (attempt ${retryCount}/${maxRetries})`,
          "warn",
          reqid,
        );
        
        if (retryCount < maxRetries) {
          // Exponential backoff: wait longer between retries
          const delay = Math.pow(2, retryCount) * 500; // 1s, 2s, 4s
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // Try fallback method: get episode state from series level
          log(
            `webhook/userdatasaved: Using fallback method to get episode state from series`,
            "info",
            reqid,
          );
          
                    try {
            // Get the user ID first
            const userInfo = await this.jellyfin[normalizedServerUrl].getUserByName(username);
            if (!userInfo) {
              throw new Error(`Could not find user ID for username: ${username}`);
            }
            
            const fallbackState = await this.jellyfin[normalizedServerUrl].getEpisodePlayStateFromSeries(
              payload.SeriesId as string,
              episode,
              userInfo.Id
            );
            
            if (fallbackState) {
              isEpisodeWatched = fallbackState.Played;
              log(
                `webhook/userdatasaved: Fallback successful - Episode ${episode} play state: ${isEpisodeWatched ? 'watched' : 'unwatched'}`,
                "info",
                reqid,
            );
            } else {
              // If fallback also fails, assume it's watched to be safe
              log(
                `webhook/userdatasaved: Fallback failed, assuming episode is watched for safety`,
                "warn",
                reqid,
              );
              isEpisodeWatched = true;
            }
          } catch (fallbackError) {
            log(
              `webhook/userdatasaved: Fallback failed, assuming episode is watched for safety`,
              "warn",
              reqid,
            );
            isEpisodeWatched = true;
          }
        }
      }
    }

    // Only proceed if the episode is marked as watched
    if (!isEpisodeWatched) {
      log(
        `webhook/userdatasaved: Episode ${episode} is marked as unwatched, updating AniList accordingly`,
        "info",
        reqid,
      );

      // Create a new AniList instance with the user's token
      const userApi = new AniList(userToken);
      const userScrobbler = new AnilistScrobbler(this.config);
      userScrobbler.setApi(userApi);
      
      // Initialize the user-specific scrobbler
      await userScrobbler.init();

      // Handle unwatched episode - set progress to 0 or remove from list
      const result = await userScrobbler.handleUnwatchedEpisode(anilistId, episode, season);
      
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

    // Handle watched episode
    log(
      `webhook/userdatasaved: Detected as \"${payload.SeriesName} - ${episode} - ${payload.Name}\" for user ${username} (marked as watched)...`,
      "info",
      reqid,
    );

    // Create a new AniList instance with the user's token
    const userApi = new AniList(userToken);
    const userScrobbler = new AnilistScrobbler(this.config);
    userScrobbler.setApi(userApi);
    
    // Initialize the user-specific scrobbler
    await userScrobbler.init();

    const result = await userScrobbler.scrobble(anilistId, episode, season);

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

  /**
   * Handle marking an episode as unwatched
   * @async
   * @param id - Anilist Anime ID
   * @param episode - Episode number to mark as unwatched
   * @param season - Season number
   * @return {ScrobbleResult} state information on the success of the operation
   */
  public async handleUnwatchedEpisode(
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
        message: "Can only handle normal episodes (season != 1)!",
      } as ScrobbleResult;

    try {
      // Find the anime in the user's lists
      for (const list of await this.api.lists.anime(this.profileId)) {
        for (const entry of list.entries) {
          if (entry.media.id == id && entry.id) {
            // Update the entry to set progress to 0 (unwatched)
            const updatedEntry: UpdateEntryOptionsPartial = {
              progress: 0,
            };
            
            const result = await this.api.lists.updateEntry(
              entry.id,
              updatedEntry as UpdateEntryOptions,
            );
            
            return {
              success: true,
              level: "info",
              message: `Anime (${id}) episode ${episode} marked as unwatched, progress reset to 0.`,
            } as ScrobbleResult;
          }
        }
      }
      
      return {
        success: false,
        level: "warn",
        message: `Anime (${id}) not found in any list to mark as unwatched.`,
      } as ScrobbleResult;
    } catch (error) {
      return {
        success: false,
        level: "error",
        message: `Failed to mark anime (${id}) episode ${episode} as unwatched: ${error}`,
      } as ScrobbleResult;
    }
  }
}

// vim: tabstop=2 shiftwidth=2 softtabstop=0 smarttab expandtab
