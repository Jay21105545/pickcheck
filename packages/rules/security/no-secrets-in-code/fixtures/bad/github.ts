export const GITHUB_TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz1234567890AB";

export async function fetchRepo(): Promise<void> {
  await fetch("https://api.github.com/user", {
    headers: { Authorization: `token ${GITHUB_TOKEN}` },
  });
}
