/**
 * The CLI proper. Reached only through `src/index.ts`'s
 * `await import("./cli.js")`, after the Node-version gate has passed —
 * every import below (commander first among them) is free to assume a
 * supported runtime precisely because none of them is hoisted ahead of
 * that check. See DECISIONS/0025.
 */
import { Command } from "commander";
import { registerAuditCommand } from "./commands/audit.js";
import { registerGenCommand } from "./commands/gen.js";
import { registerInitCommand } from "./commands/init.js";
import { getVersion } from "./version.js";

const program = new Command();

program
  .name("pickcheck")
  .description("Zero-config audit CLI for AI-built apps")
  .version(getVersion());

registerAuditCommand(program);
registerInitCommand(program);
registerGenCommand(program);

await program.parseAsync(process.argv);
