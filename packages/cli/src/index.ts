#!/usr/bin/env node
import { Command } from "commander";
import { registerAuditCommand } from "./commands/audit.js";
import { getVersion } from "./version.js";

const program = new Command();

program
  .name("pickcheck")
  .description("Zero-config audit CLI for AI-built apps")
  .version(getVersion());

registerAuditCommand(program);

await program.parseAsync(process.argv);
