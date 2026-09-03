import Image from "next/image";

// A different tag entirely — not the lowercase host <img> this rule checks.
export function Logo() {
  return <Image src="/logo.png" width={32} height={32} alt="" />;
}
