/**
 * Type describing a common properties of the Jellyfin webhook payload
 */
export type BasePayload = {
  ServerId: string;
  ServerName: string;
  ServerVersion: string;
  ServerUrl: string;
  NotificationType: string;
  Timestamp: string;
  UtcTimestamp: string;
};

/**
 * Type partially describing the PlaybackStop properties the Jellyfin webhook payload
 */
export type PlaybackStopPayload = BasePayload & {
  Name: string;
  Overview: string;
  Tagline: string;
  UserId: string;
  NotificationUsername: string;
  ItemId: string;
  SeriesId: string;
  SeasonId: string;
  ItemType: string;
  RunTimeTicks: string;
  RunTime: string;
  PlaybackPositionTicks: number;
  PlaybackPosition: string;
  IsPaused: boolean;
  PlayedToCompletion: boolean;
  Provider_anidb?: string;
  Provider_anilist?: string;
  SeriesName: string;
  EpisodeNumber: number;
  SeasonNumber: number;
  DeviceId: string;
  DeviceName: string;
  ClientName: string;
};

/**
 * Type describing a minimal AuthenticationSucceeded payload
 */
export type AuthenticationPayload = BasePayload & {
  UserId: string;
  NotificationUsername: string;
};

/**
 * Type describing a minimal UserDataSaved payload
 */
export type UserDataSavedPayload = BasePayload & {
  UserId: string;
  NotificationUsername: string;
};

// vim: tabstop=2 shiftwidth=2 softtabstop=0 smarttab expandtab
