import type { Config } from "lib/config";
import type { UpdatedEntry, UpdateEntryOptions } from "anilist-node";

import AniList from "anilist-node";
import { isAxiosError } from "axios";

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
      let update: { id: number; entry: UpdateEntryOptions } | undefined;

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

            // prepare update
            update = {
              id: entry.id,
              entry: this.createUpdatedEntry(episode, entry.media.episodes),
            };
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

            // prepare update
            update = {
              id: entry.id,
              entry: this.createUpdatedEntry(episode, entry.media.episodes),
            };
            break;
          }
        }
      }

      // apply update (try 3 times)
      if (update) {
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            result = await this.api.lists.updateEntry(update.id, update.entry);
            break;
          } catch (error) {
            // try again on 500 error from anilist api
            if (
              !isAxiosError(error) ||
              error.response?.status !== 500 ||
              attempt >= maxAttempts
            ) {
              throw error;
            }

            await new Promise((resolve) =>
              setTimeout(resolve, (attempt + 1) * 30 * 1000),
            );
          }
        }
      }

      if (result === undefined) {
        if (this.config.anilist.autoAdd) {
          if (episode != 1)
            return {
              success: false,
              level: "warn",
              message: `Skipping add anime (${id}), this is not the first episode.`,
            } as ScrobbleResult;

          try {
            const updatedEntry = this.createUpdatedEntry(
              episode,
              (await this.api.media.anime(id)).episodes,
            );
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
}

// vim: tabstop=2 shiftwidth=2 softtabstop=0 smarttab expandtab
