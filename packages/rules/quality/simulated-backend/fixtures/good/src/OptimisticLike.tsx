// Optimistic UI: local state flips immediately, a timer reverts the
// transient flourish. Again a scheduled callback, never awaited.
export function OptimisticLike({ postId, onSaveLike }) {
  const [justSaved, setJustSaved] = useState(false);

  const handleSave = () => {
    setJustSaved(true);
    onSaveLike(postId);
    setTimeout(() => setJustSaved(false), 2000);
  };

  return <button onClick={handleSave}>{justSaved ? "Saved!" : "Save"}</button>;
}
