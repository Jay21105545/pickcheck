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

export const TIERS = [
  "exists",
  "regex",
  "astgrep",
  "tokens",
  "manifest",
  "coverage",
  "capability",
] as const;

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
    // Optional whole-file *precondition*, the exact mirror of `unless`
    // below: a matched file produces findings only if `when` matches
    // somewhere in its content. Same family as the exists tier's
    // `pattern.when` (DECISIONS/0005) and `unless` itself
    // (DECISIONS/0008) — a generic, optional capability any regex rule
    // can opt into, not a rule-specific special case. Added in
    // DECISIONS/0028 for `qual/simulated-backend`, whose subject is a
    // *submit handler* that resolves on a timer: the trigger and the
    // handler are on different lines, and the regex tier reads one line
    // at a time, so without a file-level precondition the rule could not
    // say the thing its own README claims.
    //
    // Deliberately does NOT affect scoring applicability, unlike the
    // exists tier's glob-based `when`: applicability is computed from
    // `files` alone, without reading content (scorer.ts's isApplicable),
    // and `unless` has always worked that way too. A regex rule is
    // "checked" if its glob matched files, whatever the content says.
    //
    // Unset means unconditional, matching every regex rule written
    // before this field existed.
    when: z
      .object({
        regex: z.string().min(1),
        flags: z.string().optional(),
      })
      .optional(),
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

/**
 * The coverage tier answers one question no other tier can: *are the
 * identifiers this code uses declared in the file that is supposed to
 * document them?* — a set relation between two extracted name sets, not a
 * per-occurrence match.
 *
 * It is a new tier rather than a new mode on `manifest` (which also
 * cross-references source against a declaration file) because it shares
 * essentially no machinery with it: no JSON parsing, no ancestor-manifest
 * walk, no per-specifier resolution, and an aggregate verdict instead of
 * one finding per occurrence. Bolting it onto `manifest` would have meant
 * a mode that opts out of every part of that tier. See DECISIONS/0027.
 */
const coverageRuleSchema = baseRuleSchema.extend({
  tier: z.literal("coverage"),
  pattern: z.object({
    /**
     * Extracts a used identifier from each matched source file. Unlike
     * the manifest tier's single-capture-group contract, ANY number of
     * capture groups is allowed and the first one that participated in
     * the match wins — an alternation over several access syntaxes
     * (`process.env.X`, `process.env["X"]`, `Deno.env.get("X")`) is far
     * more readable as one group per branch than as a single group
     * threaded through all of them.
     */
    regex: z.string().min(1),
    flags: z.string().optional(),
    /**
     * Marks an identifier as *optional*, exempting it from the coverage
     * denominator. Same capture-group contract as `regex`.
     *
     * The distinction this draws is real and load-bearing: a value whose
     * absence the code itself handles (`process.env.X && {…}`,
     * `process.env.X ?? fallback`) is not a required setting, and
     * demanding it be documented is a false positive. Corpus calibration
     * found exactly that on steven-tey/precedent, whose optional
     * `GITHUB_OAUTH_TOKEN` (a rate-limit raiser, spread in only when set)
     * is deliberately absent from its .env.example — see DECISIONS/0027
     * and this rule's fixtures/good/src/optional.ts.
     */
    optionalRegex: z.string().min(1).optional(),
    optionalFlags: z.string().optional(),
    /** Where the identifiers are supposed to be declared, e.g. `.env.example`. */
    declaredIn: z.object({
      files: z.array(z.string().min(1)).min(1),
      /** Extracts a declared identifier. Same capture-group contract as `regex`. */
      regex: z.string().min(1),
      flags: z.string().optional(),
    }),
    /**
     * Minimum fraction of required identifiers that must be declared,
     * 0–1. RULESET.md §6 specifies 0.6 for docs/env-example-exists.
     */
    threshold: z.number().min(0).max(1),
    /**
     * Identifiers never counted as required — platform-injected values
     * nobody is expected to document (`NODE_ENV`, `VERCEL_*`, the
     * `SUPABASE_*` triple the Edge runtime supplies automatically). An
     * entry ending in `*` matches any identifier with that prefix.
     */
    ignore: z.array(z.string().min(1)).default([]),
  }),
});

