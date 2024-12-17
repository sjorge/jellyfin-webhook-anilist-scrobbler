import type { OptionValues } from "@commander-js/extra-typings";
import {
  Command,
  Option,
  InvalidArgumentError,
} from "@commander-js/extra-typings";
import type { Config } from "lib/config";
import {
  readConfig,
  writeConfig,
  validateConfig,
  configFile,
} from "lib/config";
import { banner, log } from "lib/logger";

/**
 * Entrypoint `configure` action for commander-js
 * @param opts - OptionValues from commander-js
 */
async function configureAction(opts: OptionValues): Promise<void> {
  const config: Config = readConfig();

  if (opts.webhookBind) config.webhook.bind = `${opts.webhookBind}`;
  if (opts.webhookPort) config.webhook.port = opts.webhookPort as number;
  if (opts.anilistToken) config.anilist.token = `${opts.anilistToken}`;
  if (opts.jellyfinApiKey) config.jellyfin.apiKey = `${opts.jellyfinApiKey}`;

  if (!writeConfig(config)) {
    log(`Failed to update ${configFile}!`, "error");
    process.exitCode = 1;
  } else if (!validateConfig(config, true)) {
    process.exitCode = 1;
  }

  if (opts.dump) {
    banner();
    console.log(JSON.stringify(config, null, 2));
  }
}

/**
 * Setup `configure` command for commander-js
 * @param program - commander program
 */
export function addConfigureCommand(program: Command): void {
  program
    .command("configure")
    .description("update configuration file")
    .option(
      "--webhook-bind <ip>",
      "optional IP where webhook binds on (default to localhost)",
    )
    .addOption(
      new Option(
        "--webhook-port <port>",
        "optional port where webhook binds on (default to 4091)",
      ).argParser((value: string) => {
        const valueNumber = parseInt(value, 10);

        if (isNaN(valueNumber))
          throw new InvalidArgumentError("Specified port is not a number.");

        return valueNumber;
      }),
    )
    .option("--anilist-token <token>", "your anilist http client token")
    .option("--jellyfin-api-key <api_key>", "jellyfin API key")
    .option("--dump", "dump configuration")
    .action(configureAction);
}

// vim: tabstop=2 shiftwidth=2 softtabstop=0 smarttab expandtab
