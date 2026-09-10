import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { MentionTextarea } from "../../components/MentionTextarea";
type Incident = {
  public_reference: string;
  title: string;
  summary: string;
  category: string;
  official_status: string;
  community_verification_status: string;
  affected_count: number;
  viewer_affected: boolean;
  viewer_confirms: boolean;
  viewer_follows: boolean;
  organizations?: Array<{
    id: string;
    name: string;
    kind: string;
    verified: boolean;
    reason?: string;
  }>;
};
type Event = {
  id: string;
  event_type: string;
  title: string;
  body?: string;
  created_at: string;
};
type Evidence = {
  id: string;
  kind: string;
  description?: string;
  resource_type?: string;
  mime_type?: string;
  public_derivative_url: string;
  created_at: string;
};
type Comment = {
  id: string;
  body: string;
  author_user_id: string;
  created_at: string;
  edit_window_open: boolean;
  display_name: string;
  organization_name?: string;
  organization_verified?: boolean;
  parent_comment_id?: string;
};
export default function IncidentDetailPage() {
  const { id = "" } = useParams(),
    qc = useQueryClient();
  const navigate = useNavigate();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: { id: string } }>("/auth/me"),
    retry: false,
  });
  const incident = useQuery({
      queryKey: ["incident", id],
      queryFn: () => api<Incident>(`/incidents/${id}`),
    }),
    timeline = useQuery({
      queryKey: ["timeline", id],
      queryFn: () => api<Event[]>(`/incidents/${id}/timeline`),
    }),
    evidence = useQuery({
      queryKey: ["evidence", id],
      queryFn: () => api<Evidence[]>(`/incidents/${id}/evidence`),
    }),
    comments = useQuery({
      queryKey: ["comments", id],
      queryFn: () => api<Comment[]>(`/incidents/${id}/comments`),
    });
  const action = useMutation({
    mutationFn: ({
      path,
      method = "PUT",
      body,
    }: {
      path: string;
      method?: string;
      body?: unknown;
    }) =>
      api(`/incidents/${id}/${path}`, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incident", id] });
      qc.invalidateQueries({ queryKey: ["comments", id] });
    },
  });
  const evidenceDraft = useMutation({
    mutationFn: () =>
      api<{ id: string }>(`/incidents/${id}/evidence-drafts`, {
        method: "POST",
        body: "{}",
      }),
    onSuccess: (draft) => navigate(`/report?draft=${draft.id}`),
  });
  const abuse = useMutation({
    mutationFn: (target: {
      targetType: "INCIDENT" | "COMMENT";
      targetId: string;
    }) =>
      api("/moderation/reports", {
        method: "POST",
        body: JSON.stringify({ ...target, reason: "MISLEADING" }),
      }),
  });
  if (incident.isLoading)
    return <main className="route-shell">Loading incident…</main>;
  if (!incident.data)
    return (
      <main className="route-shell">
        <p role="alert">{incident.error?.message}</p>
      </main>
    );
  const i = incident.data;
  const comment = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget,
      data = new FormData(form);
    action.mutate({
      path: "comments",
      method: "POST",
      body: {
        body: data.get("body"),
        mentionedOrganizationIds: JSON.parse(
          String(data.get("mentionedOrganizationIds") ?? "[]"),
        ),
      },
    });
    form.reset();
  };
  return (
    <main className="min-h-screen px-6 py-12 lg:px-[8vw]">
      <p className="eyebrow signal">
        {i.public_reference} / {i.category}
      </p>
      <h1 className="my-6 text-5xl font-black uppercase leading-[.88] tracking-[-.06em] md:text-8xl">
        {i.title}
      </h1>
      <p className="lede">{i.summary}</p>
      <div className="my-8 grid border-4 border-black md:grid-cols-2">
        <div className="p-6">
          <p className="eyebrow">Official status</p>
          <strong className="text-2xl">
            {i.official_status.replaceAll("_", " ")}
          </strong>
        </div>
        <div className="border-t-4 border-black p-6 md:border-l-4 md:border-t-0">
          <p className="eyebrow">Community verification</p>
          <strong className="text-2xl">
            {i.community_verification_status.replaceAll("_", " ")}
          </strong>
        </div>
      </div>
      <div className="actions">
        <button
          className="button"
          onClick={() =>
            action.mutate({ path: "reaction", body: { reaction: "UP" } })
          }
        >
          Upvote
        </button>
        <button
          className={`button ${i.viewer_confirms ? "button--ink" : ""}`}
          onClick={() =>
            action.mutate({
              path: "confirmation",
              method: i.viewer_confirms ? "DELETE" : "PUT",
            })
          }
        >
          {i.viewer_confirms ? "Confirmed" : "I can confirm"}
        </button>
        <button
          className="button"
          disabled={evidenceDraft.isPending}
          onClick={() => evidenceDraft.mutate()}
        >
          Add evidence
        </button>
        <button
          className="button"
          onClick={() =>
            action.mutate({ path: "reaction", body: { reaction: "DOWN" } })
          }
        >
          Downvote
        </button>
        <button
          className={`button ${i.viewer_affected ? "button--signal" : ""}`}
          onClick={() =>
            action.mutate({
              path: "affected",
              method: i.viewer_affected ? "DELETE" : "PUT",
            })
          }
        >
          I'm affected · {i.affected_count}
        </button>
        <button
          className={`button ${i.viewer_follows ? "button--ink" : ""}`}
          onClick={() =>
            action.mutate({
              path: "follow",
              method: i.viewer_follows ? "DELETE" : "PUT",
            })
          }
        >
          {i.viewer_follows ? "Following" : "Follow"}
        </button>
      </div>
      <p className="mt-3 text-sm">
        Votes show public interest; they never determine severity.
      </p>
      <button
        className="button mt-3"
        onClick={() => abuse.mutate({ targetType: "INCIDENT", targetId: id })}
      >
        Report incident
      </button>
      {["RESOLUTION_SUBMITTED", "RESOLVED"].includes(i.official_status) && (
        <section className="my-8 border-4 border-black p-6">
          <h2 className="text-3xl font-black uppercase">Verify the outcome</h2>
          <p>
            Connected and nearby citizens can confirm the resolution or submit a
            reasoned dispute. Official and community states remain separate.
          </p>
          <div className="actions">
            <button
              className="button button--ink"
              onClick={() =>
                action.mutate({
                  path: "resolution-verification",
                  body: { verdict: "CONFIRM" },
                })
              }
            >
              Confirm resolved
            </button>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              action.mutate({
                path: "resolution-verification",
                body: {
                  verdict: "DISPUTE",
                  note: new FormData(form).get("note"),
                },
              });
              form.reset();
            }}
          >
            <label>
              Why is the issue not resolved?
              <textarea name="note" required maxLength={2000} />
            </label>
            <button className="button">Dispute resolution</button>
          </form>
        </section>
      )}
      {(action.error || evidenceDraft.error) && (
        <p className="form-message" role="alert">
          {(action.error ?? evidenceDraft.error)?.message}
        </p>
      )}
      <section className="my-12 grid gap-10 lg:grid-cols-[5fr_7fr]">
        <div>
          <h2 className="text-3xl font-black uppercase">
            Assigned organizations
          </h2>
          {i.organizations?.map((o) => (
            <article className="border-b-2 border-black py-4" key={o.id}>
              <strong>
                {o.verified && "✓ VERIFIED "}
                {o.kind}: {o.name}
              </strong>
              <p>{o.reason}</p>
            </article>
          ))}
        </div>
        <div>
          <h2 className="text-3xl font-black uppercase">Public timeline</h2>
          {timeline.data?.map((e) => (
            <article className="border-l-4 border-black py-2 pl-5" key={e.id}>
              <p className="eyebrow signal">
                {new Date(e.created_at).toLocaleDateString()} / {e.event_type}
              </p>
              <h3 className="uppercase">{e.title}</h3>
              <p>{e.body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="my-12">
        <h2 className="text-3xl font-black uppercase">Approved evidence</h2>
        <div className="grid border-l-4 border-t-4 border-black md:grid-cols-2 lg:grid-cols-3">
          {evidence.data?.map((item) => (
            <figure
              className="border-b-4 border-r-4 border-black p-4"
              key={item.id}
            >
              {item.mime_type?.startsWith("image/") ? (
                <img
                  src={item.public_derivative_url}
                  alt={item.description ?? "Moderated incident evidence"}
                />
              ) : item.mime_type?.startsWith("video/") ? (
                <video controls src={item.public_derivative_url} />
              ) : (
                <audio controls src={item.public_derivative_url} />
              )}
              <figcaption>
                <strong>{item.kind.replaceAll("_", " ")}</strong>
                {item.description && <p>{item.description}</p>}
              </figcaption>
            </figure>
          ))}
        </div>
        {!evidence.isLoading && !evidence.data?.length && (
          <p className="empty-state">
            No evidence has been approved for public display.
          </p>
        )}
      </section>
      <section className="max-w-3xl">
        <h2 className="text-3xl font-black uppercase">Public discussion</h2>
        <form onSubmit={comment}>
          <label>
            Comment
            <MentionTextarea
              name="body"
              required
              maxLength={2000}
              placeholder="Add useful context. Type @ to notify a verified organization."
            />
          </label>
          <button className="button button--ink" disabled={action.isPending}>
            Publish comment
          </button>
        </form>
        {comments.data?.map((c) => (
          <article
            key={c.id}
            className={`border-b-2 border-black py-4 ${c.parent_comment_id ? "ml-8" : ""}`}
          >
            <strong>
              {c.organization_verified && "✓ "}
              {c.organization_name ?? c.display_name}
            </strong>
            <p>{c.body}</p>
            {!c.parent_comment_id && !c.body.startsWith("[Deleted") && (
              <details>
                <summary>Reply</summary>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const data = new FormData(form);
                    action.mutate({
                      path: "comments",
                      method: "POST",
                      body: {
                        body: data.get("body"),
                        parentCommentId: c.id,
                        mentionedOrganizationIds: JSON.parse(
                          String(data.get("mentionedOrganizationIds") ?? "[]"),
                        ),
                      },
                    });
                    form.reset();
                  }}
                >
                  <label>
                    Reply
                    <MentionTextarea
                      name="body"
                      required
                      maxLength={2000}
                      placeholder="Reply or type @ to mention an organization."
                    />
                  </label>
                  <button className="button">Publish reply</button>
                </form>
              </details>
            )}
            <div className="actions">
              {me.data?.user.id === c.author_user_id &&
                c.edit_window_open &&
                !c.body.startsWith("[Deleted") && (
                  <button
                    className="button"
                    onClick={() => {
                      const body = window.prompt("Edit comment", c.body);
                      if (body?.trim())
                        action.mutate({
                          path: `comments/${c.id}`,
                          method: "PATCH",
                          body: { body },
                        });
                    }}
                  >
                    Edit
                  </button>
                )}
              {me.data?.user.id === c.author_user_id &&
                !c.body.startsWith("[Deleted") && (
                  <button
                    className="button"
                    onClick={() =>
                      action.mutate({
                        path: `comments/${c.id}`,
                        method: "DELETE",
                      })
                    }
                  >
                    Delete
                  </button>
                )}
              <button
                className="button"
                onClick={() =>
                  abuse.mutate({ targetType: "COMMENT", targetId: c.id })
                }
              >
                Report
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
