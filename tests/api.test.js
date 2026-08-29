const request = require("supertest");
const app = require("../app");

describe("Health endpoints", () => {
  test("GET /health returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  test("GET /ready returns database status", async () => {
    const res = await request(app).get("/ready");
    expect([200, 503]).toContain(res.status);
    expect(res.body.database).toBeDefined();
  });
});

describe("API stats", () => {
  test("GET /api/v1/stats returns global stats", async () => {
    const res = await request(app).get("/api/v1/stats");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalGames).toBeDefined();
    expect(res.body.data.activeGames).toBeDefined();
  });
});

describe("API auth validation", () => {
  test("POST /api/v1/auth/register rejects invalid email", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ username: "ab", email: "bad", password: "123" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("POST /api/v1/auth/login rejects missing password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "test@example.com" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
