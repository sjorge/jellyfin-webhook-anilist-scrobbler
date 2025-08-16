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

  /**
   * Minimal API Client for Jellyfin
   * @class
   * @param url - The URL for the Jellyfin instance
   * @param apiKey - A valid API key
   */
  public constructor(url: string, apiKey: string) {
    this.client = axios.create({
      baseURL: url.endsWith("/") ? url : `${url}/`,
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
}

// vim: tabstop=2 shiftwidth=2 softtabstop=0 smarttab expandtab
