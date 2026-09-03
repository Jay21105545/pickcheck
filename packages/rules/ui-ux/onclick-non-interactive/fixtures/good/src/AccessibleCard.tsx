export function AccessibleCard({ onSelect }: { onSelect: () => void }) {
  return (
    <div
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      role="button"
      tabIndex={0}
    >
      Click me
    </div>
  );
}
