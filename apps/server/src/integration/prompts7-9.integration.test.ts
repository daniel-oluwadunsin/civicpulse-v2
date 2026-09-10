import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

const enabled =
  process.env.RUN_INTEGRATION === "1" && Boolean(process.env.TEST_DATABASE_URL);
let app: Awaited<ReturnType<typeof import("../app.js").createApp>>;
let pool: typeof import("../db/pool.js").pool;

async function citizen(label: string) {
  const agent = request.agent(app);
  const email = `${label.toLowerCase().replaceAll(" ", "-")}-${crypto.randomUUID()}@example.test`;
  const registration = await agent.post("/api/v1/auth/register").send({
    email,
    password: "correct horse battery staple",
    displayName: label,
  });
  expect(registration.status).toBe(201);
  return { agent, userId: registration.body.data.userId as string };
}

describe.runIf(enabled)("Prompts 7–9 against PostgreSQL/PostGIS", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    app = (await import("../app.js")).createApp();
    pool = (await import("../db/pool.js")).pool;
  });

  it("keeps public interactions unique and prevents cross-user comment edits", async () => {
    const first = await citizen("First citizen");
    const second = await citizen("Second citizen");
    const incident = await pool.query<{ id: string }>(
      `insert into incidents(public_reference,title,summary,category,location,public_visibility)
       values($1,'Blocked drainage','Floodwater is blocking the road.','DRAINAGE',ST_SetSRID(ST_MakePoint(3.3792,6.5244),4326),'PUBLIC') returning id`,
      [`CP-TEST-${crypto.randomUUID().slice(0, 8)}`],
    );
    const incidentId = incident.rows[0]!.id;

    await request(app).get("/api/v1/incidents").expect(200);
    await request(app)
      .put(`/api/v1/incidents/${incidentId}/reaction`)
      .send({ reaction: "UP" })
      .expect(401);
    await first.agent
      .put(`/api/v1/incidents/${incidentId}/reaction`)
      .send({ reaction: "UP" })
      .expect(204);
    await first.agent
      .put(`/api/v1/incidents/${incidentId}/reaction`)
      .send({ reaction: "DOWN" })
      .expect(204);
    const reactions = await pool.query<{ count: string; reaction: string }>(
      "select count(*)::text count,max(reaction) reaction from incident_reactions where incident_id=$1 and user_id=$2",
      [incidentId, first.userId],
    );
    expect(reactions.rows[0]).toMatchObject({ count: "1", reaction: "DOWN" });

    for (const interaction of ["affected", "confirmation", "follow"]) {
      await first.agent
        .put(`/api/v1/incidents/${incidentId}/${interaction}`)
        .expect(204);
      await first.agent
        .put(`/api/v1/incidents/${incidentId}/${interaction}`)
        .expect(204);
    }
    const uniqueSignals = await pool.query<{
      affected: number;
      confirmations: number;
      follows: number;
    }>(
      `select
        (select count(*)::int from affected_confirmations where incident_id=$1 and user_id=$2) affected,
        (select count(*)::int from incident_confirmations where incident_id=$1 and user_id=$2) confirmations,
        (select count(*)::int from incident_follows where incident_id=$1 and user_id=$2) follows`,
      [incidentId, first.userId],
    );
    expect(uniqueSignals.rows[0]).toEqual({
      affected: 1,
      confirmations: 1,
      follows: 1,
    });

    const comment = await first.agent
      .post(`/api/v1/incidents/${incidentId}/comments`)
      .send({ body: "Water is still rising." })
      .expect(201);
    await second.agent
      .patch(`/api/v1/incidents/${incidentId}/comments/${comment.body.data.id}`)
      .send({ body: "Changed by another user." })
      .expect(403);
  });

  it("enforces the government and NGO authorization lifecycle", async () => {
    const government = await citizen("Government manager");
    const ngo = await citizen("NGO manager");
    const outsider = await citizen("Unaffiliated citizen");
    const suffix = crypto.randomUUID().slice(0, 8);
    const governmentOrg = await pool.query<{ id: string }>(
      "insert into organizations(kind,official_name,slug,verification_status,onboarding_status) values('GOVERNMENT',$1,$2,'VERIFIED','APPROVED') returning id",
      [`Test Works Agency ${suffix}`, `test-works-${suffix}`],
    );
    const governmentId = governmentOrg.rows[0]!.id;
    await pool.query(
      "insert into government_profiles(organization_id,government_level,organization_type,mandate_text,issue_categories) values($1,'STATE','AGENCY',$2,$3)",
      [
        governmentId,
        "Responsible for test drainage infrastructure and inspections.",
        JSON.stringify(["DRAINAGE"]),
      ],
    );
    await pool.query(
      "insert into organization_members(organization_id,user_id,role,membership_status,joined_at) values($1,$2,'MANAGER','ACTIVE',now())",
      [governmentId, government.userId],
    );
    const ngoOrg = await pool.query<{ id: string }>(
      "insert into organizations(kind,official_name,slug,verification_status,onboarding_status) values('NGO',$1,$2,'VERIFIED','APPROVED') returning id",
      [`Test Civic NGO ${suffix}`, `test-ngo-${suffix}`],
    );
    const ngoId = ngoOrg.rows[0]!.id;
    await pool.query(
      "insert into ngo_profiles(organization_id,mission,capabilities) values($1,$2,$3)",
      [
        ngoId,
        "Support safe and accountable community infrastructure delivery.",
        JSON.stringify(["EXECUTE"]),
      ],
    );
    await pool.query(
      "insert into organization_members(organization_id,user_id,role,membership_status,joined_at) values($1,$2,'MANAGER','ACTIVE',now())",
      [ngoId, ngo.userId],
    );
    const incident = await pool.query<{ id: string }>(
      `insert into incidents(public_reference,title,summary,category,location,public_visibility)
       values($1,'Drainage repair required','A verified test incident.','DRAINAGE',ST_SetSRID(ST_MakePoint(3.38,6.52),4326),'PUBLIC') returning id`,
      [`CP-LIFE-${suffix}`],
    );
    const incidentId = incident.rows[0]!.id;
    await pool.query(
      "insert into incident_assignments(incident_id,organization_id,role,routing_method,status) values($1,$2,'PRIMARY','MANUAL','ACTIVE')",
      [incidentId, governmentId],
    );

    await outsider.agent
      .post(`/api/v1/government/incidents/${incidentId}/acknowledge`)
      .send({ organizationId: governmentId })
      .expect(403);
    await government.agent
      .post(`/api/v1/government/incidents/${incidentId}/acknowledge`)
      .send({ organizationId: governmentId })
      .expect(204);

    const proposal = await ngo.agent
      .post("/api/v1/ngo/interventions")
      .send({
        organizationId: ngoId,
        incidentId,
        interventionTypes: ["EXECUTE"],
        physicalWork: true,
        payload: {
          problemUnderstanding:
            "The drainage channel is obstructed and unsafe.",
          proposedScope:
            "Inspect, clear, repair and document the affected channel.",
          requestedGovernmentAction:
            "Review the proposal and define approvals.",
        },
      })
      .expect(201);
    const proposalId = proposal.body.data.id as string;
    await ngo.agent
      .post(`/api/v1/ngo/interventions/${proposalId}/submit`)
      .send({ organizationId: ngoId })
      .expect(204);
    await ngo.agent
      .post(`/api/v1/ngo/interventions/${proposalId}/start`)
      .send({ organizationId: ngoId })
      .expect(409);
    for (const status of ["UNDER_REVIEW", "APPROVED_IN_PRINCIPLE"])
      await government.agent
        .post(`/api/v1/government/interventions/${proposalId}/review`)
        .send({ organizationId: governmentId, status })
        .expect(204);
    const approval = await government.agent
      .post(`/api/v1/government/interventions/${proposalId}/approvals`)
      .send({
        organizationId: governmentId,
        authorityOrganizationId: governmentId,
        approvalType: "Technical clearance",
        reason: "Physical drainage work needs competent approval.",
        requiredDocuments: [],
      })
      .expect(201);
    await government.agent
      .post(
        `/api/v1/government/intervention-approvals/${approval.body.data.id}/decision`,
      )
      .send({ organizationId: governmentId, decision: "SATISFIED" })
      .expect(204);
    await government.agent
      .post(`/api/v1/government/interventions/${proposalId}/authorize`)
      .send({ organizationId: governmentId })
      .expect(204);
    await ngo.agent
      .post(`/api/v1/ngo/interventions/${proposalId}/start`)
      .send({ organizationId: ngoId })
      .expect(204);
    await ngo.agent
      .post(`/api/v1/ngo/interventions/${proposalId}/completion`)
      .send({
        organizationId: ngoId,
        statement: "All authorized work and evidence collection is complete.",
        payload: {},
      })
      .expect(204);
    await government.agent
      .post(`/api/v1/government/interventions/${proposalId}/inspection`)
      .send({
        organizationId: governmentId,
        decision: "ACCEPTED",
        notes: "The completed work passed inspection.",
      })
      .expect(204);
    await government.agent
      .post(`/api/v1/government/interventions/${proposalId}/handover`)
      .send({
        organizationId: governmentId,
        notes: "The completed asset was handed back to the authority.",
      })
      .expect(204);
    const final = await pool.query<{ status: string }>(
      "select status from intervention_proposals where id=$1",
      [proposalId],
    );
    expect(final.rows[0]?.status).toBe("HANDOVER_COMPLETE");
  });
});
