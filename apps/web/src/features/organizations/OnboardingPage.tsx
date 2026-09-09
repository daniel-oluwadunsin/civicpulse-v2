import { useMutation } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { api } from "../../lib/api";
const lines = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
export function OnboardingPage() {
  const [kind, setKind] = useState<"GOVERNMENT" | "NGO">("GOVERNMENT");
  const [message, setMessage] = useState<string>();
  const save = useMutation({
    mutationFn: (payload: unknown) =>
      api("/organizations", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () =>
      setMessage(
        "Draft saved. Complete the profile and submit it for CivicPulse verification.",
      ),
    onError: (error: Error) => setMessage(error.message),
  });
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const base = {
      kind,
      officialName: d.get("officialName"),
      displayName: d.get("displayName") || undefined,
      acronym: d.get("acronym") || undefined,
      slug: d.get("slug"),
      website: d.get("website") || undefined,
      officialEmail: d.get("officialEmail") || undefined,
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
  return (
    <main className="onboarding">
      <p className="eyebrow signal">CIVICPULSE / ORGANIZATION ONBOARDING</p>
      <h1>
        BUILD A VERIFIED
        <br />
        PUBLIC PROFILE.
      </h1>
      <p className="lede">
        This information is reviewed before a government organization can
        receive routing assignments or an NGO can submit formal interventions.
      </p>
      <form className="onboarding-form" onSubmit={onSubmit}>
        <fieldset>
          <legend>01 / Organization type</legend>
          <div className="choice-row">
            <button
              type="button"
              className={kind === "GOVERNMENT" ? "choice active" : "choice"}
              onClick={() => setKind("GOVERNMENT")}
            >
              Government
            </button>
            <button
              type="button"
              className={kind === "NGO" ? "choice active" : "choice"}
              onClick={() => setKind("NGO")}
            >
              NGO / civil society
            </button>
          </div>
        </fieldset>
        <fieldset>
          <legend>02 / Public identity</legend>
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
        <button className="button button--ink" disabled={save.isPending}>
          {save.isPending ? "SAVING…" : "SAVE ORGANIZATION DRAFT"}
        </button>
      </form>
    </main>
  );
}
