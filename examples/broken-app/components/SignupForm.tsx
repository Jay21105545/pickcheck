export function SignupForm({ onSubmit }: { onSubmit: () => void }) {
  return (
    <form onSubmit={onSubmit}>
      <button type="submit">Sign up</button>
    </form>
  );
}
