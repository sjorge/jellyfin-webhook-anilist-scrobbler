/**
 * Type describing all common properties of the Jellyfin webhook payload
 * @remark We can cast incomming payload data to this type, we can then use the common fields to further handle and recast the payload later.
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
 * Media Related Properties of the Jellyfin webhook payload
 * @remark Not exported as this is not usable on it's own but both PlaybackStop and UserDataSaved have this media information
 */
type ExtendMediaInfoPayload = {
  Name: string;
  Overview: string;
  Tagline: string;
  ItemId: string;
  ItemType: string;
  SeriesId: string;
  SeasonId: string;
  RunTimeTicks: string;
  RunTime: string;
  PlaybackPositionTicks: number;
  PlaybackPosition: string;
  Provider_anidb?: string;
  Provider_anilist?: string;
  SeriesName: string;
  EpisodeNumber: number;
  SeasonNumber: number;
};

/**
 * User Related Properties of the Jellyfin webhook payload
 * @remark Not exported as this is not usable on it's own but both PlaybackStop and UserDataSaved have this user information
 */
type ExtendUserEventPayload = {
  UserId: string;
  NotificationUsername: string;
};

/**
 * Type partially describing the PlaybackStop properties of the Jellyfin webhook payload
 */
export type PlaybackStopPayload = BasePayload &
  ExtendMediaInfoPayload &
  ExtendUserEventPayload & {
    IsPaused: boolean;
    PlayedToCompletion: boolean;
    DeviceId: string;
    DeviceName: string;
    ClientName: string;
  };

/**
 * Type partially describing the UserDataSaved properties of the Jellyfin webhook payload
 */
export type UserDataSavedPayload = BasePayload &
  ExtendMediaInfoPayload &
  ExtendUserEventPayload & {
    Liked: boolean;
    Rating: number;
    PlayCount: number;
    Favorite: boolean;
    Played: boolean;
    LastPlayedDate: string;
    SaveReason:
      | "PlaybackStart"
      | "PlaybackProgress"
      | "PlaybackFinished"
      | "TogglePlayed"
      | "UpdateUserRating"
      | "Import"
      | "UpdateUserData";
  };

// vim: tabstop=2 shiftwidth=2 softtabstop=0 smarttab expandtab
