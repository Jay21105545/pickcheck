import { ImageResponse } from "next/og";

// Real-world false positive found during calibration (DECISIONS/0014):
// a Next.js special convention file (renders a static OG-image asset via
// the edge runtime, not a UI component) that fetches a font with no
// loading/error state — none of that applies here, so the file is
// excluded by name rather than relying on the unless-keyword heuristic.
export default async function OG() {
  const font = await fetch(new URL("./fonts/Inter-Bold.otf", import.meta.url)).then(
    (res) => res.arrayBuffer(),
  );

  return new ImageResponse(<div>Title</div>, {
    width: 1200,
    height: 630,
    fonts: [{ name: "Inter", data: font }],
  });
}
