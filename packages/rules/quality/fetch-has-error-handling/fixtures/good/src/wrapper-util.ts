export async function safeFetch(url: string): Promise<Response | null> {
  try {
    return await fetch(url);
  } catch (e) {
    console.error("network error", e);
    return null;
  }
}
