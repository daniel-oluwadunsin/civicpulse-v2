import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { api } from "../../lib/api";
import { Icon } from "../../app/icons";
type Me = {
  organizations: Array<{
    id: string;
    kind: string;
    role: string;
    display_name?: string;
    official_name?: string;
  }>;
};
type Issue = {
  id: string;
  public_reference: string;
  title: string;
  summary: string;
  category: string;
  official_status: string;
  lga_name?: string;
  affected_count: number;
  intervention_count: number;
};
type Proposal = {
  id: string;
  public_reference: string;
  incident_title: string;
  status: string;
  intervention_types: string[];
  physical_work: boolean;
  review_reason?: string;
  payload: {
    problemUnderstanding: string;
    proposedScope: string;
    requestedGovernmentAction: string;
    exclusions?: string[];
    risks?: string[];
  };
};
export default function NgoPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string>();
  const me = useQuery({
      queryKey: ["me"],
      queryFn: () => api<Me>("/auth/me"),
      retry: false,
    }),
    issues = useQuery({
      queryKey: ["ngo-issues"],
      queryFn: () => api<Issue[]>("/ngo/issues"),
    });
  const organizations =
      me.data?.organizations.filter((o) => o.kind === "NGO") ?? [],
    organizationId = selected || organizations[0]?.id || "";
  const membership = organizations.find((item) => item.id === organizationId);
  const manager =
    membership?.role === "MANAGER" || membership?.role === "ORG_ADMIN";
  const proposals = useQuery({
    queryKey: ["ngo-interventions", organizationId],
    queryFn: () =>
      api<Proposal[]>(`/ngo/interventions?organizationId=${organizationId}`),
    enabled: Boolean(organizationId),
  });
  const interest = useMutation({
    mutationFn: (incidentId: string) =>
      api(`/ngo/issues/${incidentId}/interest`, {
        method: "PUT",
        body: JSON.stringify({
          organizationId,
          participationTypes: ["COMMUNITY_SUPPORT"],
          visibility: "PUBLIC",
          note: "We would like to assess how our verified capacity can support this issue.",
        }),
      }),
  });
  const propose = useMutation({
    mutationFn: (p: unknown) =>
      api("/ngo/interventions", { method: "POST", body: JSON.stringify(p) }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["ngo-interventions", organizationId] }),
  });
  const lifecycle = useMutation({
    mutationFn: (input: {
      proposalId: string;
      action: string;
      body?: Record<string, unknown>;
    }) =>
      api(`/ngo/interventions/${input.proposalId}/${input.action}`, {
        method: "POST",
        body: JSON.stringify({ organizationId, ...(input.body ?? {}) }),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["ngo-interventions", organizationId] }),
  });
  const updateProposal = useMutation({
    mutationFn: (input: { proposalId: string; payload: Proposal["payload"] }) =>
      api(`/ngo/interventions/${input.proposalId}`, {
        method: "PATCH",
        body: JSON.stringify({ organizationId, payload: input.payload }),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["ngo-interventions", organizationId] }),
  });
  const create = (e: FormEvent<HTMLFormElement>, incidentId: string) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    propose.mutate({
      organizationId,
      incidentId,
      interventionTypes: [d.get("type")],
      physicalWork: d.get("physicalWork") === "on",
      payload: {
        problemUnderstanding: d.get("understanding"),
        proposedScope: d.get("scope"),
        requestedGovernmentAction: d.get("governmentAction"),
      },
    });
  };
  const uploadDocument = async (
    event: FormEvent<HTMLFormElement>,
    proposalId: string,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) return;
    const mediaKind = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("audio/")
        ? "audio"
        : file.type.startsWith("video/")
          ? "video"
          : null;
    if (!mediaKind)
      return setMessage("Choose an image, audio, or video document.");
    setUploading(true);
    try {
      const sign = await api<{
        timestamp: number;
        folder: string;
        resource_type: "image" | "video";
        context: string;
        signature: string;
        apiKey: string;
        cloudName: string;
      }>(`/ngo/interventions/${proposalId}/documents/sign-upload`, {
        method: "POST",
        body: JSON.stringify({
          organizationId,
          mediaKind,
          mimeType: file.type,
          bytes: file.size,
        }),
      });
      const upload = new FormData();
      upload.set("file", file);
      upload.set("timestamp", String(sign.timestamp));
      upload.set("folder", sign.folder);
      upload.set("context", sign.context);
      upload.set("type", "authenticated");
      upload.set("signature", sign.signature);
      upload.set("api_key", sign.apiKey);
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${sign.cloudName}/${sign.resource_type}/upload`,
        { method: "POST", body: upload },
      );
      if (!response.ok)
        throw new Error("Cloudinary rejected the document upload.");
      const asset = (await response.json()) as { public_id: string };
      await api(`/ngo/interventions/${proposalId}/documents/verify`, {
        method: "POST",
        body: JSON.stringify({
          organizationId,
          publicId: asset.public_id,
          resourceType: sign.resource_type,
          mediaKind,
          mimeType: file.type,
          documentType: data.get("documentType"),
          title: data.get("title"),
          visibility: data.get("visibility"),
        }),
      });
      setMessage("Intervention document verified and retained for review.");
      form.reset();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Document upload failed.",
      );
    } finally {
      setUploading(false);
    }
  };
  return (
    <main className="min-h-screen px-6 py-12 lg:px-[8vw]">
      <div className="page-heading">
        <div>
          <p className="kicker">NGO operations</p>
          <h1>Discover civic needs</h1>
          <p>
            Expressing interest never claims a public asset. Physical work
            starts only after competent approvals are recorded.
          </p>
        </div>
      </div>
      {organizations.length ? (
        <select
          aria-label="NGO organization"
          value={organizationId}
          onChange={(e) => setSelected(e.target.value)}
        >
          {organizations.map((o) => (
            <option value={o.id} key={o.id}>
              {o.display_name ?? o.official_name ?? o.id} / {o.role}
            </option>
          ))}
        </select>
      ) : (
        <p className="form-message">
          A verified NGO membership is required to express interest or propose
          work.
        </p>
      )}
      <section className="metric-grid mt-6">
        <article className="metric-card">
          <span>
            <Icon name="search" />
          </span>
          <p>Relevant public issues</p>
          <strong>{issues.data?.length ?? "—"}</strong>
          <small>Discovery results</small>
        </article>
        <article className="metric-card">
          <span>
            <Icon name="document" />
          </span>
          <p>Active proposals</p>
          <strong>
            {proposals.data?.filter(
              (p) => !["ACCEPTED", "WITHDRAWN", "REJECTED"].includes(p.status),
            ).length ?? "—"}
          </strong>
          <small>Across review stages</small>
        </article>
        <article className="metric-card">
          <span>
            <Icon name="shield" />
          </span>
          <p>Awaiting approvals</p>
          <strong>
            {proposals.data?.filter((p) => p.status === "AWAITING_APPROVALS")
              .length ?? "—"}
          </strong>
          <small>Competent authorities</small>
        </article>
        <article className="metric-card">
          <span>
            <Icon name="building" />
          </span>
          <p>Authorized work</p>
          <strong>
            {proposals.data?.filter((p) =>
              ["AUTHORIZED_TO_COMMENCE", "IN_PROGRESS"].includes(p.status),
            ).length ?? "—"}
          </strong>
          <small>Legitimate interventions</small>
        </article>
      </section>
      <section className="operations-grid my-6">
        <article className="operations-panel map-panel">
          <div className="panel-heading">
            <div>
              <p className="kicker">Discovery geography</p>
              <h2>Civic needs across Nigeria</h2>
            </div>
          </div>
          <img
            src="/brand/nigeria-grid.svg"
            alt="Nigeria NGO issue discovery map"
          />
          <p>
            Discovery follows verified capability and geography, with a complete
            issue-list alternative below.
          </p>
        </article>
        <article className="operations-panel">
          <div className="panel-heading">
            <div>
              <p className="kicker">Intervention health</p>
              <h2>Work that needs action</h2>
            </div>
          </div>
          <div className="queue-row">
            <span className="status-dot status-dot--warning" />
            <div>
              <strong>Approvals waiting</strong>
              <small>NGOs cannot authorize their own commencement.</small>
            </div>
            <span>
              {proposals.data?.filter((p) => p.status === "AWAITING_APPROVALS")
                .length ?? 0}
            </span>
          </div>
          <div className="queue-row">
            <span className="status-dot" />
            <div>
              <strong>Completion and handover</strong>
              <small>
                Evidence, inspection and acceptance remain traceable.
              </small>
            </div>
            <span>
              {proposals.data?.filter((p) =>
                ["COMPLETION_SUBMITTED", "INSPECTION", "ACCEPTED"].includes(
                  p.status,
                ),
              ).length ?? 0}
            </span>
          </div>
        </article>
      </section>
      <section className="mt-10 grid gap-0 border-l-4 border-t-4 border-black lg:grid-cols-2">
        {issues.data?.map((i) => (
          <article
            className="border-b-4 border-r-4 border-black p-6"
            key={i.id}
          >
            <p className="eyebrow">
              {i.public_reference} / {i.category} /{" "}
              {i.lga_name ?? "AREA REVIEW"}
            </p>
            <h2 className="my-5 text-3xl font-black uppercase">{i.title}</h2>
            <p>{i.summary}</p>
            <p>
              {i.affected_count} affected · {i.intervention_count} active
              interventions
            </p>
            <button
              className="button button--ink"
              disabled={!organizationId || interest.isPending}
              onClick={() => interest.mutate(i.id)}
            >
              Express interest
            </button>
            <details className="mt-4 border-2 border-black p-4">
              <summary className="cursor-pointer font-bold uppercase">
                Propose intervention
              </summary>
              <form onSubmit={(e) => create(e, i.id)}>
                <label>
                  Type
                  <select name="type">
                    {[
                      "FUND",
                      "CO_FUND",
                      "EXECUTE",
                      "FUND_AND_EXECUTE",
                      "MATERIALS",
                      "TECHNICAL_ASSISTANCE",
                      "COMMUNITY_SUPPORT",
                      "MONITORING",
                      "ADVOCACY",
                    ].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Problem understanding
                  <textarea name="understanding" required />
                </label>
                <label>
                  Proposed scope
                  <textarea name="scope" required />
                </label>
                <label>
                  Requested government action
                  <textarea name="governmentAction" required />
                </label>
                <label>
                  <input type="checkbox" name="physicalWork" /> Includes
                  physical work
                </label>
                <button
                  className="button"
                  disabled={!organizationId || propose.isPending}
                >
                  Save proposal draft
                </button>
              </form>
            </details>
          </article>
        ))}
      </section>
      <section className="my-12">
        <p className="eyebrow signal">YOUR NGO / INTERVENTION WORKSPACE</p>
        <h2 className="my-5 text-4xl font-black uppercase">
          Proposals and delivery
        </h2>
        <div className="border-l-4 border-t-4 border-black">
          {proposals.data?.map((proposal) => (
            <article
              className="border-b-4 border-r-4 border-black p-6"
              key={proposal.id}
            >
              <p className="eyebrow">
                {proposal.public_reference} /{" "}
                {proposal.status.replaceAll("_", " ")}
              </p>
              <h3 className="text-2xl font-black uppercase">
                {proposal.incident_title}
              </h3>
              <p>
                {proposal.intervention_types.join(", ")} ·{" "}
                {proposal.physical_work
                  ? "Physical work"
                  : "Non-physical support"}
              </p>
              {proposal.review_reason && (
                <p className="form-message">
                  Review note: {proposal.review_reason}
                </p>
              )}
              {["DRAFT", "CHANGES_REQUESTED"].includes(proposal.status) && (
                <details className="my-4 border-2 border-black p-4">
                  <summary className="cursor-pointer font-bold uppercase">
                    Edit proposal scope
                  </summary>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      updateProposal.mutate({
                        proposalId: proposal.id,
                        payload: {
                          problemUnderstanding: String(
                            data.get("understanding"),
                          ),
                          proposedScope: String(data.get("scope")),
                          requestedGovernmentAction: String(
                            data.get("governmentAction"),
                          ),
                          exclusions: [],
                          risks: [],
                        },
                      });
                    }}
                  >
                    <label>
                      Problem understanding
                      <textarea
                        name="understanding"
                        defaultValue={proposal.payload.problemUnderstanding}
                        required
                        minLength={10}
                      />
                    </label>
                    <label>
                      Proposed scope
                      <textarea
                        name="scope"
                        defaultValue={proposal.payload.proposedScope}
                        required
                        minLength={10}
                      />
                    </label>
                    <label>
                      Requested government action
                      <textarea
                        name="governmentAction"
                        defaultValue={
                          proposal.payload.requestedGovernmentAction
                        }
                        required
                        minLength={5}
                      />
                    </label>
                    <button className="button">Save revision</button>
                  </form>
                </details>
              )}
              <div className="actions">
                {proposal.status === "DRAFT" && (
                  <button
                    className="button button--ink"
                    disabled={!manager}
                    onClick={() =>
                      lifecycle.mutate({
                        proposalId: proposal.id,
                        action: "submit",
                      })
                    }
                  >
                    Submit proposal
                  </button>
                )}
                {proposal.status === "CHANGES_REQUESTED" && (
                  <button
                    className="button button--ink"
                    disabled={!manager}
                    onClick={() =>
                      lifecycle.mutate({
                        proposalId: proposal.id,
                        action: "resubmit",
                      })
                    }
                  >
                    Resubmit changes
                  </button>
                )}
                {proposal.status === "AUTHORIZED_TO_COMMENCE" && (
                  <button
                    className="button button--signal"
                    disabled={!manager}
                    onClick={() =>
                      lifecycle.mutate({
                        proposalId: proposal.id,
                        action: "start",
                      })
                    }
                  >
                    Start authorized work
                  </button>
                )}
                {[
                  "DRAFT",
                  "SUBMITTED",
                  "CHANGES_REQUESTED",
                  "RESUBMITTED",
                ].includes(proposal.status) && (
                  <button
                    className="button"
                    disabled={!manager}
                    onClick={() =>
                      lifecycle.mutate({
                        proposalId: proposal.id,
                        action: "withdraw",
                      })
                    }
                  >
                    Withdraw
                  </button>
                )}
              </div>
              <details className="mt-4 border-2 border-black p-4">
                <summary className="cursor-pointer font-bold uppercase">
                  Add proposal document or evidence
                </summary>
                <form onSubmit={(event) => uploadDocument(event, proposal.id)}>
                  <label>
                    Document type
                    <select name="documentType">
                      <option>PROPOSAL</option>
                      <option>TECHNICAL</option>
                      <option>FINANCE</option>
                      <option>CONTRACT</option>
                      <option>APPROVAL</option>
                      <option>MILESTONE</option>
                    </select>
                  </label>
                  <label>
                    Title
                    <input name="title" required minLength={2} />
                  </label>
                  <label>
                    Visibility
                    <select name="visibility">
                      <option>RESTRICTED</option>
                      <option>PUBLIC</option>
                    </select>
                  </label>
                  <label>
                    File
                    <input
                      name="file"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,audio/wav,audio/webm,video/mp4,video/webm,video/quicktime"
                      required
                    />
                  </label>
                  <button className="button" disabled={uploading}>
                    {uploading ? "Uploading…" : "Upload document"}
                  </button>
                </form>
              </details>
              {proposal.status === "IN_PROGRESS" && (
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      const data = new FormData(form);
                      lifecycle.mutate({
                        proposalId: proposal.id,
                        action: "milestones",
                        body: {
                          title: data.get("title"),
                          details: data.get("details"),
                          dueDate: data.get("dueDate") || undefined,
                        },
                      });
                      form.reset();
                    }}
                  >
                    <h4 className="uppercase">Record milestone</h4>
                    <label>
                      Title
                      <input name="title" required minLength={3} />
                    </label>
                    <label>
                      Details
                      <textarea name="details" />
                    </label>
                    <label>
                      Due date
                      <input name="dueDate" type="date" />
                    </label>
                    <button className="button">Publish milestone</button>
                  </form>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      const data = new FormData(form);
                      lifecycle.mutate({
                        proposalId: proposal.id,
                        action: "completion",
                        body: {
                          statement: data.get("statement"),
                          payload: { handoverNotes: data.get("handoverNotes") },
                        },
                      });
                    }}
                  >
                    <h4 className="uppercase">Submit completion</h4>
                    <label>
                      Completion statement
                      <textarea name="statement" required minLength={10} />
                    </label>
                    <label>
                      Handover notes
                      <textarea name="handoverNotes" />
                    </label>
                    <button className="button button--ink" disabled={!manager}>
                      Send for inspection
                    </button>
                  </form>
                </div>
              )}
            </article>
          ))}
          {!proposals.isLoading && !proposals.data?.length && (
            <p className="empty-state">No intervention proposals yet.</p>
          )}
        </div>
        {message && (
          <p className="form-message" role="status">
            {message}
          </p>
        )}
        {(proposals.error ||
          lifecycle.error ||
          updateProposal.error ||
          propose.error ||
          interest.error) && (
          <p className="form-message" role="alert">
            {
              (
                proposals.error ??
                lifecycle.error ??
                updateProposal.error ??
                propose.error ??
                interest.error
              )?.message
            }
          </p>
        )}
      </section>
    </main>
  );
}
