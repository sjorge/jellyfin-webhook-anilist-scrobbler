import { Command } from "@commander-js/extra-typings";
import type { Server } from "bun";

import type { Config } from "lib/config";
import { readConfig, validateConfig } from "lib/config";
import { banner, log } from "lib/logger";

/*
 * Entrypoint `webook` action for commander-js
 */
async function webhookAction(): Promise<void> {
  banner();
  const config: Config = readConfig();

  if (!validateConfig(config, true)) {
    process.exitCode = 1;
    return;
  }

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

      log(
        `webhook: ${req.method} ${url.pathname} from ${clientIPPrintable}`,
        "info",
        reqid,
      );

      if (
        req.method == "POST" &&
        req.headers.get("user-agent")?.startsWith("Jellyfin-Server/")
      ) {
        // XXX
      }

      return new Response("No request handler", {
        status: 403,
        statusText: "Forbidden",
      });
    },
  });

  log(`Listening on http://${server.hostname}:${server.port} ...`);
}

/*
 * Setup `webhook` command for commander-js
 */
export function addWebhookCommand(program: Command): void {
  program
    .command("webhook")
    .description("Start the webhook server")
    .action(webhookAction);
}

// vim: tabstop=2 shiftwidth=2 softtabstop=0 smarttab expandtab
