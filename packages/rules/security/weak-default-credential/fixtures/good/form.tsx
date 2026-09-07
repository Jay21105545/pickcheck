// The word "password" appears five times and not once as a weak *value*.
// Every match here has a different identifier to the left of the `=`, which
// is what the rule anchors on.
export function SignInForm() {
  return (
    <form>
      <label htmlFor="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        placeholder="password"
        autoComplete="current-password"
      />
    </form>
  );
}