/**
 * The capability tier answers a question about the repo as a whole rather
 * than about any file in it: *is some guarantee established anywhere?* —
 * where "anywhere" spans package.json scripts, CI configuration, and
 * framework config that provides the guarantee implicitly.
 *
 * It is a tier rather than a mode on `exists` because the question is
 * never "does this path exist". Every other tier answers by matching
 * content *within* files it then reports against; this one collects
 * evidence from several unrelated places, ORs it together, and reports
 * one finding when the OR comes out false. Nothing is reported against
 * the files it reads — they are the evidence, not the defect.
 *
 * The generality that earns it a tier is the *provider list*. "Nothing
 * type-checks this repo" is one instance; "nothing lints it", "nothing
 * runs its tests in CI" are the same shape, and all of them have the same
 * trap: a guarantee a framework supplies for free, which a config flag can
 * silently switch back off. `providedBy[].revokedBy` is that trap made
 * into data. See DECISIONS/0030.
 */
const capabilityRuleSchema = baseRuleSchema.extend({
  tier: z.literal("capability"),
  pattern: z.object({
    /**
     * Repo-relative path the single finding is reported against — the file
     * the user would edit to establish the capability (e.g. `package.json`,
     * where a `typecheck` script would go). Need not exist.
     */
    reportAt: z.string().min(1),
    /**
     * Any ONE satisfied provider establishes the capability. A finding is
     * produced only when none is.
     */
    providedBy: z
      .array(
        z.object({
          /** Named in the fix prompt, so the finding says what was looked for and not found. */
          label: z.string().min(1),
          /**
           * Where to look. `package-scripts` reads every scanned
           * `package.json`'s `scripts` object and matches `regex` against
           * each entry's name and its command; `files` matches `regex`
           * against the content of files matching `files`.
           */
          source: z.enum(["package-scripts", "files"]),
          /** Globs to read. Required for `source: files`, ignored for `package-scripts`. */
          files: z.array(z.string().min(1)).min(1).optional(),
          /**
           * What establishes the capability. Omit — only meaningful for
           * `source: files` — to mean the file merely existing is enough,
           * which is how a framework config that type-checks by default
           * gets expressed.
           */
          regex: z.string().min(1).optional(),
          flags: z.string().optional(),
          /**
           * What switches the capability back OFF, checked against the same
           * content that would otherwise establish it — e.g.
           * `typescript: { ignoreBuildErrors: true }` in a `next.config.mjs`,
           * which turns `next build` from a type-checker into one that
           * ships type errors. A provider whose content matches this does
           * not count as satisfied.
           */
          revokedBy: z.string().min(1).optional(),
          revokedByFlags: z.string().optional(),
        }),
      )
      .min(1),
  }),
});

export const ruleSchema = z.discriminatedUnion("tier", [
  existsRuleSchema,
  regexRuleSchema,
  astgrepRuleSchema,
  tokensRuleSchema,
  manifestRuleSchema,
  coverageRuleSchema,
  capabilityRuleSchema,
]);

export type Rule = z.infer<typeof ruleSchema>;
export type ExistsRule = z.infer<typeof existsRuleSchema>;
export type RegexRule = z.infer<typeof regexRuleSchema>;
export type AstgrepRule = z.infer<typeof astgrepRuleSchema>;
export type TokensRule = z.infer<typeof tokensRuleSchema>;
export type ManifestRule = z.infer<typeof manifestRuleSchema>;
export type CoverageRule = z.infer<typeof coverageRuleSchema>;
export type CapabilityRule = z.infer<typeof capabilityRuleSchema>;
export type Category = (typeof CATEGORIES)[number];
export type Severity = (typeof SEVERITIES)[number];
export type Tier = (typeof TIERS)[number];
