// Real-world false positive found during calibration (DECISIONS/0014):
// a third-party brand logo SVG (Google's official multi-color "G")
// whose colors are externally mandated, not this app's own tokens
// drifting — excluded by its icons/ path rather than judged by content.
export default function Google({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className}>
      <path fill="#4285F4" d="M50 20a30 30 0 1 0 0 60 30 30 0 0 0 0-60z" />
      <path fill="#34A853" d="M20 50a30 30 0 0 0 30 30v-15a15 15 0 0 1-15-15z" />
      <path fill="#FBBC05" d="M20 50a30 30 0 0 1 5-16l-13-9A30 30 0 0 0 5 50z" />
      <path fill="#EA4335" d="M50 20a30 30 0 0 0-25 14l13 9a15 15 0 0 1 12-7z" />
      <path fill="#0F9D58" d="M50 80a30 30 0 0 0 25-14l-13-9a15 15 0 0 1-12 8z" />
    </svg>
  );
}
