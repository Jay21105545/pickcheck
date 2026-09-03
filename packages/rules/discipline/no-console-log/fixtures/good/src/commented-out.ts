// Debugging line removed, kept here for reference:
// console.log("handling request", request.url);
export function handle(request: Request): void {
  process.stdout.write(`handling ${request.url}\n`);
}
