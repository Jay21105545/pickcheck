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

export const TIERS = ["exists", "regex", "astgrep", "tokens", "manifest"] as const;

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
    // Optional precondition: the rule only runs if `when.files` matches at
    // least one scanned file. Lets an exists-tier rule be conditional (e.g.
    // "only require API.md if an API surface exists") without engine code
    // special-cased to a rule id — see DECISIONS/0005. Unset means
    // unconditional, matching every exists rule before this field existed.
    when: z
      .object({
        files: z.array(z.string().min(1)).min(1),
      })
      .optional(),
  }),
});

const regexRuleSchema = baseRuleSchema.extend({
  tier: z.literal("regex"),
  pattern: z.object({
    regex: z.string().min(1),
    flags: z.string().optional(),
    // Optional whole-file suppression: if `unless` matches anywhere in a
    // matched file's content, that file produces no findings for this
    // rule at all — e.g. "flag req.body reads, unless the file mentions a
    // validation lib somewhere." Same shape as the exists tier's
    // `pattern.when` precondition (DECISIONS/0005): an optional, generic
    // engine capability any regex rule can opt into, not a rule-specific
    // special case — see DECISIONS/0008. Unset means unconditional,
    // matching every regex rule before this field existed.
    unless: z
      .object({
        regex: z.string().min(1),
        flags: z.string().optional(),
      })
      .optional(),
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

const manifestRuleSchema = baseRuleSchema.extend({
  tier: z.literal("manifest"),
  pattern: z.object({
    // Extracts an import/require specifier per line; must have exactly one
    // capture group (the specifier string). What counts as "an import" is
    // rule data, same as the regex tier — the engine only adds the
    // manifest cross-reference and the built-in module exemptions below.
    regex: z.string().min(1),
    flags: z.string().optional(),
    // Manifest file (relative to the scanned repo root) whose dependency
    // fields list "installed" package names.
    manifestFile: z.string().min(1).default("package.json"),
    // Keys within the manifest JSON to union together as declared
    // packages, e.g. ["dependencies", "devDependencies"].
    dependencyFields: z.array(z.string().min(1)).min(1),
  }),
});

export const ruleSchema = z.discriminatedUnion("tier", [
  existsRuleSchema,
  regexRuleSchema,
  astgrepRuleSchema,
  tokensRuleSchema,
  manifestRuleSchema,
]);

export type Rule = z.infer<typeof ruleSchema>;
export type ExistsRule = z.infer<typeof existsRuleSchema>;
export type RegexRule = z.infer<typeof regexRuleSchema>;
export type AstgrepRule = z.infer<typeof astgrepRuleSchema>;
export type TokensRule = z.infer<typeof tokensRuleSchema>;
export type ManifestRule = z.infer<typeof manifestRuleSchema>;
export type Category = (typeof CATEGORIES)[number];
export type Severity = (typeof SEVERITIES)[number];
export type Tier = (typeof TIERS)[number];
