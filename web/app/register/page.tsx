import { RegisterForm } from "./RegisterForm";

export default function RegisterPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-2xl font-semibold">Create your account</h1>
        <RegisterForm />
      </div>
    </main>
  );
}
