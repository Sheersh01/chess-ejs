const request = require("supertest");
const app = require("../app");
const { connectDB } = require("../config/database");
const authService = require("../services/authService");

const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

beforeAll(async () => {
  await connectDB();
});

describe("Health endpoints", () => {
  test("GET /health returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  test("GET /ready reports a connected database", async () => {
    const res = await request(app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body.database).toBe("connected");
  });
});

describe("API stats", () => {
  test("GET /api/v1/stats returns global stats", async () => {
    const res = await request(app).get("/api/v1/stats");
    expect(res.status).toBe(200);
    expect(res.body.data.totalGames).toBeDefined();
    expect(res.body.data.activeGames).toBeDefined();
  });
});

describe("API auth", () => {
  test("register rejects invalid input", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ username: "a b", email: "bad", password: "123" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("register accepts long TLDs and sets a SameSite cookie", async () => {
    const id = unique();
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        username: `u_${id}`.slice(0, 20),
        email: `${id}@example.info`,
        password: "password123",
      });
    expect(res.status).toBe(201);
    expect(res.headers["set-cookie"][0]).toMatch(/HttpOnly/);
    expect(res.headers["set-cookie"][0]).toMatch(/SameSite=Lax/);
  });

  test("login rejects missing password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "test@example.com" });
    expect(res.status).toBe(400);
  });

  test("changing the password revokes old tokens", async () => {
    const id = unique();
    const email = `${id}@example.com`;
    const reg = await request(app)
      .post("/api/v1/auth/register")
      .send({ username: `p_${id}`.slice(0, 20), email, password: "password123" });
    const oldToken = reg.body.token;
    const auth = (token) => ({ Authorization: `Bearer ${token}` });

    expect(
      (await request(app).get("/api/v1/users/me").set(auth(oldToken))).status,
    ).toBe(200);

    const wrong = await request(app)
      .post("/api/v1/profile/password")
      .set(auth(oldToken))
      .send({ currentPassword: "nope-nope", newPassword: "newpassword456" });
    expect(wrong.status).toBe(401);

    const changed = await request(app)
      .post("/api/v1/profile/password")
      .set(auth(oldToken))
      .send({ currentPassword: "password123", newPassword: "newpassword456" });
    expect(changed.status).toBe(200);

    expect(
      (await request(app).get("/api/v1/users/me").set(auth(oldToken))).status,
    ).toBe(401);
    expect(
      (await request(app).get("/api/v1/users/me").set(auth(changed.body.token))).status,
    ).toBe(200);

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "newpassword456" });
    expect(login.status).toBe(200);
  });
});

describe("API hardening", () => {
  const guest = () => authService.createGuestSession().token;

  test("invalid user ids return 400, not 500", async () => {
    const res = await request(app)
      .get("/api/v1/users/not-an-id")
      .set("Authorization", `Bearer ${guest()}`);
    expect(res.status).toBe(400);
  });

  test("cross-origin state-changing requests are blocked", async () => {
    const res = await request(app)
      .post("/api/v1/auth/guest")
      .set("Origin", "https://evil.example");
    expect(res.status).toBe(403);
  });

  test("same-origin requests are allowed", async () => {
    const res = await request(app)
      .post("/api/v1/auth/guest")
      .set("Host", "chess.local")
      .set("Origin", "http://chess.local");
    expect(res.status).toBe(200);
  });

  test("logout is POST only", async () => {
    expect((await request(app).get("/auth/logout")).status).toBe(404);
    expect((await request(app).post("/auth/logout")).status).toBe(302);
  });

  test("responses carry a Content-Security-Policy", async () => {
    const res = await request(app).get("/auth/login");
    expect(res.headers["content-security-policy"]).toMatch(/default-src 'self'/);
  });
});
