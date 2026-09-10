import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";

export function OrganizationInvitationPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");
  const accept = useMutation({
    mutationFn: () => {
      if (!token) throw new Error("This invitation link is incomplete.");
      return api(`/organization-invitations/member/${token}/accept`, {
        method: "POST",
        body: "{}",
      });
    },
    onSuccess: () => navigate("/profile", { replace: true }),
  });
  return (
    <main className="page-container state-page">
      <p className="kicker">Organization invitation</p>
      <h1>Join your organization’s CivicPulse workspace.</h1>
      <p>
        Sign in with the email address that received this invitation, then
        accept it to activate your assigned role.
      </p>
      {accept.error && (
        <p className="form-message" role="alert">
          {accept.error.message}
        </p>
      )}
      <div className="button-row">
        <button
          className="button button--primary"
          disabled={!token || accept.isPending}
          onClick={() => accept.mutate()}
        >
          {accept.isPending ? "Accepting…" : "Accept invitation"}
        </button>
        <Link
          className="button"
          to={`/login?returnTo=${encodeURIComponent(`/organization-invitation?token=${token ?? ""}`)}`}
        >
          Sign in with another account
        </Link>
      </div>
    </main>
  );
}
