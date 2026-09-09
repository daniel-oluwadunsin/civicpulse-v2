import { useMutation } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
function AuthForm({ register = false }: { register?: boolean }) {
  const navigate = useNavigate();
  const [message, setMessage] = useState<string>();
  const mutation = useMutation({
    mutationFn: (payload: unknown) =>
      api(register ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data: any) => {
      setMessage(
        data?.verificationDelivery === "PENDING_CONFIGURATION"
          ? "Account created. Email verification delivery is awaiting SMTP configuration."
          : "Success. Redirecting…",
      );
      navigate("/");
    },
    onError: (error: Error) => setMessage(error.message),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    mutation.mutate({
      email: data.get("email"),
      password: data.get("password"),
      ...(register ? { displayName: data.get("displayName") } : {}),
    });
  }
  return (
    <main className="auth-page swiss-grid">
      <form onSubmit={submit} className="form-card">
        <p className="eyebrow signal">CIVICPULSE / ACCOUNT</p>
        <h1>{register ? "CREATE ACCOUNT" : "SIGN IN"}</h1>
        {register && (
          <label>
            Display name
            <input name="displayName" required minLength={2} />
          </label>
        )}
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            minLength={register ? 12 : 1}
            autoComplete={register ? "new-password" : "current-password"}
          />
        </label>
        {message && (
          <p className="form-message" role="status">
            {message}
          </p>
        )}
        <button className="button button--ink" disabled={mutation.isPending}>
          {mutation.isPending
            ? "WORKING…"
            : register
              ? "CREATE ACCOUNT"
              : "SIGN IN"}
        </button>
        <p>
          {register ? (
            <>
              Already registered? <Link to="/login">Sign in</Link>
            </>
          ) : (
            <>
              New here? <Link to="/register">Create an account</Link>
            </>
          )}
        </p>
      </form>
    </main>
  );
}
export const LoginPage = () => <AuthForm />;
export const RegisterPage = () => <AuthForm register />;
