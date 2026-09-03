export function Card({ onSelect }: { onSelect: () => void }) {
  return <div onClick={onSelect}>Click me</div>;
}
