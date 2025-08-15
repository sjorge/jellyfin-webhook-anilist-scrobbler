import axios from "axios";
import https from "node:https";

import { _DEFINE_PROG, _DEFINE_VER } from "vars";

/**
 * Type partial result type for /Items endpoint when querying a SeriesId
 */
type PartialSeriesItemResult = {
  TotalRecordCount: number;
  StartIndex: number;
  Items: [
    {
      Name: string;
      ServerId: string;
      Id: string;
      ProviderIds: {
        [name: string]: string;
      };
      SeriesId?: string;
      IndexNumber?: number;
      ParentIndexNumber?: number;
    },
  ];
};

export class JellyfinMiniApi {
  private client;
  private baseUrl: string;

  /**
   * Minimal API Client for Jellyfin
   * @class
   * @param url - The URL for the Jellyfin instance
   * @param apiKey - A valid API key
   */
  public constructor(url: string, apiKey: string) {
    this.baseUrl = url.endsWith("/") ? url : `${url}/`;
    this.client = axios.create({
      baseURL: this.baseUrl,
      httpsAgent: new https.Agent({ keepAlive: true }),
      // timeout not yet supported under bun (ERR_NOT_IMPLEMENTED)
      // timeout: 10000,
      headers: {
        Accept: "application/json",
        Authorization: `MediaBrowser Token="${apiKey}", Client="${_DEFINE_PROG}, Device="script", DeviceId="4f8bb8fe", Version="${_DEFINE_VER},"`,
      },
    });
  }

  /**
   * Internal API query function
   * @param endpoint - endpoint URI
   * @param type - type of request
   * @return untyped data from API
   */
  private async query(
    endpoint: string,
    type: "POST" | "GET" = "GET",
  ): Promise<unknown> {
    if (type == "GET") {
      const res = await this.client.get(endpoint);
      if (res.status !== 200) {
        throw new Error(
          `Jellyfin API ${type} for ${endpoint} returned status ${res.status}!`,
        );
      } else {
        return res.data;
      }
    } else if (type == "POST") {
      const res = await this.client.post(endpoint);
      if (res.status !== 200) {
        throw new Error(
          `Jellyfin API ${type} for ${endpoint} returned status ${res.status}!`,
        );
      } else {
        return res.data;
      }
    }
  }

  public async getUserViews(userId: string): Promise<{
    Items: { Name: string; Id: string }[];
  }> {
    const res = (await this.query(`/Users/${userId}/Views`)) as {
      Items: { Name: string; Id: string }[];
    };
    return res;
  }

  public async getSeriesInLibrary(
    userId: string,
    libraryId: string,
  ): Promise<PartialSeriesItemResult> {
    const res = (await this.query(
      `/Users/${userId}/Items?ParentId=${libraryId}&IncludeItemTypes=Series&Fields=ProviderIds&Recursive=true&limit=10000&StartIndex=0`,
    )) as PartialSeriesItemResult;
    return res;
  }

  public async getPlayedEpisodesForSeries(
    userId: string,
    seriesId: string,
  ): Promise<PartialSeriesItemResult> {
    const res = (await this.query(
      `/Users/${userId}/Items?IncludeItemTypes=Episode&SeriesIds=${seriesId}&Filters=IsPlayed&Fields=ParentIndexNumber,IndexNumber&Recursive=true&limit=10000&StartIndex=0`,
    )) as PartialSeriesItemResult;
    return res;
  }

  public async getProviderFromSeries(
    seriesId: string,
    providerName: string,
  ): Promise<string | undefined> {
    const res = (await this.query(
      `/Items` +
        `?ids=${seriesId}&IncludeItemTypes=Series&Fields=ProviderIds,RecursiveItemCount&limit=100&StartIndex=0`,
    )) as PartialSeriesItemResult;

    if (res.TotalRecordCount != 1) return undefined;

    for (const provider of Object.keys(res.Items[0].ProviderIds)) {
      if (provider.toLowerCase() == providerName.toLowerCase())
        return res.Items[0].ProviderIds[provider];
    }

    return undefined;
  }

  /**
   * Get user information by username
   * @param username - The username to look up
   * @return User information including ID
   */
  public async getUserByName(username: string): Promise<{
    Id: string;
    Name: string;
  } | undefined> {
    try {
      const res = (await this.query(`/Users`)) as Array<{
        Id: string;
        Name: string;
      }>;
      
      if (!res || !Array.isArray(res)) {
        return undefined;
      }
      
      // Find the user by username
      const user = res.find(u => u.Name === username);
      return user;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Get episode information including play state
   * @param episodeId - The episode item ID
   * @param userId - The user ID (optional, for user-specific data)
   * @return Episode information with UserData
   */
  public async getEpisodeInfo(episodeId: string, userId?: string): Promise<{
    UserData?: {
      Played: boolean;
      PlayCount?: number;
      UnplayedItemCount?: number;
    };
  } | undefined> {
    try {
      let endpoint = `/Items/${episodeId}?Fields=UserData`;
      if (userId) {
        endpoint = `/Users/${userId}/Items/${episodeId}?Fields=UserData`;
      }
      
      const res = (await this.query(endpoint)) as {
        UserData?: {
          Played: boolean;
          PlayCount?: number;
          UnplayedItemCount?: number;
        };
      };
      
      if (!res) {
        return undefined;
      }
      
      return res;
    } catch (error) {
      // If the episode doesn't exist or we can't access it, return undefined
      return undefined;
    }
  }

  /**
   * Alternative method to get episode play state from series level
   * This can be used as a fallback when direct episode query fails
   * @param seriesId - The series ID
   * @param episodeNumber - The episode number
   * @param userId - The user ID (required for user-specific data)
   * @return Episode play state information
   */
  public async getEpisodePlayStateFromSeries(
    seriesId: string,
    episodeNumber: number,
    userId: string
  ): Promise<{
    Played: boolean;
    PlayCount?: number;
  } | undefined> {
    try {
      // Always use user-specific endpoint to get UserData
      const endpoint = `/Users/${userId}/Items?ParentId=${seriesId}&IncludeItemTypes=Episode&Fields=UserData&Recursive=true`;
      
      const res = (await this.query(endpoint)) as {
        Items: Array<{
          IndexNumber?: number;
          UserData?: {
            Played: boolean;
            PlayCount?: number;
          };
        }>;
      };
      
      if (!res || !res.Items) {
        return undefined;
      }
      
      // Find the specific episode
      const episode = res.Items.find(item => item.IndexNumber === episodeNumber);
      if (episode && episode.UserData) {
        return {
          Played: episode.UserData.Played || false,
          PlayCount: episode.UserData.PlayCount
        };
      }
      
      return undefined;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Return a friendly base URL used for requests
   */
  public getBaseUrl(): string {
    return this.baseUrl;
  }
}

// vim: tabstop=2 shiftwidth=2 softtabstop=0 smarttab expandtab
