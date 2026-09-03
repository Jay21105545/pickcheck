export function RoleOnly({ onSelect }: { onSelect: () => void }) {
  // role alone doesn't make it keyboard-focusable — tabIndex is missing.
  return (
    <div onClick={onSelect} role="button">
      Click me
    </div>
  );
}
