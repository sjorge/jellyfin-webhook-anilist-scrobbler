import type { Server } from "bun";
import type { Config } from "lib/config";
import type {
  BasePayload,
  PlaybackStopPayload,
  UserDataSavedPayload,
} from "lib/jellyfin/webhook";

import { Command } from "@commander-js/extra-typings";
import { readConfig, validateConfig } from "lib/config";
import { banner, log } from "lib/logger";
import { AnilistScrobbler } from "lib/scrobbler";
import { JellyfinMiniApi } from "lib/jellyfin/api";
import { webhookPlaybackStop } from "cmd/webhook/playbackstop";
import { webhookUserDataSaved } from "cmd/webhook/userdatasaved";

const NOTIFICATION_TYPES = ["PlaybackStop", "UserDataSaved"];
const DEBUG_PAYLOAD: boolean =
  process.env.ANILISTWATCHED_DEBUG_PAYLOAD === "true";

/**
 * Entrypoint `webook` action for commander-js
 */
async function webhookAction(): Promise<void> {
  banner();
  const config: Config = readConfig();

  if (!validateConfig(config, true)) {
    process.exitCode = 1;
    return;
  }

  const anilistScrobbler = new AnilistScrobbler(config);
  await anilistScrobbler.init();

  const jellyfinApi: {
    [url: string]: JellyfinMiniApi;
  } = {};

  // setup server
  const server: Server = Bun.serve({
    port: config.webhook.port,
    hostname: config.webhook.bind,
    async fetch(req: Request) {
      const url = new URL(req.url);
      const clientIP = server.requestIP(req);
      const clientIPPrintable =
        clientIP?.family == "IPv6"
          ? `[${clientIP?.address}]:${clientIP?.port}`
          : `${clientIP?.address}:${clientIP?.port}`;
      const reqid = Bun.hash
        .crc32(`${Date.now()}_${url}_${clientIPPrintable}`)
        .toString(16);

      if (
        req.method == "POST" &&
        req.headers.get("user-agent")?.startsWith("Jellyfin-Server/")
      ) {
        const payload: BasePayload = await req.json();
        if (DEBUG_PAYLOAD) {
          log(
            `webhook/payload: ${req.method} ${url.pathname} from ${clientIPPrintable} send payload: ${JSON.stringify(payload)}`,
            "info",
            reqid,
          );
        }

        if (NOTIFICATION_TYPES.includes(payload.NotificationType)) {
          log(
            `webhook: dispatching call for ${payload.NotificationType} NotificationType from ${clientIPPrintable}`,
            "info",
            reqid,
          );
        } else {
          const msg = `ignoring call for ${payload.NotificationType} NotificationType from ${clientIPPrintable}`;
          log(
            `webhook: ${msg}, please check your webhook configuration in Jellyfin`,
            "info",
            reqid,
          );
          return new Response(msg, {
            status: 200,
            statusText: "OK",
          });
        }

        // Initialize Jellyfin API for originating server if not already initialized
        if (jellyfinApi[payload.ServerUrl] === undefined) {
          log(
            `webhook: creating Jellyfin API connection for ${payload.ServerUrl}`,
            "info",
            reqid,
          );
          jellyfinApi[payload.ServerUrl] = new JellyfinMiniApi(
            payload.ServerUrl,
            config.jellyfin.apiKey as string,
          );
        }

        // Call specific webhook handler based on NotificationType
        if (payload.NotificationType == "PlaybackStop") {
          return await webhookPlaybackStop(
            payload as PlaybackStopPayload,
            reqid,
            jellyfinApi[payload.ServerUrl],
            anilistScrobbler,
          );
        }

        if (payload.NotificationType == "UserDataSaved") {
          return await webhookUserDataSaved(
            payload as UserDataSavedPayload,
            reqid,
            jellyfinApi[payload.ServerUrl],
            anilistScrobbler,
          );
        }
      }

      log(
        `webhook: ${req.method} ${url.pathname} from ${clientIPPrintable} has no dispatcher`,
        "error",
        reqid,
      );
      return new Response("No request handler", {
        status: 403,
        statusText: "Forbidden",
      });
    },
  });

  log(`Listening on http://${server.hostname}:${server.port} ...`);
}

/**
 * Setup `webhook` command for commander-js
 * @param commander program
 */
export function addWebhookCommand(program: Command): void {
  program
    .command("webhook")
    .description("Start the webhook server")
    .action(webhookAction);
}

// vim: tabstop=2 shiftwidth=2 softtabstop=0 smarttab expandtab
