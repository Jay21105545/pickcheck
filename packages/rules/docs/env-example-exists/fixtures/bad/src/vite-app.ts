// `VITE_API_URL` is this app's own setting — the author picked the name,
// the deployer has to supply it, and nothing documents it. Sitting next to
// genuine Vite built-ins must not launder it into the ignore list.
export const base = import.meta.env.BASE_URL;
export const mode = import.meta.env.MODE;
export const apiUrl = import.meta.env.VITE_API_URL;
export const analyticsKey = import.meta.env.VITE_ANALYTICS_KEY;
