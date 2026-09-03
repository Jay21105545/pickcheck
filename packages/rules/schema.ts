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
  // Optional, tier-agnostic precondition: exclude files that are the direct
  // execution target of some package.json `scripts` entry (e.g. "npx tsx
  // lib/db/setup.ts") — a one-off developer CLI script, not application
  // runtime code, regardless of which directory it happens to live in. See
  // DECISIONS/0017. Unset (the default) applies to every rule written
  // before this field existed, matching their current behavior exactly.
  excludePackageScriptTargets: z.boolean().optional(),
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
    // Optional per-file occurrence threshold: when set, a matched file
    // produces at most one finding, and only once `regex` has matched at
    // least `minCount` times across the *whole file* (not per line) — a
    // handful of one-off matches is normal, many in one file is the
    // actual signal (e.g. design-token drift from repeated inline hex
    // colors). Unset preserves the original per-line-match behavior
    // every regex rule before this field had — see DECISIONS/0011.
    minCount: z.number().int().positive().optional(),
  }),
});

const astgrepRuleSchema = baseRuleSchema.extend({
  tier: z.literal("astgrep"),
  // Passed straight through to @ast-grep/napi (lazy-loaded) — see
  // ARCHITECTURE.md's rule.yaml schema. Shape is ast-grep's own YAML rule
  // format, not pickcheck's to validate.
  pattern: z.record(z.string(), z.unknown()),
});

// The tokens tier covers two distinct checks under one tier (all about
// AI-context-surface hygiene, per IDEA.md's "Tokens" category) rather than
// two tiers, since the only real difference between them is the shape of
// `pattern` — same "discriminate the pattern payload, not the tier" move
// the exists tier's `mode` and the regex tier's `unless`/`minCount` already
// make. See DECISIONS/0012. A third check, `ignore-coverage`, lived here
// until DECISIONS/0016 moved it to the unscored token-surface report — it
// fired on every real-world repo sampled regardless of quality, which is
// zero discriminative signal for a scored rule.
const tokensBudgetPattern = z.object({
  check: z.literal("budget"),
  // Token budget per matched file (gpt-tokenizer, lazy-loaded — see
  // DECISIONS/0012). A file's own token count exceeding this is the
  // finding.
  budget: z.number().positive(),
});

const tokensDuplicatePattern = z.object({
  check: z.literal("duplicate"),
  // Minimum character length a shared paragraph must reach to count as
  // meaningful duplicated content rather than incidental boilerplate
  // (e.g. two files coincidentally sharing a short heading like "##
  // Setup"). Matched files are compared pairwise; a paragraph appearing
  // verbatim (whitespace-normalized) in two different matched files at
  // or above this length is a finding.
  minChars: z.number().int().positive().default(200),
});

const tokensRuleSchema = baseRuleSchema.extend({
  tier: z.literal("tokens"),
  pattern: z.discriminatedUnion("check", [tokensBudgetPattern, tokensDuplicatePattern]),
});

// The manifest tier covers two distinct checks under one tier, same
// "discriminate the pattern payload, not the tier" move DECISIONS/0012
// established for the tokens tier — both need the identical ancestor-union
// dependency resolution (declaredDependenciesForFile in manifest.ts), just
// applied to a different question. See DECISIONS/0018.
const manifestHallucinatedImportPattern = z.object({
  mode: z.literal("hallucinated-import"),
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
});

const manifestRequiresDependencyPattern = z.object({
  mode: z.literal("requires-dependency"),
  // Checked against each matched file's whole raw content (not extracted
  // per-line like hallucinated-import) — every match is a candidate.
  regex: z.string().min(1),
  flags: z.string().optional(),
  manifestFile: z.string().min(1).default("package.json"),
  dependencyFields: z.array(z.string().min(1)).min(1),
  // A content match only becomes a finding if the ancestor-union'd
  // declared dependencies contain NONE of these. An entry ending in "/*"
  // matches any package under that npm scope (e.g. "@stripe/*" matches
  // "@stripe/react-stripe-js"); every other entry must match exactly.
  requiresAnyOf: z.array(z.string().min(1)).min(1),
});

const manifestRuleSchema = baseRuleSchema.extend({
  tier: z.literal("manifest"),
  pattern: z.discriminatedUnion("mode", [
    manifestHallucinatedImportPattern,
    manifestRequiresDependencyPattern,
  ]),
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
