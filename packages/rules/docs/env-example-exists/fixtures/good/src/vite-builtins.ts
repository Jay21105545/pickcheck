// Vite's built-in `import.meta.env` set. The bundler injects all five; no
// .env.example can meaningfully declare them, and a repo whose only env
// reads are these owes no documentation at all. cinnyapp/cinny — a
// human-built control — reads exactly BASE_URL and MODE and was flagged
// for it (DECISIONS/0030).
export const base = import.meta.env.BASE_URL;
export const mode = import.meta.env.MODE;
export const isDev = import.meta.env.DEV;
export const isProd = import.meta.env.PROD;
export const isSsr = import.meta.env.SSR;
