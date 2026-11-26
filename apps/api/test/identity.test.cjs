const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { SignJWT } = require("jose");
const { InternalIdentityGuard } = require("../dist/users/identity.guard");

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
