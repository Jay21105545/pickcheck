export interface TermEnv {
  NO_COLOR?: string;
  TERM?: string;
}

export interface TerminalMode {
  color: boolean;
  ascii: boolean;
}

/**
 * DESIGN.md: "Respect NO_COLOR; degrade gracefully to ASCII on dumb
 * terminals." NO_COLOR's presence — any value, per the NO_COLOR spec —
 * disables color. TERM=dumb disables both color and the box-drawing/
 * Unicode glyphs, since a dumb terminal can render neither reliably.
 */
export function resolveTerminalMode(env: TermEnv): TerminalMode {
  const dumb = env.TERM === "dumb";
  const noColor = env.NO_COLOR !== undefined;
  return {
    color: !dumb && !noColor,
    ascii: dumb,
  };
}
