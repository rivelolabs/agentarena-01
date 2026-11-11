import { INTERNAL_API_URL } from "./config";

/** Server-side fetch with ISR. Returns null instead of throwing so pages still render if the API is down. */
export async function serverGet<T>(path: string, revalidate = 30): Promise<T | null> {
  try {
    const res = await fetch(INTERNAL_API_URL + path, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
