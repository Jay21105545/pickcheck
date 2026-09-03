export function Card({ onSelect, title }: { onSelect: () => void; title: string }) {
  return <div onClick={onSelect}>{title}</div>;
}
