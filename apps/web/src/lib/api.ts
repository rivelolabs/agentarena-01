"use client";
import { API_URL } from "./config";

let token: string | null = null;
export function setApiToken(t: string | null) {
  token = t;
}
export function getApiToken() {
  return token;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string
  ) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(API_URL + path, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: {
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok) throw new ApiError(res.status, data?.message ?? `Request failed (${res.status})`, data?.error ?? "error");
  return data as T;
}

export const fetcher = (path: string) => api(path);
