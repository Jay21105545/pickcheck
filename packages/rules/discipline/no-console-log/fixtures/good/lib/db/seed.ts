// A one-off seed script, invoked only via `npm run db:seed` — not
// application runtime code (DECISIONS/0017). Real shape from
// nextjs/saas-starter's lib/db/seed.ts (self-invoking module-scope call,
// never imported by anything else).
async function seed() {
  console.log("Seeding database...");
}

seed()
  .catch((error) => {
    console.error("Seed process failed:", error);
    process.exit(1);
  })
  .finally(() => {
    console.log("Seed process finished. Exiting...");
    process.exit(0);
  });
