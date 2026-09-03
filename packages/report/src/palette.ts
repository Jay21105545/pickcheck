/**
 * DESIGN.md's palette, transcribed once as real CSS custom-property
 * declarations — every color the report renders is a `var(--token)`
 * reference back to one of these; nothing outside this file spells out a
 * raw hex literal (render.ts's `css()` just splices these blocks straight
 * into its `:root` rules). Written as actual `--name: value;` CSS text,
 * not a JS object, so a design-token *definition* site stays structurally
 * distinct from scattered hex *usage* — see DECISIONS/0019 for why that
 * distinction matters to `ux/inline-hex-threshold`.
 */
export const DARK_ROOT_TOKENS = `
  --bg: #0A0A0B;
  --panel: #141416;
  --border: #26262A;
  --text: #EDEDEF;
  --text-2: #8B8B92;
  --accent: #C6F432;
  --accent-ink: var(--accent);
  --accent-contrast: #0A0A0B;
  --sev-error: #FF5C5C;
  --sev-error-bg: rgba(255, 92, 92, 0.12);
  --sev-warn: #FFB224;
  --sev-warn-bg: rgba(255, 178, 36, 0.12);
  --sev-info: #5CA8FF;
  --sev-info-bg: rgba(92, 168, 255, 0.12);
`;

/**
 * Only the tokens that actually change in light mode — `accent-contrast`
 * and the severity colors are the same brand values in both themes
 * (DESIGN.md doesn't define separate light-mode severity hues), so they're
 * left to inherit from DARK_ROOT_TOKENS rather than being restated here.
 *
 * `accent-ink` is a darkened, same-hue stand-in for the raw accent lime —
 * the raw accent fails WCAG AA as *text* on a light background (contrast
 * ratio ~1.3:1). ~4.95:1 against white, computed from the sRGB relative-
 * luminance formula. The raw `--accent` is still used as-is for solid
 * fills (e.g. the "Copy fix prompt" button background), where it's paired
 * with dark text on top rather than read as text itself.
 */
export const LIGHT_ROOT_TOKEN_OVERRIDES = `
  --bg: #FAFAFA;
  --panel: #FFFFFF;
  --border: #E2E2E6;
  --text: #0A0A0B;
  --text-2: #55555C;
  --accent-ink: #5C7A00;
`;
