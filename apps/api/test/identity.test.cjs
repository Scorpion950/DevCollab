const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { SignJWT } = require("jose");
const { InternalIdentityGuard } = require("../dist/users/identity.guard");
const { ConfigModule } = require("@nestjs/config");
const { validateEnvironment } = require("../dist/config/environment");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

test("Nest loads the profile guard and database settings from the API env file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "devcollab-env-"));
  const envFilePath = join(dir, ".env");
  const settings = {
    DATABASE_URL: "postgresql://localhost/auth_test",
    INTERNAL_AUTH_SECRET: randomBytes(32).toString("hex"),
  };
  const previous = { ...process.env };
  try {
    writeFileSync(envFilePath, Object.entries(settings).map(([k, v]) => k + "=" + v).join("\n"));
    for (const key of Object.keys(settings)) delete process.env[key];
    await ConfigModule.forRoot({ envFilePath, validate: validateEnvironment });
    for (const [key, value] of Object.entries(settings)) assert.ok(process.env[key] === value, key);
  } finally {
    for (const key of Object.keys(settings)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    rmSync(envFilePath, { force: true });
    require("node:fs").rmdirSync(dir);
  }
});

test("only a current service assertion supplies the request identity", async () => {
  const secret = randomBytes(32).toString("hex");
  process.env.INTERNAL_AUTH_SECRET = secret;
  const guard = new InternalIdentityGuard();
  async function check(token) {
    const request = { headers: { "x-user-id": "untrusted", authorization: token && "Bearer " + token } };
    await guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) });
    return request.userId;
  }
  const issue = (issuer, audience, expiry, key = secret) => new SignJWT({})
    .setProtectedHeader({ alg: "HS256" }).setIssuer(issuer).setAudience(audience)
    .setIssuedAt().setSubject("test-user").setExpirationTime(expiry).sign(Buffer.from(key));
  assert.equal(await check(await issue("devcollab-web", "devcollab-api", "30s")), "test-user");
  for (const token of [undefined, "invalid", await issue("elsewhere", "devcollab-api", "30s"),
    await issue("devcollab-web", "elsewhere", "30s"), await issue("devcollab-web", "devcollab-api", 1),
    await issue("devcollab-web", "devcollab-api", "30s", randomBytes(32).toString("hex"))]) {
    await assert.rejects(check(token), error => error.getStatus() === 401);
  }
});
