import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

const enabled =
  process.env.RUN_INTEGRATION === "1" && Boolean(process.env.TEST_DATABASE_URL);
let app: Awaited<ReturnType<typeof import("../app.js").createApp>>;
let query: typeof import("../db/pool.js").query;
let invitationHash: typeof import("../modules/organizations/invitations.js").invitationHash;

describe.runIf(enabled)("invitation-only organization onboarding", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    ({ query } = await import("../db/pool.js"));
    ({ invitationHash } =
      await import("../modules/organizations/invitations.js"));
    app = (await import("../app.js")).createApp();
  });

  it("rejects self-service creation and consumes a matching invitation once", async () => {
    const agent = request.agent(app);
    const email = `organization-${crypto.randomUUID()}@example.test`;
    await agent
      .post("/api/v1/auth/register")
      .send({
        email,
        password: "correct horse battery staple",
        displayName: "Organization Administrator",
      })
      .expect(201);

    const slug = `test-agency-${crypto.randomUUID()}`;
    const payload = {
      kind: "GOVERNMENT",
      officialName: "Integration Test Public Works Agency",
      slug,
      contactVisibility: "PRIVATE",
      jurisdictionIds: [],
      government: {
        governmentLevel: "STATE",
        organizationType: "AGENCY",
        mandateText:
          "Maintains public infrastructure used by this isolated integration test.",
        responsibilities: ["Test infrastructure maintenance"],
        exclusions: [],
        issueCategories: ["ROADS"],
        assetTypes: ["ROAD"],
        ownershipRoles: ["MAINTAINER"],
        operationalContacts: {},
      },
    };
    await agent.post("/api/v1/organizations").send(payload).expect(400);

    const raw = `test-${crypto.randomUUID()}-${crypto.randomUUID()}`;
    const admin = await query<{ id: string }>(
      "select id from users where email=$1",
      [email],
    );
    await query(
      "insert into organization_onboarding_invitations(email,organization_kind,organization_name,token_hash,invited_by,expires_at) values($1,'GOVERNMENT',$2,$3,$4,now()+interval '1 hour')",
      [email, payload.officialName, invitationHash(raw), admin.rows[0]!.id],
    );

    await agent
      .post(`/api/v1/organization-invitations/${raw}/accept`)
      .send({})
      .expect(200);
    const created = await agent
      .post("/api/v1/organizations")
      .send({ ...payload, invitationToken: raw })
      .expect(201);
    await agent
      .post("/api/v1/organizations")
      .send({ ...payload, slug: `${slug}-again`, invitationToken: raw })
      .expect(403);

    const membership = await query<{ verification_status: string }>(
      `select o.verification_status from organization_members m
       join organizations o on o.id=m.organization_id
       where m.user_id=$1 and o.id=$2 and m.role='ORG_ADMIN' and m.membership_status='ACTIVE'`,
      [admin.rows[0]!.id, created.body.data.id],
    );
    expect(membership.rows[0]?.verification_status).toBe("UNVERIFIED");
  });
});
