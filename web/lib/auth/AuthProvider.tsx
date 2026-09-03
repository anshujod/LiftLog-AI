"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { setAccessToken } from "@/lib/api/token-store";
import { resetUnitPreferenceCache } from "@/lib/units";
import { ApiError } from "@/lib/api/errors";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface TokenResponse {
  access_token: string;
  token_type: string;
}

interface AuthContextValue {
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error?.code ?? "unknown_error",
      data?.error?.message ?? "Request failed"
    );
  }
  return data as T;
}

/**
 * Bootstraps the session on mount by exchanging the httpOnly refresh cookie (set by
 * the /api/auth/* route handlers) for a fresh in-memory access token. This is what
 * makes login survive a full app restart even though the access token itself never
 * touches persistent storage.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/refresh", { method: "POST" })
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setStatus("unauthenticated");
          return;
        }
        const data = (await response.json()) as TokenResponse;
        setAccessToken(data.access_token);
        setStatus("authenticated");
      })
      .catch(() => {
        if (!cancelled) setStatus("unauthenticated");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await postJson<TokenResponse>("/api/auth/login", { email, password });
    setAccessToken(data.access_token);
    resetUnitPreferenceCache();
    setStatus("authenticated");
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const data = await postJson<TokenResponse>("/api/auth/register", { email, password });
    setAccessToken(data.access_token);
    resetUnitPreferenceCache();
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setAccessToken(null);
    resetUnitPreferenceCache();
    setStatus("unauthenticated");
    router.replace("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ status, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
