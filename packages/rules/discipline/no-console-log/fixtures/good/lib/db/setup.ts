// A one-off interactive CLI script, invoked only via `npm run db:setup` —
// not application runtime code (DECISIONS/0017). Real shape from
// nextjs/saas-starter's lib/db/setup.ts.
import readline from "node:readline";

function question(query: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    }),
  );
}

async function setup() {
  console.log("Step 1: checking environment...");
  const answer = await question("Continue? ");
  console.log(`You said: ${answer}`);
}

setup();
