export function SignupForm({
  onSubmit,
  pending,
}: {
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <form onSubmit={onSubmit}>
      <button type="submit" disabled={pending}>
        Sign up
      </button>
    </form>
  );
}
