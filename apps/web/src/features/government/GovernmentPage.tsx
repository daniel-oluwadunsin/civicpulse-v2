import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { api } from "../../lib/api";
import { Icon } from "../../app/icons";

type Membership = {
  id: string;
  kind: string;
  role: string;
  display_name?: string;
  official_name?: string;
};
type IncidentSummary = {
  id: string;
  public_reference: string;
  title: string;
  category: string;
  official_status: string;
  community_verification_status: string;
  role: string;
};
type IncidentDetail = IncidentSummary & {
  latitude: number;
  longitude: number;
  reports: Array<{
    id: string;
    title?: string;
    summary?: string;
    observations?: string[];
  }>;
  routingDecisions: Array<{
    rationale: string;
    primary_confidence: number;
    review_required: boolean;
  }>;
  evidence: Array<{ id: string; kind: string; moderation_status: string }>;
  statusHistory: Array<{
    id: string;
    from_status?: string;
    to_status: string;
    reason?: string;
  }>;
  interventions: Array<{
    id: string;
    status: string;
    organization_name: string;
    physical_work: boolean;
    intervention_types: string[];
  }>;
};

export default function GovernmentPage() {
  const qc = useQueryClient();
  const [chosenOrg, setChosenOrg] = useState("");
  const [chosenIncident, setChosenIncident] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string>();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ organizations: Membership[] }>("/auth/me"),
    retry: false,
  });
  const organizations =
    me.data?.organizations.filter((item) => item.kind === "GOVERNMENT") ?? [];
  const organizationId = chosenOrg || organizations[0]?.id || "";
  const membership = organizations.find((item) => item.id === organizationId);
  const incidents = useQuery({
    queryKey: ["government-incidents", organizationId],
    queryFn: () =>
      api<IncidentSummary[]>(
        `/government/incidents?organizationId=${organizationId}`,
      ),
    enabled: Boolean(organizationId),
  });
  const detail = useQuery({
    queryKey: ["government-incident", organizationId, chosenIncident],
    queryFn: () =>
      api<IncidentDetail>(
        `/government/incidents/${chosenIncident}?organizationId=${organizationId}`,
      ),
    enabled: Boolean(organizationId && chosenIncident),
  });
  const action = useMutation({
    mutationFn: (input: { path: string; body?: Record<string, unknown> }) =>
      api(`/government/${input.path}`, {
        method: "POST",
        body: JSON.stringify({ organizationId, ...(input.body ?? {}) }),
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: ["government-incidents", organizationId],
        }),
        qc.invalidateQueries({
          queryKey: ["government-incident", organizationId, chosenIncident],
        }),
        qc.invalidateQueries({
          queryKey: ["government-approvals", organizationId],
        }),
        qc.invalidateQueries({
          queryKey: ["government-coordination", organizationId],
        }),
      ]);
    },
  });
  const submit = (
    event: FormEvent<HTMLFormElement>,
    path: string,
    values: (data: FormData) => Record<string, unknown>,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    action.mutate({ path, body: values(new FormData(form)) });
    form.reset();
  };
  const openEvidence = useMutation({
    mutationFn: (evidenceId: string) =>
      api<{ url: string }>(
        `/government/evidence/${evidenceId}/delivery?organizationId=${organizationId}`,
      ),
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
  });
  const manager =
    membership?.role === "MANAGER" || membership?.role === "ORG_ADMIN";
  const approvals = useQuery({
    queryKey: ["government-approvals", organizationId],
    queryFn: () =>
      api<
        Array<{
          id: string;
          approval_type: string;
          status: string;
          incident_title: string;
          ngo_name: string;
          required_documents: string[];
        }>
      >(`/government/intervention-approvals?organizationId=${organizationId}`),
    enabled: Boolean(organizationId && manager),
  });
  const coordination = useQuery({
    queryKey: ["government-coordination", organizationId],
    queryFn: () =>
      api<
        Array<{
          id: string;
          title: string;
          status: string;
          reason: string;
          requesting_organization_name: string;
        }>
      >(`/government/coordination?organizationId=${organizationId}`),
    enabled: Boolean(organizationId && manager),
  });
  const uploadEvidence = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const data = new FormData(formElement);
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
      return setUploadMessage("Choose an image, audio, or video file.");
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
      }>(`/government/incidents/${chosenIncident}/evidence/sign-upload`, {
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
        throw new Error("Cloudinary rejected the evidence upload.");
      const asset = (await response.json()) as { public_id: string };
      await api(`/government/incidents/${chosenIncident}/evidence/verify`, {
        method: "POST",
        body: JSON.stringify({
          organizationId,
          publicId: asset.public_id,
          resourceType: sign.resource_type,
          mediaKind,
          mimeType: file.type,
          evidenceKind: data.get("evidenceKind"),
          description: data.get("description") || undefined,
          visibility: data.get("visibility"),
        }),
      });
      setUploadMessage("Evidence verified and queued for moderation.");
      formElement.reset();
      await qc.invalidateQueries({
        queryKey: ["government-incident", organizationId, chosenIncident],
      });
    } catch (error) {
      setUploadMessage(
        error instanceof Error ? error.message : "Evidence upload failed.",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="min-h-screen px-6 py-12 lg:px-[8vw]">
      <div className="page-heading">
        <div>
          <p className="kicker">Government operations</p>
          <h1>Incident command</h1>
          <p>
            What needs attention, what is overdue, and where verified action
            must move next.
          </p>
        </div>
      </div>
      {organizations.length ? (
        <select
          aria-label="Government organization"
          value={organizationId}
          onChange={(event) => {
            setChosenOrg(event.target.value);
            setChosenIncident("");
          }}
        >
          {organizations.map((item) => (
            <option value={item.id} key={item.id}>
              {item.display_name ?? item.official_name ?? item.id} / {item.role}
            </option>
          ))}
        </select>
      ) : (
        <p className="form-message">
          A verified government membership is required.
        </p>
      )}
      <section className="metric-grid mt-6">
        <article className="metric-card">
          <span>
            <Icon name="document" />
          </span>
          <p>Assigned incidents</p>
          <strong>{incidents.data?.length ?? "—"}</strong>
          <small>Active responsibility</small>
        </article>
        <article className="metric-card">
          <span>
            <Icon name="notification" />
          </span>
          <p>Needs acknowledgement</p>
          <strong>
            {incidents.data?.filter((i) => i.official_status === "OPEN")
              .length ?? "—"}
          </strong>
          <small>New assignments</small>
        </article>
        <article className="metric-card">
          <span>
            <Icon name="activity" />
          </span>
          <p>In progress</p>
          <strong>
            {incidents.data?.filter((i) => i.official_status === "IN_PROGRESS")
              .length ?? "—"}
          </strong>
          <small>Operational work</small>
        </article>
        <article className="metric-card">
          <span>
            <Icon name="security" />
          </span>
          <p>Resolution review</p>
          <strong>
            {incidents.data?.filter(
              (i) => i.community_verification_status === "COMMUNITY_DISPUTED",
            ).length ?? "—"}
          </strong>
          <small>Community follow-up</small>
        </article>
      </section>
      <section className="operations-grid my-6">
        <article className="operations-panel map-panel">
          <div className="panel-heading">
            <div>
              <p className="kicker">Jurisdiction view</p>
              <h2>Nigeria incident coverage</h2>
            </div>
          </div>
          <img
            src="/brand/nigeria-grid.svg"
            alt="Nigeria government incident coverage map"
          />
          <p>
            Map signals are paired with the incident inbox below. Exact
            locations are available only to authorized operational members.
          </p>
        </article>
        <article className="operations-panel">
          <div className="panel-heading">
            <div>
              <p className="kicker">Triage</p>
              <h2>Attention queue</h2>
            </div>
          </div>
          <div className="queue-row">
            <span className="status-dot status-dot--warning" />
            <div>
              <strong>Open assignments</strong>
              <small>
                Acknowledge and establish the next operational state.
              </small>
            </div>
            <span>
              {incidents.data?.filter((i) => i.official_status === "OPEN")
                .length ?? 0}
            </span>
          </div>
          <div className="queue-row">
            <span className="status-dot status-dot--danger" />
            <div>
              <strong>Disputed resolutions</strong>
              <small>
                Respond, add evidence or reopen without hiding citizen verdicts.
              </small>
            </div>
            <span>
              {incidents.data?.filter(
                (i) => i.community_verification_status === "COMMUNITY_DISPUTED",
              ).length ?? 0}
            </span>
          </div>
        </article>
      </section>
      {manager && (
        <section className="my-8 grid gap-6 md:grid-cols-2">
          <div className="border-2 border-black p-4">
            <h2 className="text-2xl font-black uppercase">Approval inbox</h2>
            {approvals.data
              ?.filter((item) => item.status === "REQUIRED")
              .map((item) => (
                <article className="border-b-2 border-black py-3" key={item.id}>
                  <strong>
                    {item.approval_type} / {item.incident_title}
                  </strong>
                  <p>{item.ngo_name}</p>
                  <button
                    className="button"
                    onClick={() => {
                      const issuedDocumentPublicId = item.required_documents
                        .length
                        ? window.prompt("Verified approval document public ID")
                        : undefined;
                      if (
                        !item.required_documents.length ||
                        issuedDocumentPublicId
                      )
                        action.mutate({
                          path: `intervention-approvals/${item.id}/decision`,
                          body: {
                            decision: "SATISFIED",
                            issuedDocumentPublicId:
                              issuedDocumentPublicId || undefined,
                          },
                        });
                    }}
                  >
                    Satisfy approval
                  </button>
                  <button
                    className="button"
                    onClick={() =>
                      action.mutate({
                        path: `intervention-approvals/${item.id}/decision`,
                        body: {
                          decision: "REJECTED",
                          conditions: "Approval requirement was not satisfied.",
                        },
                      })
                    }
                  >
                    Reject
                  </button>
                </article>
              ))}
            {!approvals.data?.some((item) => item.status === "REQUIRED") && (
              <p>No pending approval requests.</p>
            )}
          </div>
          <div className="border-2 border-black p-4">
            <h2 className="text-2xl font-black uppercase">
              Coordination inbox
            </h2>
            {coordination.data
              ?.filter((item) => item.status === "PENDING")
              .map((item) => (
                <article className="border-b-2 border-black py-3" key={item.id}>
                  <strong>{item.title}</strong>
                  <p>
                    {item.requesting_organization_name}: {item.reason}
                  </p>
                  <button
                    className="button button--ink"
                    onClick={() =>
                      action.mutate({ path: `coordination/${item.id}/accept` })
                    }
                  >
                    Accept
                  </button>
                  <button
                    className="button"
                    onClick={() =>
                      action.mutate({ path: `coordination/${item.id}/decline` })
                    }
                  >
                    Decline
                  </button>
                </article>
              ))}
            {!coordination.data?.some((item) => item.status === "PENDING") && (
              <p>No pending coordination invitations.</p>
            )}
          </div>
        </section>
      )}

      <div className="mt-10 grid gap-8 lg:grid-cols-[4fr_8fr]">
        <section className="border-l-4 border-t-4 border-black">
          {incidents.data?.map((incident) => (
            <button
              key={incident.id}
              className={`block min-h-28 w-full border-b-4 border-r-4 border-black p-5 text-left ${chosenIncident === incident.id ? "bg-black text-white" : "bg-white"}`}
              onClick={() => setChosenIncident(incident.id)}
            >
              <span className="eyebrow">
                {incident.public_reference} / {incident.role}
              </span>
              <strong className="mt-2 block text-xl uppercase">
                {incident.title}
              </strong>
              <span>{incident.official_status.replaceAll("_", " ")}</span>
            </button>
          ))}
          {!incidents.isLoading && !incidents.data?.length && (
            <p className="empty-state">
              No assigned incidents match this organization.
            </p>
          )}
        </section>

        <section>
          {!chosenIncident && (
            <p className="empty-state">
              Select an assigned incident to inspect and update it.
            </p>
          )}
          {detail.isLoading && (
            <p className="form-message">Loading operational record…</p>
          )}
          {detail.data && (
            <>
              <p className="eyebrow">
                {detail.data.public_reference} / EXACT OPERATIONAL LOCATION
              </p>
              <h2 className="my-3 text-4xl font-black uppercase">
                {detail.data.title}
              </h2>
              <p>
                {detail.data.latitude}, {detail.data.longitude}
              </p>
              <p>
                <strong>Official:</strong> {detail.data.official_status} ·{" "}
                <strong>Community:</strong>{" "}
                {detail.data.community_verification_status}
              </p>
              <div className="actions my-5">
                <button
                  className="button button--ink"
                  disabled={detail.data.official_status !== "OPEN"}
                  onClick={() =>
                    action.mutate({
                      path: `incidents/${chosenIncident}/acknowledge`,
                    })
                  }
                >
                  Acknowledge
                </button>
                <button
                  className="button"
                  onClick={() =>
                    action.mutate({
                      path: `incidents/${chosenIncident}/routing-review`,
                      body: {
                        reason:
                          "Assignment requires mandate or ownership review.",
                      },
                    })
                  }
                >
                  Request routing review
                </button>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <form
                  className="border-2 border-black p-4"
                  onSubmit={uploadEvidence}
                >
                  <h3 className="uppercase">Upload operational evidence</h3>
                  <label>
                    Evidence category
                    <select name="evidenceKind">
                      <option>INSPECTION</option>
                      <option>PROGRESS</option>
                      <option>RESOLUTION</option>
                    </select>
                  </label>
                  <label>
                    Intended visibility
                    <select name="visibility">
                      <option>RESTRICTED</option>
                      <option>PUBLIC</option>
                    </select>
                  </label>
                  <label>
                    Description
                    <textarea name="description" maxLength={2000} />
                  </label>
                  <label>
                    Evidence file
                    <input
                      name="file"
                      type="file"
                      required
                      accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,audio/wav,audio/webm,video/mp4,video/webm,video/quicktime"
                    />
                  </label>
                  <button className="button" disabled={uploading}>
                    {uploading ? "Uploading…" : "Upload evidence"}
                  </button>
                  {uploadMessage && (
                    <p className="form-message" role="status">
                      {uploadMessage}
                    </p>
                  )}
                </form>
                <form
                  className="border-2 border-black p-4"
                  onSubmit={(event) =>
                    submit(
                      event,
                      `incidents/${chosenIncident}/status`,
                      (data) => ({
                        status: data.get("status"),
                        reason: data.get("reason") || undefined,
                      }),
                    )
                  }
                >
                  <h3 className="uppercase">Change official status</h3>
                  <label>
                    Status
                    <select name="status">
                      {[
                        "UNDER_REVIEW",
                        "IN_PROGRESS",
                        "BLOCKED",
                        "REJECTED_INVALID",
                        "RESOLVED",
                        "CLOSED",
                      ].map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Reason
                    <textarea name="reason" />
                  </label>
                  <button className="button" disabled={!manager}>
                    Apply valid transition
                  </button>
                </form>
                <form
                  className="border-2 border-black p-4"
                  onSubmit={(event) =>
                    submit(
                      event,
                      `incidents/${chosenIncident}/updates`,
                      (data) => ({
                        type: data.get("type"),
                        visibility: data.get("visibility"),
                        body: data.get("body"),
                      }),
                    )
                  }
                >
                  <h3 className="uppercase">Publish update</h3>
                  <label>
                    Type
                    <select name="type">
                      {[
                        "ACKNOWLEDGEMENT",
                        "INSPECTION_SCHEDULED",
                        "INSPECTION_COMPLETED",
                        "CLARIFICATION",
                        "WORK_PLANNED",
                        "DEPENDENCY",
                        "DELAY",
                        "WORK_STARTED",
                        "MILESTONE",
                        "GENERAL",
                      ].map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Visibility
                    <select name="visibility">
                      <option>PUBLIC</option>
                      <option>INTERNAL</option>
                    </select>
                  </label>
                  <label>
                    Update
                    <textarea name="body" required maxLength={6000} />
                  </label>
                  <button className="button">Publish update</button>
                </form>
                <form
                  className="border-2 border-black p-4"
                  onSubmit={(event) =>
                    submit(
                      event,
                      `incidents/${chosenIncident}/resolution`,
                      (data) => ({
                        statement: data.get("statement"),
                        completionDate: data.get("completionDate"),
                        evidenceIds: String(data.get("evidenceIds") ?? "")
                          .split(",")
                          .map((value) => value.trim())
                          .filter(Boolean),
                        exemptionReason:
                          data.get("exemptionReason") || undefined,
                      }),
                    )
                  }
                >
                  <h3 className="uppercase">Submit resolution</h3>
                  <label>
                    Resolution statement
                    <textarea name="statement" required minLength={10} />
                  </label>
                  <label>
                    Completion date
                    <input name="completionDate" type="date" required />
                  </label>
                  <label>
                    Approved evidence IDs, comma separated
                    <input name="evidenceIds" />
                  </label>
                  <label>
                    Audited exemption reason
                    <textarea name="exemptionReason" />
                  </label>
                  <button className="button button--ink" disabled={!manager}>
                    Submit resolution
                  </button>
                </form>
                <form
                  className="border-2 border-black p-4"
                  onSubmit={(event) =>
                    submit(
                      event,
                      `incidents/${chosenIncident}/supporting-organizations`,
                      (data) => ({
                        invitedOrganizationId: data.get("organizationId"),
                        reason: data.get("reason"),
                      }),
                    )
                  }
                >
                  <h3 className="uppercase">Invite supporting organization</h3>
                  <label>
                    Verified organization ID
                    <input name="organizationId" required />
                  </label>
                  <label>
                    Reason
                    <textarea name="reason" required minLength={5} />
                  </label>
                  <button className="button" disabled={!manager}>
                    Send invitation
                  </button>
                </form>
              </div>

              <section className="my-8">
                <h3 className="text-2xl font-black uppercase">
                  Citizen evidence aggregation
                </h3>
                {detail.data.reports.map((report) => (
                  <article
                    className="border-b-2 border-black py-3"
                    key={report.id}
                  >
                    <strong>{report.title ?? "Citizen report"}</strong>
                    <p>{report.summary}</p>
                    {report.observations?.length ? (
                      <p>Observed: {report.observations.join("; ")}</p>
                    ) : null}
                  </article>
                ))}
                {detail.data.evidence.map((item) => (
                  <button
                    className="button mr-2 mt-2"
                    key={item.id}
                    onClick={() => openEvidence.mutate(item.id)}
                  >
                    View {item.kind.toLowerCase()} evidence /{" "}
                    {item.moderation_status}
                  </button>
                ))}
              </section>
              <section className="my-8">
                <h3 className="text-2xl font-black uppercase">
                  NGO intervention review
                </h3>
                {detail.data.interventions.map((proposal) => (
                  <article
                    className="border-b-2 border-black py-4"
                    key={proposal.id}
                  >
                    <p className="eyebrow">
                      {proposal.organization_name} /{" "}
                      {proposal.status.replaceAll("_", " ")}
                    </p>
                    <p>
                      {proposal.intervention_types.join(", ")} ·{" "}
                      {proposal.physical_work
                        ? "Physical work—approvals required"
                        : "Non-physical support"}
                    </p>
                    <div className="actions">
                      {["SUBMITTED", "RESUBMITTED"].includes(
                        proposal.status,
                      ) && (
                        <button
                          className="button"
                          disabled={!manager}
                          onClick={() =>
                            action.mutate({
                              path: `interventions/${proposal.id}/review`,
                              body: { status: "UNDER_REVIEW" },
                            })
                          }
                        >
                          Begin review
                        </button>
                      )}
                      {proposal.status === "UNDER_REVIEW" && (
                        <>
                          <button
                            className="button button--ink"
                            disabled={!manager}
                            onClick={() =>
                              action.mutate({
                                path: `interventions/${proposal.id}/review`,
                                body: { status: "APPROVED_IN_PRINCIPLE" },
                              })
                            }
                          >
                            Approve in principle
                          </button>
                          <button
                            className="button"
                            disabled={!manager}
                            onClick={() => {
                              const reason = window.prompt("Required changes");
                              if (reason)
                                action.mutate({
                                  path: `interventions/${proposal.id}/review`,
                                  body: { status: "CHANGES_REQUESTED", reason },
                                });
                            }}
                          >
                            Request changes
                          </button>
                          <button
                            className="button"
                            disabled={!manager}
                            onClick={() => {
                              const reason = window.prompt("Rejection reason");
                              if (reason)
                                action.mutate({
                                  path: `interventions/${proposal.id}/review`,
                                  body: { status: "REJECTED", reason },
                                });
                            }}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {proposal.status === "AWAITING_APPROVALS" && (
                        <button
                          className="button button--signal"
                          disabled={!manager}
                          onClick={() =>
                            action.mutate({
                              path: `interventions/${proposal.id}/authorize`,
                            })
                          }
                        >
                          Authorize to commence
                        </button>
                      )}
                      {proposal.status === "COMPLETION_SUBMITTED" && (
                        <>
                          <button
                            className="button button--ink"
                            disabled={!manager}
                            onClick={() =>
                              action.mutate({
                                path: `interventions/${proposal.id}/inspection`,
                                body: {
                                  decision: "ACCEPTED",
                                  notes:
                                    "Inspected and accepted by the competent authority.",
                                },
                              })
                            }
                          >
                            Accept after inspection
                          </button>
                          <button
                            className="button"
                            disabled={!manager}
                            onClick={() => {
                              const notes = window.prompt(
                                "Required remediation",
                              );
                              if (notes)
                                action.mutate({
                                  path: `interventions/${proposal.id}/inspection`,
                                  body: {
                                    decision: "REMEDIATION_REQUIRED",
                                    notes,
                                  },
                                });
                            }}
                          >
                            Require remediation
                          </button>
                        </>
                      )}
                      {proposal.status === "ACCEPTED" && (
                        <button
                          className="button button--ink"
                          disabled={!manager}
                          onClick={() => {
                            const notes = window.prompt("Handover notes");
                            if (notes)
                              action.mutate({
                                path: `interventions/${proposal.id}/handover`,
                                body: { notes },
                              });
                          }}
                        >
                          Complete handover
                        </button>
                      )}
                    </div>
                    {proposal.status === "APPROVED_IN_PRINCIPLE" && (
                      <form
                        onSubmit={(event) =>
                          submit(
                            event,
                            `interventions/${proposal.id}/approvals`,
                            (data) => ({
                              authorityOrganizationId: data.get(
                                "authorityOrganizationId",
                              ),
                              approvalType: data.get("approvalType"),
                              reason: data.get("reason"),
                              requiredDocuments: String(
                                data.get("requiredDocuments") ?? "",
                              )
                                .split(",")
                                .map((value) => value.trim())
                                .filter(Boolean),
                            }),
                          )
                        }
                      >
                        <h4 className="uppercase">
                          Define required competent-authority approval
                        </h4>
                        <label>
                          Authority organization ID
                          <input name="authorityOrganizationId" required />
                        </label>
                        <label>
                          Approval type
                          <input name="approvalType" required />
                        </label>
                        <label>
                          Reason
                          <textarea name="reason" required />
                        </label>
                        <label>
                          Required documents, comma separated
                          <input name="requiredDocuments" />
                        </label>
                        <button className="button" disabled={!manager}>
                          Add approval requirement
                        </button>
                      </form>
                    )}
                  </article>
                ))}
                {!detail.data.interventions.length && (
                  <p className="empty-state">
                    No NGO intervention proposals for this incident.
                  </p>
                )}
              </section>
              <section className="my-8 grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="text-2xl font-black uppercase">
                    AI routing rationale
                  </h3>
                  {detail.data.routingDecisions.map((routing, index) => (
                    <article
                      className="border-b-2 border-black py-3"
                      key={index}
                    >
                      <p>{routing.rationale}</p>
                      <p>
                        Confidence: {routing.primary_confidence} · Review:{" "}
                        {String(routing.review_required)}
                      </p>
                    </article>
                  ))}
                </div>
                <div>
                  <h3 className="text-2xl font-black uppercase">
                    Status history
                  </h3>
                  {detail.data.statusHistory.map((history) => (
                    <article
                      className="border-b-2 border-black py-3"
                      key={history.id}
                    >
                      <strong>
                        {history.from_status ?? "CREATED"} → {history.to_status}
                      </strong>
                      <p>{history.reason}</p>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}
          {(incidents.error ||
            detail.error ||
            action.error ||
            openEvidence.error) && (
            <p className="form-message" role="alert">
              {
                (
                  incidents.error ??
                  detail.error ??
                  action.error ??
                  openEvidence.error
                )?.message
              }
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
