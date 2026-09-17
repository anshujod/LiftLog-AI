import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <p className="font-display text-lg tracking-wide">LIFT<span className="text-acid">LOG</span></p>
        <p className="eyebrow mt-4">Serious training only</p>
        <h1 className="mb-8 mt-1 font-display text-5xl leading-[0.9]">Log in<span className="text-acid">.</span></h1>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
