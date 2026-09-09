import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

const enabled =
  process.env.RUN_INTEGRATION === "1" && Boolean(process.env.TEST_DATABASE_URL);
let app: Awaited<ReturnType<typeof import("../app.js").createApp>>;

describe.runIf(enabled)("authentication against real PostgreSQL", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    app = (await import("../app.js")).createApp();
  });

  it("registers, authenticates, and reads the opaque session", async () => {
    const agent = request.agent(app);
    const email = `integration-${crypto.randomUUID()}@example.test`;
    const registration = await agent
      .post("/api/v1/auth/register")
      .send({
        email,
        password: "correct horse battery staple",
        displayName: "Integration User",
      })
      .expect(201);
    expect(registration.body.data.userId).toMatch(/^[0-9a-f-]{36}$/);
    const me = await agent.get("/api/v1/auth/me").expect(200);
    expect(me.body.data.user.email).toBe(email);
    await agent.post("/api/v1/auth/logout").send({}).expect(204);
    await agent.get("/api/v1/auth/me").expect(401);
  });
});
