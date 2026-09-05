// Two of three required keys documented (DATABASE_URL and SESSION_SECRET in
// .env.example, SMTP_FROM not) = 67%, which clears RULESET.md §6's 60%
// threshold. Pins the threshold semantics from the passing side: partial
// coverage above the bar is deliberately not a finding.
export const smtpFrom = process.env.SMTP_FROM;
