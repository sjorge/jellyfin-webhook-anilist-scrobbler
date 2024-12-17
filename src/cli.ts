import { _DEFINE_PROG, _DEFINE_VER } from "vars";
import { program } from "@commander-js/extra-typings";
import { addConfigureCommand } from "cmd/configure";
import { addWebhookCommand } from "cmd/webhook";

program
  .name(_DEFINE_PROG)
  .version(_DEFINE_VER)
  .description("Utility for updating watched status on anilist.");

addConfigureCommand(program);
addWebhookCommand(program);

program.parse(process.argv);

// vim: tabstop=2 shiftwidth=2 softtabstop=0 smarttab expandtab
