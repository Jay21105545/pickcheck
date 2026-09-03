// Real-world false positive found during calibration (DECISIONS/0014):
// a Next.js OG-image route rendered via the edge runtime's Satori layout
// engine, which has limited CSS custom-property support — literal color
// values here are often unavoidable rather than design-token drift.
import { ImageResponse } from "next/og";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          backgroundColor: "#ffffff",
          backgroundImage: "linear-gradient(to bottom right, #E0E7FF 25%, #ffffff 50%, #CFFAFE 75%)",
          color: "#000000",
        }}
      >
        <span style={{ color: "#78716c" }}>Title</span>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
