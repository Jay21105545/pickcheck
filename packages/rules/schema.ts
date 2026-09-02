import { z } from "zod";

export const CATEGORIES = [
  "security",
  "quality",
  "docs",
  "discipline",
  "ui-ux",
  "tokens",
] as const;

export const SEVERITIES = ["info", "warn", "error"] as const;

export const TIERS = ["exists", "regex", "astgrep", "tokens"] as const;

const idSchema = z
  .string()
  .regex(/^[a-z0-9-]+\/[a-z0-9-]+$/, "id must look like '<category-prefix>/<rule-id>'");

const baseRuleSchema = z.object({
  id: idSchema,
  category: z.enum(CATEGORIES),
  severity: z.enum(SEVERITIES),
  title: z.string().min(1),
  files: z.array(z.string().min(1)).min(1),
  message: z.string().min(1),
  weight: z.number().positive(),
});

const existsRuleSchema = baseRuleSchema.extend({
  tier: z.literal("exists"),
  pattern: z.object({
    mode: z.enum(["present", "absent"]),
  }),
});

const regexRuleSchema = baseRuleSchema.extend({
  tier: z.literal("regex"),
  pattern: z.object({
    regex: z.string().min(1),
    flags: z.string().optional(),
  }),
});

const astgrepRuleSchema = baseRuleSchema.extend({
  tier: z.literal("astgrep"),
  // Passed straight through to @ast-grep/napi (lazy-loaded) — see
  // ARCHITECTURE.md's rule.yaml schema. Shape is ast-grep's own YAML rule
  // format, not pickcheck's to validate.
  pattern: z.record(z.string(), z.unknown()),
});

const tokensRuleSchema = baseRuleSchema.extend({
  tier: z.literal("tokens"),
  pattern: z.object({
    budget: z.number().positive(),
  }),
});

export const ruleSchema = z.discriminatedUnion("tier", [
  existsRuleSchema,
  regexRuleSchema,
  astgrepRuleSchema,
  tokensRuleSchema,
]);

export type Rule = z.infer<typeof ruleSchema>;
export type ExistsRule = z.infer<typeof existsRuleSchema>;
export type RegexRule = z.infer<typeof regexRuleSchema>;
export type AstgrepRule = z.infer<typeof astgrepRuleSchema>;
export type TokensRule = z.infer<typeof tokensRuleSchema>;
export type Category = (typeof CATEGORIES)[number];
export type Severity = (typeof SEVERITIES)[number];
export type Tier = (typeof TIERS)[number];
