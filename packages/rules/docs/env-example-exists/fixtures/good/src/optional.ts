// Real shape from steven-tey/precedent (app/page.tsx:13), which flagged as
// a false positive during DECISIONS/0027 calibration. GITHUB_OAUTH_TOKEN
// only raises the GitHub API rate limit; the spread applies when it's set
// and the code works fine when it isn't. An optional setting is not an
// undocumented requirement, so it must NOT count toward coverage.
export async function stars(): Promise<number> {
  const response = await fetch("https://api.github.com/repos/vercel/next.js", {
    ...(process.env.GITHUB_OAUTH_TOKEN && {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_OAUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
    }),
  });
  const json = (await response.json()) as { stargazers_count: number };
  return json.stargazers_count;
}
