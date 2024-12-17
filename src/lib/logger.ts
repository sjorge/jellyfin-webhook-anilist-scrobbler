import { _DEFINE_PROG, _DEFINE_VER } from "vars";
import tty from "node:tty";
import process from "node:process";

let printBanner = true;

/**
 * Log message
 * @param msg - The message to log
 * @param type - The type of the message
 * @param reqid - Optional request ID associated with the log message
 */
export function log(
  msg: string,
  type: "error" | "warn" | "step" | "done" | "info" = "info",
  reqid?: string,
): void {
  const useColor: boolean = tty.isatty(process.stdout.fd);
  const prefix: string = reqid ? `[${reqid}] ` : "";
  switch (type) {
    case "error":
      if (useColor) {
        process.stderr.write(`\x1b[2K\r[\x1b[31m!!\x1b[0m] ${prefix}${msg}\n`);
      } else {
        process.stdout.write(`[!!] ${prefix}${msg}\n`);
      }
      break;
    case "warn":
      if (useColor) {
        process.stdout.write(`\x1b[2K\r[\x1b[33mWW\x1b[0m] ${prefix}${msg}\n`);
      } else {
        process.stdout.write(`[WW] ${prefix}${msg}\n`);
      }
      break;
    case "info":
      if (useColor) {
        process.stdout.write(`\x1b[2K\r[\x1b[34mII\x1b[0m] ${prefix}${msg}\n`);
      } else {
        process.stdout.write(`[II] ${prefix}${msg}\n`);
      }
      break;
    case "done":
      if (useColor) {
        process.stdout.write(`\x1b[2K\r[\x1b[32mOK\x1b[0m] ${prefix}${msg}\n`);
      } else {
        process.stdout.write(`[OK] ${prefix}${msg}\n`);
      }
      break;
    case "step":
      if (useColor) {
        process.stdout.write(`\x1b[2K\r[\x1b[33m>>\x1b[0m] ${prefix}${msg}`);
      } else {
        process.stdout.write(`[>>] ${prefix}${msg}\n`);
      }
      break;
  }
}
/**
 * Print a banner
 */
export function banner(): void {
  if (!printBanner) return;

  log(`${_DEFINE_PROG} v${_DEFINE_VER}`);
  process.stdout.write(
    `${"-".repeat(process.stdout.columns < 80 ? process.stdout.columns : 80)}\n`,
  );

  printBanner = false;
}

// vim: tabstop=2 shiftwidth=2 softtabstop=0 smarttab expandtab
