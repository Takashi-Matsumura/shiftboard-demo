import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex-1 flex items-center justify-center bg-neutral-50 px-4 py-8">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </main>
  );
}
