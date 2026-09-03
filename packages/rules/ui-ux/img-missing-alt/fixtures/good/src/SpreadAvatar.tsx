import type { ImgHTMLAttributes } from "react";

export function SpreadAvatar(props: ImgHTMLAttributes<HTMLImageElement>) {
  // alt may be inside the spread object — can't see through it structurally.
  return <img {...props} />;
}
