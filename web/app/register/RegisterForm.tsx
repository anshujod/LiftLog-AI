"use client";

import { useState, type SubmitEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ApiError } from "@/lib/api/errors";
import { GoogleSignInSection, isGoogleSignInEnabled } from "@/components/GoogleSignInSection";
import { Button } from "@/components/ui/Button";
import { ErrorNote } from "@/components/ui/ErrorNote";

export function RegisterForm() {
  const { register, loginWithGoogle } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(email, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleIdToken(idToken: string) {
    setError(null);
    setSubmitting(true);
    try {
      await loginWithGoogle(idToken);
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {isGoogleSignInEnabled() && (
        <>
          <GoogleSignInSection
            mode="signup"
            busy={submitting}
            onIdToken={(idToken) => void handleGoogleIdToken(idToken)}
            onError={setError}
          />
          <div className="flex items-center gap-3 text-xs text-muted" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span>or</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="register-email" className="text-sm text-muted">
            Email
          </label>
          <input
            id="register-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            enterKeyHint="next"
            disabled={submitting}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-lg border border-border bg-surface px-4 text-base text-foreground outline-none focus:border-accent"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="register-password" className="text-sm text-muted">
            Password
          </label>
          <div className="relative">
            <input
              id="register-password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={10}
              autoComplete="new-password"
              enterKeyHint="done"
              disabled={submitting}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby="register-password-hint"
              className="h-12 w-full rounded-lg border border-border bg-surface px-4 pr-14 text-base text-foreground outline-none focus:border-accent"
            />
            <button
              type="button"
              aria-pressed={showPassword}
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex h-12 w-12 items-center justify-center rounded-lg text-sm text-muted hover:text-foreground"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <span id="register-password-hint" className="text-xs text-muted">
            At least 10 characters.
          </span>
        </div>
        {error && <ErrorNote message={error} />}
        <Button
          variant="primary"
          size="md"
          type="submit"
          className="w-full"
          loading={submitting}
          loadingLabel="Creating account…"
        >
          Create account
        </Button>
        <p className="text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="py-1 text-accent hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
