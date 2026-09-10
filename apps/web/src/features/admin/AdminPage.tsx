import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Icon } from "../../app/icons";
import { api } from "../../lib/api";
type Overview = {
  organizationsPending: number;
  moderationOpen: number;
  routingReviews: number;
  resolutionDisputes: number;
  processingFailures: number;
  mergeReviews: number;
};
export default function AdminPage() {
  const client = useQueryClient();
  const [invitationMessage, setInvitationMessage] = useState<string>();
  const query = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => api<Overview>("/admin/overview"),
    retry: false,
  });
  const data = query.data;
  const invitations = useQuery({
    queryKey: ["organization-onboarding-invitations"],
    queryFn: () =>
      api<
        Array<{
          id: string;
          email: string;
          kind: string;
          organization_name: string;
          status: string;
          expires_at: string;
        }>
      >("/admin/organization-onboarding-invitations"),
    retry: false,
  });
  const invite = useMutation({
    mutationFn: (payload: unknown) =>
      api("/admin/organization-onboarding-invitations", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      setInvitationMessage("Invitation sent securely by email.");
      await client.invalidateQueries({
        queryKey: ["organization-onboarding-invitations"],
      });
    },
    onError: (error: Error) => setInvitationMessage(error.message),
  });
  const invitationAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "resend" | "revoke" }) =>
      api(`/admin/organization-onboarding-invitations/${id}/${action}`, {
        method: "POST",
        body: "{}",
      }),
    onSuccess: async (_data, variables) => {
      setInvitationMessage(
        variables.action === "resend"
          ? "Invitation resent."
          : "Invitation revoked.",
      );
      await client.invalidateQueries({
        queryKey: ["organization-onboarding-invitations"],
      });
    },
    onError: (error: Error) => setInvitationMessage(error.message),
  });
  const cards = [
    ["Organization reviews", data?.organizationsPending, "building"],
    ["Moderation reports", data?.moderationOpen, "security"],
    ["Routing reviews", data?.routingReviews, "map"],
    ["Resolution disputes", data?.resolutionDisputes, "people"],
    ["Processing failures", data?.processingFailures, "activity"],
    ["Merge and split cases", data?.mergeReviews, "document"],
  ] as const;
  return (
    <main className="page-container">
      <div className="page-heading">
        <div>
          <p className="kicker">CivicPulse operations</p>
          <h1>Admin overview</h1>
          <p>
            Review queues, high-risk accountability problems and system
            processing health.
          </p>
        </div>
      </div>
      {query.error && (
        <div className="form-message" role="alert">
          Administrator access is required for this workspace.
        </div>
      )}
      <section className="metric-grid">
        {cards.map(([label, value, icon]) => (
          <article className="metric-card" key={label}>
            <span>
              <Icon name={icon} />
            </span>
            <p>{label}</p>
            <strong>{value ?? "—"}</strong>
            <small>Open items</small>
          </article>
        ))}
      </section>
      <section className="operations-grid">
        <article className="operations-panel">
          <div className="panel-heading">
            <div>
              <p className="kicker">Priority queue</p>
              <h2>What needs attention now</h2>
            </div>
          </div>
          <div className="queue-row">
            <span className="status-dot status-dot--warning" />
            <div>
              <strong>Routing and jurisdiction review</strong>
              <small>
                Cases stay unpublished until responsibility can be resolved
                safely.
              </small>
            </div>
            <span>{data?.routingReviews ?? 0}</span>
          </div>
          <div className="queue-row">
            <span className="status-dot status-dot--danger" />
            <div>
              <strong>Community-disputed resolutions</strong>
              <small>
                Official status remains visible while follow-up is reviewed.
              </small>
            </div>
            <span>{data?.resolutionDisputes ?? 0}</span>
          </div>
          <div className="queue-row">
            <span className="status-dot" />
            <div>
              <strong>Organization verification</strong>
              <small>
                Mandate sources and operational identity require review.
              </small>
            </div>
            <span>{data?.organizationsPending ?? 0}</span>
          </div>
        </article>
        <article className="operations-panel map-panel">
          <div className="panel-heading">
            <div>
              <p className="kicker">National review surface</p>
              <h2>Nigeria</h2>
            </div>
          </div>
          <img
            src="/brand/nigeria-grid.svg"
            alt="Nigeria operational review map"
          />
          <p>
            Jurisdiction geometry appears when licensed boundary data is
            available. All map tasks retain a list alternative.
          </p>
        </article>
      </section>
      <section className="operations-grid">
        <article className="operations-panel">
          <div className="panel-heading">
            <div>
              <p className="kicker">Controlled access</p>
              <h2>Invite an organization</h2>
            </div>
          </div>
          <form
            className="form-card"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              invite.mutate({
                organizationName: form.get("organizationName"),
                email: form.get("email"),
                kind: form.get("kind"),
              });
            }}
          >
            <label>
              Organization name
              <input name="organizationName" required minLength={2} />
            </label>
            <label>
              Administrator email
              <input name="email" type="email" required />
            </label>
            <label>
              Organization type
              <select name="kind">
                <option value="GOVERNMENT">Government</option>
                <option value="NGO">NGO / civil society</option>
              </select>
            </label>
            {invitationMessage && (
              <p className="form-message" role="status">
                {invitationMessage}
              </p>
            )}
            <button
              className="button button--primary"
              disabled={invite.isPending}
            >
              {invite.isPending ? "Sending…" : "Send secure invitation"}
            </button>
          </form>
        </article>
        <article className="operations-panel">
          <div className="panel-heading">
            <div>
              <p className="kicker">Invitation register</p>
              <h2>Recent access invitations</h2>
            </div>
          </div>
          {invitations.data?.length ? (
            <div className="queue-list">
              {invitations.data.map((item) => (
                <div className="queue-row" key={item.id}>
                  <span className="status-dot" />
                  <div>
                    <strong>{item.organization_name}</strong>
                    <small>
                      {item.email} · {item.kind}
                    </small>
                  </div>
                  <div className="button-row">
                    <span>{item.status}</span>
                    {item.status !== "ACCEPTED" && (
                      <>
                        <button
                          className="button button--quiet"
                          onClick={() =>
                            invitationAction.mutate({
                              id: item.id,
                              action: "resend",
                            })
                          }
                        >
                          Resend
                        </button>
                        {item.status === "PENDING" && (
                          <button
                            className="button button--quiet"
                            onClick={() =>
                              invitationAction.mutate({
                                id: item.id,
                                action: "revoke",
                              })
                            }
                          >
                            Revoke
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No organization invitations have been sent yet.</p>
          )}
        </article>
      </section>
    </main>
  );
}
