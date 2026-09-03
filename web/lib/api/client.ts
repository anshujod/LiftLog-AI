"use client";

import { getAccessToken, setAccessToken } from "./token-store";
import { ApiError, AuthExpiredError } from "./errors";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Skip attaching the access token and skip the 401-triggered refresh retry. */
  skipAuth?: boolean;
}

interface ErrorBody {
  code: string;
  message: string;
}

async function parseErrorBody(response: Response): Promise<ErrorBody> {
  try {
    const data = await response.json();
    if (data?.error?.message) {
      return { code: data.error.code ?? "unknown_error", message: data.error.message };
    }
    // FastAPI's default pydantic validation errors use {"detail": [...]}
    if (Array.isArray(data?.detail) && data.detail.length > 0) {
      const first = data.detail[0];
      const field = Array.isArray(first?.loc) ? first.loc.at(-1) : undefined;
      return {
        code: "validation_error",
        message: field ? `${field}: ${first.msg}` : String(first?.msg ?? "Invalid request"),
      };
    }
  } catch {
    // fall through to the generic message below
  }
  return { code: "unknown_error", message: response.statusText || "Request failed" };
}

async function rawFetch(path: string, init: ApiFetchOptions): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const token = getAccessToken();
  if (token && !init.skipAuth) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch("/api/auth/refresh", { method: "POST" })
      .then(async (response) => {
        if (!response.ok) return false;
        const data = (await response.json()) as { access_token: string };
        setAccessToken(data.access_token);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/**
 * Thin fetch wrapper for the LiftLog API. Attaches the in-memory access token,
 * transparently refreshes once on a 401, and throws typed errors otherwise.
 */
export async function apiFetch<T>(path: string, init: ApiFetchOptions = {}): Promise<T> {
  let response = await rawFetch(path, init);

  if (response.status === 401 && !init.skipAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await rawFetch(path, init);
    } else {
      setAccessToken(null);
      throw new AuthExpiredError();
    }
  }

  if (!response.ok) {
    const body = await parseErrorBody(response);
    throw new ApiError(response.status, body.code, body.message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
