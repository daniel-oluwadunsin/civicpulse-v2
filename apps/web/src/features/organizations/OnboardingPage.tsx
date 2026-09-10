import { useMutation, useQuery } from "@tanstack/react-query";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
const lines = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
export function OnboardingPage() {
  const [params] = useSearchParams();
  const invitationToken = params.get("token");
  const [fallbackKind] = useState<"GOVERNMENT" | "NGO">(() =>
    localStorage.getItem("civicpulse:onboarding-kind") === "NGO"
      ? "NGO"
      : "GOVERNMENT",
  );
  const [step, setStep] = useState(1);
  const [organizationId, setOrganizationId] = useState<string | undefined>(
    () => localStorage.getItem("civicpulse:onboarding-id") ?? undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [logoFile, setLogoFile] = useState<File>();
  const [logoPreview, setLogoPreview] = useState<string>();
  const [message, setMessage] = useState<string>();
  const invitation = useQuery({
    queryKey: ["organization-onboarding-invitation", invitationToken],
    queryFn: () =>
      api<{
        email: string;
        kind: "GOVERNMENT" | "NGO";
        organizationName: string;
        status: string;
        expiresAt: string;
      }>(`/organization-invitations/${invitationToken}`),
    enabled: Boolean(invitationToken),
    retry: false,
  });
  const kind = invitation.data?.kind ?? fallbackKind;
  const options = useQuery({
    queryKey: ["organization-onboarding-options"],
    queryFn: () =>
      api<{
        jurisdictions: Array<{ id: string; name: string; type: string }>;
        organizations: Array<{ id: string; name: string }>;
      }>("/organizations/onboarding-options"),
    retry: false,
  });
  async function uploadLogo(organization: string, file: File) {
    const sign = await api<{
      timestamp: number;
      folder: string;
      resource_type: string;
      context: string;
      signature: string;
      apiKey: string;
      cloudName: string;
    }>(`/organizations/${organization}/logo/sign-upload`, {
      method: "POST",
      body: JSON.stringify({ mimeType: file.type, bytes: file.size }),
    });
    const form = new FormData();
    form.set("file", file);
    form.set("timestamp", String(sign.timestamp));
    form.set("folder", sign.folder);
    form.set("context", sign.context);
    form.set("type", "authenticated");
    form.set("signature", sign.signature);
    form.set("api_key", sign.apiKey);
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${sign.cloudName}/${sign.resource_type}/upload`,
      { method: "POST", body: form },
    );
    if (!response.ok)
      throw new Error("The logo upload could not be completed.");
    const asset = (await response.json()) as { public_id: string };
    await api(`/organizations/${organization}/logo/verify`, {
      method: "POST",
      body: JSON.stringify({ publicId: asset.public_id, mimeType: file.type }),
    });
  }
  const save = useMutation({
    mutationFn: async (payload: unknown) => {
      if (!invitationToken)
        throw new Error(
          "A valid CivicPulse organization invitation is required.",
        );
      await api(`/organization-invitations/${invitationToken}/accept`, {
        method: "POST",
        body: "{}",
      });
      return api<{ id: string }>("/organizations", {
        method: "POST",
        body: JSON.stringify({
          ...(payload as Record<string, unknown>),
          invitationToken,
        }),
      });
    },
    onSuccess: async (result) => {
      setOrganizationId(result.id);
      localStorage.setItem("civicpulse:onboarding-id", result.id);
      if (logoFile) await uploadLogo(result.id, logoFile);
      setMessage(
        "Organization draft and identity details saved. Review them, then submit for CivicPulse verification.",
      );
    },
    onError: (error: Error) => setMessage(error.message),
  });
  const submitForReview = useMutation({
    mutationFn: () =>
      api<void>(`/organizations/${organizationId}`, {
        method: "PATCH",
        body: JSON.stringify({ submit: true }),
      }),
    onSuccess: () => {
      localStorage.removeItem("civicpulse:onboarding-draft");
      localStorage.removeItem("civicpulse:onboarding-id");
      setMessage("Organization profile submitted for CivicPulse verification.");
    },
    onError: (error: Error) => setMessage(error.message),
  });
  useEffect(() => {
    const saved = localStorage.getItem("civicpulse:onboarding-draft");
    if (!saved || !formRef.current) return;
    const values = JSON.parse(saved) as Record<string, string>;
    for (const element of Array.from(formRef.current.elements)) {
      const value =
        values[
          element instanceof Element ? (element.getAttribute("name") ?? "") : ""
        ];
      if (
        (element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement) &&
        element.name &&
        value !== undefined
      )
        element.value = value;
    }
  }, []);
  useEffect(
    () => () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    },
    [logoPreview],
  );
  const selectLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5_000_000
    ) {
      setMessage("Choose a JPG, PNG, or WebP logo smaller than 5 MB.");
      event.target.value = "";
      return;
    }
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const base = {
      kind,
      officialName: d.get("officialName"),
      displayName: d.get("displayName") || undefined,
      acronym: d.get("acronym") || undefined,
      mentionHandle: d.get("mentionHandle") || undefined,
      slug: d.get("slug"),
      website: d.get("website") || undefined,
      officialEmail: d.get("officialEmail") || undefined,
      publicSupportEmail: d.get("publicSupportEmail") || undefined,
      intakeEmail: d.get("intakeEmail") || undefined,
      supportPhone: d.get("supportPhone") || undefined,
      contactVisibility: d.get("contactVisibility"),
      jurisdictionIds: d.getAll("jurisdictionIds"),
      phone: d.get("phone") || undefined,
      address: d.get("address") || undefined,
    };
    const payload =
      kind === "GOVERNMENT"
        ? {
            ...base,
            government: {
              governmentLevel: d.get("governmentLevel"),
              organizationType: d.get("organizationType"),
              parentOrganizationId: d.get("parentOrganizationId") || undefined,
              supervisingOrganizationId:
                d.get("supervisingOrganizationId") || undefined,
              mandateText: d.get("mandateText"),
              responsibilities: lines(d.get("responsibilities")),
              exclusions: lines(d.get("exclusions")),
              issueCategories: lines(d.get("issueCategories")),
              assetTypes: lines(d.get("assetTypes")),
              ownershipRoles: lines(d.get("ownershipRoles")),
              operationalContacts: {
                intake: d.get("intakeContact"),
                escalation: d.get("escalationContact"),
              },
            },
          }
        : {
            ...base,
            ngo: {
              registrationAuthority:
                d.get("registrationAuthority") || undefined,
              registrationNumber: d.get("registrationNumber") || undefined,
              legalForm: d.get("legalForm") || undefined,
              mission: d.get("mission"),
              focusAreas: lines(d.get("focusAreas")),
              geographicScope: lines(d.get("geographicScope")),
              capabilities: lines(d.get("capabilities")),
              technicalCapacity: { summary: d.get("technicalCapacity") },
              fundingProfile: { summary: d.get("fundingProfile") },
              projectHistory: [],
            },
          };
    save.mutate(payload);
  }
  if (!invitationToken)
    return (
      <main className="onboarding state-page">
        <p className="kicker">Invitation required</p>
        <h1>Organization onboarding is invitation-only.</h1>
        <p>
          Use the secure link sent by CivicPulse. Citizen accounts can continue
          reporting and following incidents without organization access.
        </p>
        <Link className="button button--primary" to="/incidents">
          Explore the public record
        </Link>
      </main>
    );
  if (invitation.isPending)
    return (
      <main className="onboarding state-page" aria-busy="true">
        <div className="skeleton-card" />
        <span className="sr-only">Checking invitation</span>
      </main>
    );
  if (
    invitation.error ||
    !invitation.data ||
    !["PENDING", "ACCEPTED"].includes(invitation.data.status)
  )
    return (
      <main className="onboarding state-page">
        <p className="kicker">Invitation unavailable</p>
        <h1>This organization invitation cannot be used.</h1>
        <p>
          {invitation.error?.message ?? "It may already have been completed."}
        </p>
        <Link className="button" to="/incidents">
          Return to CivicPulse
        </Link>
      </main>
    );
  return (
    <main className="onboarding">
      <header className="onboarding-heading">
        <div>
          <p className="kicker">Invited organization onboarding</p>
          <h1>Build a verified public profile.</h1>
          <p className="lede">
            This information is reviewed before a government organization can
            receive routing assignments or an NGO can submit formal
            interventions.
          </p>
        </div>
        <aside
          className="onboarding-assurance"
          aria-label="Verification assurance"
        >
          <span>Private by default</span>
          <strong>Drafts and documents are restricted until review.</strong>
        </aside>
      </header>
      <ol
        className="onboarding-progress"
        aria-label={`Onboarding step ${step} of 3`}
      >
        {[
          "Organization type",
          "Public identity",
          kind === "GOVERNMENT" ? "Mandate" : "Capability",
        ].map((label, index) => {
          const number = index + 1;
          return (
            <li
              key={label}
              className={
                number === step ? "active" : number < step ? "complete" : ""
              }
              aria-current={number === step ? "step" : undefined}
            >
              <span>{number < step ? "✓" : number}</span>
              <small>{label}</small>
            </li>
          );
        })}
      </ol>
      <form
        ref={formRef}
        className="onboarding-form"
        data-step={step}
        onInput={(event) => {
          const values = Object.fromEntries(
            new FormData(event.currentTarget).entries(),
          );
          localStorage.setItem(
            "civicpulse:onboarding-draft",
            JSON.stringify(values),
          );
        }}
        onSubmit={onSubmit}
      >
        <fieldset>
          <legend>01 / Organization type</legend>
          <div className="choice-row">
            <div
              className="choice active"
              aria-label="Invited organization type"
            >
              {kind === "GOVERNMENT" ? "Government" : "NGO / civil society"}
            </div>
            <p>
              Invitation for <strong>{invitation.data.organizationName}</strong>
              {" · "}
              {invitation.data.email}
            </p>
          </div>
        </fieldset>
        <fieldset>
          <legend>02 / Public identity</legend>
          <label className="logo-picker full">
            Official logo
            <span className="logo-picker__control">
              <span className="logo-preview">
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Selected organization logo preview"
                  />
                ) : (
                  "LOGO"
                )}
              </span>
              <span>
                <strong>Upload a clear official mark</strong>
                <small>
                  JPG, PNG, or WebP · maximum 5 MB. The original remains
                  restricted during review.
                </small>
              </span>
              <input
                name="logo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={selectLogo}
              />
            </span>
          </label>
          <label>
            Official legal name
            <input name="officialName" required />
          </label>
          <label>
            Public display name
            <input name="displayName" />
          </label>
          <label>
            Acronym
            <input name="acronym" />
          </label>
          <label>
            Mention handle
            <input
              name="mentionHandle"
              pattern="[A-Za-z0-9_]{2,30}"
              placeholder="FRSC"
              aria-describedby="handle-help"
            />
            <small id="handle-help">
              Citizens and organizations can notify you with this verified
              @handle.
            </small>
          </label>
          <label>
            URL slug
            <input name="slug" required pattern="[a-z0-9-]+" />
          </label>
          <label>
            Official website
            <input name="website" type="url" />
          </label>
          <label>
            Official email
            <input name="officialEmail" type="email" />
          </label>
          <label>
            Public support email
            <input name="publicSupportEmail" type="email" />
          </label>
          <label>
            Incident intake email
            <input name="intakeEmail" type="email" />
          </label>
          <label>
            Support phone
            <input name="supportPhone" inputMode="tel" />
          </label>
          <label>
            Publish support contact
            <select name="contactVisibility">
              <option value="PRIVATE">Keep private during review</option>
              <option value="PUBLIC">
                Show verified support contact publicly
              </option>
            </select>
          </label>
          <label>
            Operational phone
            <input name="phone" />
          </label>
          <label>
            Public office address
            <textarea name="address" />
          </label>
        </fieldset>
        {kind === "GOVERNMENT" ? (
          <fieldset>
            <legend>03 / Verified mandate</legend>
            <label>
              Government level
              <select name="governmentLevel">
                <option>FEDERAL</option>
                <option>STATE</option>
                <option>LGA</option>
              </select>
            </label>
            <label>
              Organization type
              <input
                name="organizationType"
                required
                placeholder="Ministry, authority, agency…"
              />
            </label>
            <label>
              Parent organization
              <select name="parentOrganizationId">
                <option value="">No parent organization</option>
                {options.data?.organizations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Supervising organization
              <select name="supervisingOrganizationId">
                <option value="">No supervising organization</option>
                {options.data?.organizations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="full">
              Authorized jurisdictions
              <select
                name="jurisdictionIds"
                multiple
                size={7}
                aria-describedby="jurisdiction-help"
              >
                {options.data?.jurisdictions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.type} · {item.name}
                  </option>
                ))}
              </select>
              <small id="jurisdiction-help">
                Select every verified service area. Hold Ctrl or Command to
                select more than one.
              </small>
            </label>
            <label>
              Authoritative mandate text
              <textarea name="mandateText" required minLength={30} />
            </label>
            <label>
              Responsibilities — one per line
              <textarea name="responsibilities" />
            </label>
            <label>
              Explicit exclusions — one per line
              <textarea name="exclusions" />
            </label>
            <label>
              Issue categories — one per line
              <textarea name="issueCategories" />
            </label>
            <label>
              Asset types — one per line
              <textarea name="assetTypes" />
            </label>
            <label>
              Ownership roles — one per line
              <textarea name="ownershipRoles" />
            </label>
            <label>
              Incident intake contact
              <input name="intakeContact" />
            </label>
            <label>
              Escalation contact
              <input name="escalationContact" />
            </label>
          </fieldset>
        ) : (
          <fieldset>
            <legend>03 / Capability and legal profile</legend>
            <label>
              Registration authority
              <input name="registrationAuthority" />
            </label>
            <label>
              Registration number
              <input name="registrationNumber" />
            </label>
            <label>
              Legal form
              <input name="legalForm" />
            </label>
            <label>
              Mission / objectives
              <textarea name="mission" required minLength={20} />
            </label>
            <label>
              Focus areas — one per line
              <textarea name="focusAreas" />
            </label>
            <label>
              Geographic scope — one per line
              <textarea name="geographicScope" />
            </label>
            <label>
              Capabilities — one per line
              <textarea name="capabilities" />
            </label>
            <label>
              Technical capacity for physical work
              <textarea name="technicalCapacity" />
            </label>
            <label>
              Funding profile
              <textarea name="fundingProfile" />
            </label>
          </fieldset>
        )}
        {message && (
          <p className="form-message" role="status">
            {message}
          </p>
        )}
        <div className="actions onboarding-controls">
          {step > 1 && (
            <button
              type="button"
              className="button"
              onClick={() => setStep((value) => value - 1)}
            >
              Previous
            </button>
          )}
          {step < 3 && (
            <button
              type="button"
              className="button button--ink"
              onClick={() => setStep((value) => value + 1)}
            >
              Save and continue
            </button>
          )}
          {step === 3 && !organizationId && (
            <button className="button button--ink" disabled={save.isPending}>
              {save.isPending ? "SAVING…" : "SAVE ORGANIZATION DRAFT"}
            </button>
          )}
          {step === 3 && organizationId && (
            <button
              type="button"
              className="button button--signal"
              disabled={submitForReview.isPending}
              onClick={() => submitForReview.mutate()}
            >
              Submit for verification
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
