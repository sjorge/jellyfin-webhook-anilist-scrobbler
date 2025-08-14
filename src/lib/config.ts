import { _DEFINE_PROG } from "vars";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import toml from "@iarna/toml";
import { deepmerge } from "deepmerge-ts";
import { banner, log } from "lib/logger";

/**
 * Type for Configuration of anilistwatched
 */
export type Config = {
  webhook: {
    bind: string;
    port: number;
  };
  anilist: {
    token?: string;
  };
  jellyfin: {
    apiKey?: string;
    url?: string;
    libraryName?: string;
  };
};

const configDir: string = process.env.XDG_CONFIG_HOME
  ? path.join(process.env.XDG_CONFIG_HOME, _DEFINE_PROG)
  : path.join(os.homedir(), ".config", _DEFINE_PROG);

export const configFile: string = process.env.ANILISTWATCHED_CONFIG
  ? process.env.ANILISTWATCHED_CONFIG
  : path.join(configDir, "config.toml");

/**
 * Read configuration from file
 * @return {Config} Configuration object of type Config
 */
export function readConfig(): Config {
  let config: Config = {
    webhook: {
      bind: "localhost",
      port: 4091,
    },
    anilist: {},
    jellyfin: {},
  };

  if (fs.existsSync(configFile) && fs.statSync(configFile).isFile()) {
    const configToml = toml.parse(
      fs.readFileSync(configFile, "utf8"),
    ) as Config;
    config = deepmerge(config, configToml);
  }

  return config;
}

/**
 * Write configuration to file
 * @param config - Configuration objject of type Config to write to file
 * @return {boolean} success of writing config to disk
 */
export function writeConfig(config: Config): boolean {
  try {
    const configFilePath: string = path.dirname(configFile);
    if (!fs.existsSync(configFilePath)) {
      fs.mkdirSync(configFilePath, { recursive: true, mode: 0o750 });
    }
    fs.writeFileSync(configFile, toml.stringify(config), { encoding: "utf8" });
    fs.chmodSync(configFile, 0o600);
  } catch {
    return false;
  }

  return true;
}

/**
 * Validates a Configuration oject of type Config
 * @param config - Configuration objject of type Config to write to file
 * @param verbose - When true the function logs the reason why a configuration is not valid
 * @return {boolean} validity of the configuration
 */
export function validateConfig(
  config: Config,
  verbose: boolean = false,
): boolean {
  let ret = true;
  if (config.anilist.token === undefined) {
    if (verbose) {
      banner();
      log("Missing anilist token!", "error");
    }
    ret = false;
  }
  if (config.jellyfin.apiKey === undefined) {
    if (verbose) {
      banner();
      log("Missing jellyfin API key!", "error");
    }
    ret = false;
  }
  return ret;
}

// vim: tabstop=2 shiftwidth=2 softtabstop=0 smarttab expandtab
