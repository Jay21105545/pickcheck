// Real-world false positive found during calibration (DECISIONS/0014):
// a sign-out action has no real double-submission consequence, and this
// exact icon+span shape (from a real shadcn/ui-style dropdown menu) was
// flagged before the sign-out/log-out text exemption was added.
export function SignOutMenuItem() {
  return (
    <form action="/api/sign-out" className="w-full">
      <button type="submit" className="flex w-full">
        <span className="flex w-full items-center">
          <LogOutIcon className="mr-2 h-4 w-4" />
          <span>Sign out</span>
        </span>
      </button>
    </form>
  );
}
