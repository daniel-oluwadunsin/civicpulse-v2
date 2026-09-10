import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, ReactNode, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../../app/icons";
import { api } from "../../lib/api";

function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//"))
    return "/incidents";
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin
      ? `${url.pathname}${url.search}${url.hash}`
      : "/incidents";
  } catch {
    return "/incidents";
  }
}

function AuthLayout({
  eyebrow,
  title,
  description,
  children,
  onSubmit,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="auth-page">
      <aside className="auth-story">
        <div className="auth-shape auth-shape--circle" />
        <div className="auth-shape auth-shape--square" />
        <div className="auth-shape auth-shape--squiggle" />
        <p className="kicker">A public problem deserves a traceable response</p>
        <h2>
          Evidence in.
          <br />
          Accountability out.
        </h2>
        <p>
          Report safely, follow verified responsibility, and see official action
          alongside community verification.
        </p>
        <ul>
          <li>
            <Icon name="security" />
            Identity private by default
          </li>
          <li>
            <Icon name="map" />
            Location-safe public records
          </li>
          <li>
            <Icon name="building" />
            Verified organization attribution
          </li>
        </ul>
      </aside>
      <section className="auth-panel">
        <div className="auth-title">
          <p className="kicker">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <form className="form-card" onSubmit={onSubmit}>
          {children}
        </form>
      </section>
    </main>
  );
}
function PasswordField({ register = false }: { register?: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <label>
      Password
      <span className="password-field">
        <input
          name="password"
          type={shown ? "text" : "password"}
          required
          minLength={register ? 12 : 1}
          autoComplete={register ? "new-password" : "current-password"}
        />
        <button
          type="button"
          aria-label={shown ? "Hide password" : "Show password"}
          onClick={() => setShown((value) => !value)}
        >
          <Icon name="eye" size={20} />
        </button>
      </span>
      {register && <small>Use at least 12 characters.</small>}
    </label>
  );
}
function AuthForm({ register = false }: { register?: boolean }) {
  const navigate = useNavigate(),
    qc = useQueryClient(),
    [params] = useSearchParams();
  const [message, setMessage] = useState<string>();
  const mutation = useMutation({
    mutationFn: (payload: unknown) =>
      api<{ verificationDelivery?: string }>(
        register ? "/auth/register" : "/auth/login",
        { method: "POST", body: JSON.stringify(payload) },
      ),
    onSuccess: async (data) => {
      setMessage(
        data.verificationDelivery === "PENDING_CONFIGURATION"
          ? "Account created. Email delivery is awaiting configuration."
          : "Success. Opening your workspace…",
      );
      await qc.invalidateQueries({ queryKey: ["me"] });
      navigate(safeReturnTo(params.get("returnTo")), { replace: true });
    },
    onError: (error: Error) => setMessage(error.message),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    mutation.mutate({
      email: data.get("email"),
      password: data.get("password"),
      ...(register ? { displayName: data.get("displayName") } : {}),
    });
  };
  return (
    <AuthLayout
      eyebrow="CivicPulse account"
      title={register ? "Create your account" : "Welcome back"}
      description={
        register
          ? "Start reporting and following public infrastructure incidents."
          : "Continue to your civic workspace."
      }
      onSubmit={submit}
    >
      {register && (
        <label>
          Display name
          <input
            name="displayName"
            required
            minLength={2}
            autoComplete="name"
            placeholder="How your comments should appear"
          />
        </label>
      )}
      <label>
        Email address
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
        />
      </label>
      <PasswordField register={register} />
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      <button
        className="button button--primary auth-submit"
        disabled={mutation.isPending}
      >
        {mutation.isPending
          ? "Working…"
          : register
            ? "Create account"
            : "Sign in"}
        <Icon name="arrow" />
      </button>
      <p className="auth-switch">
        {register ? (
          <>
            Already registered?{" "}
            <Link
              to={`/login${params.get("returnTo") ? `?returnTo=${encodeURIComponent(params.get("returnTo")!)}` : ""}`}
            >
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to CivicPulse?{" "}
            <Link
              to={`/register${params.get("returnTo") ? `?returnTo=${encodeURIComponent(params.get("returnTo")!)}` : ""}`}
            >
              Create an account
            </Link>
            <br />
            <Link to="/forgot-password">Forgot your password?</Link>
          </>
        )}
      </p>
    </AuthLayout>
  );
}
export const LoginPage = () => <AuthForm />;
export const RegisterPage = () => <AuthForm register />;

export function ForgotPasswordPage() {
  const [message, setMessage] = useState<string>();
  const mutation = useMutation({
    mutationFn: (email: string) =>
      api("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    onSuccess: () =>
      setMessage(
        "If an active account exists, reset instructions have been sent.",
      ),
    onError: (error: Error) => setMessage(error.message),
  });
  return (
    <AuthLayout
      eyebrow="Account recovery"
      title="Reset your access"
      description="We keep recovery messages intentionally private."
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(
          String(new FormData(event.currentTarget).get("email") ?? ""),
        );
      }}
    >
      <label>
        Email address
        <input name="email" type="email" required autoComplete="email" />
      </label>
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      <button
        className="button button--primary auth-submit"
        disabled={mutation.isPending}
      >
        Send reset instructions <Icon name="arrow" />
      </button>
      <Link className="text-link" to="/login">
        Return to sign in
      </Link>
    </AuthLayout>
  );
}
export function ResetPasswordPage() {
  const [params] = useSearchParams(),
    navigate = useNavigate();
  const [message, setMessage] = useState<string>();
  const mutation = useMutation({
    mutationFn: (password: string) =>
      api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: params.get("token"), password }),
      }),
    onSuccess: () => {
      setMessage("Password updated. Existing sessions have been revoked.");
      window.setTimeout(() => navigate("/login"), 900);
    },
    onError: (error: Error) => setMessage(error.message),
  });
  return (
    <AuthLayout
      eyebrow="Account recovery"
      title="Choose a new password"
      description="Your other sessions will be revoked after this change."
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(
          String(new FormData(event.currentTarget).get("password") ?? ""),
        );
      }}
    >
      <PasswordField register />
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      <button
        className="button button--primary auth-submit"
        disabled={mutation.isPending || !params.get("token")}
      >
        Update password <Icon name="arrow" />
      </button>
    </AuthLayout>
  );
}
