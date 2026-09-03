export function CancelButton({ onCancel }: { onCancel: () => void }) {
  return (
    <button type="button" onClick={onCancel}>
      Cancel
    </button>
  );
}
