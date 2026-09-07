// The second branch: no key literal anywhere, but the service-role
// credential is read from a name the bundler inlines into the browser.
// newattendanceapp/scripts/force-checkout-failed-users.js, same shape.
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

module.exports = { key };
