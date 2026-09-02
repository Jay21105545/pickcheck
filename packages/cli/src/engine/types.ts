export type { Category, Rule, Severity, Tier } from "@pickcheck/rules/schema";

import type { Severity } from "@pickcheck/rules/schema";

export interface Finding {
  ruleId: string;
  file: string;
  line?: number;
  severity: Severity;
  message: string;
  fixPrompt: string;
}
