"use client";

import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";

interface GoogleSignInSectionProps {
  mode: "signin" | "signup";
  busy: boolean;
  onIdToken: (idToken: string) => void;
  onError: (message: string) => void;
}

/** True when the Google button can render (client ID configured). */
export function isGoogleSignInEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
}

/**
 * Shared "Continue with Google" button for /login and /register.
 *
 * Renders nothing when NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset so local dev
 * without Google credentials keeps working with email/password. The GIS
 * credential (ID token) is handed to the parent, which exchanges it via
 * POST /api/auth/google — the email is never trusted from the client.
 */
export function GoogleSignInSection({ mode, busy, onIdToken, onError }: GoogleSignInSectionProps) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) return null;
  return (
    <GoogleOAuthProvider clientId={clientId}>
      <div
        inert={busy ? true : undefined}
        className={busy ? "pointer-events-none w-full opacity-60" : "w-full"}
      >
        <GoogleLogin
          text={mode === "signup" ? "signup_with" : "signin_with"}
          theme="filled_black"
          size="large"
          shape="rectangular"
          width="100%"
          onSuccess={(credentialResponse) => {
            const idToken = credentialResponse.credential;
            if (!idToken) {
              onError("Google sign-in failed. Please try again.");
              return;
            }
            onIdToken(idToken);
          }}
          onError={() => onError("Google sign-in failed. Please try again.")}
        />
      </div>
    </GoogleOAuthProvider>
  );
}
