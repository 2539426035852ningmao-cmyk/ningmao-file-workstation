import { beforeAll, describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifyAccessJWT } from "../src/access";

const domain = "test-team.cloudflareaccess.com";
const aud = "synthetic-local-only-audience";
let privateKey: CryptoKey | import("node:crypto").KeyObject;
let resolver: ReturnType<typeof createLocalJWKSet>;

async function makeToken(options: {
  issuer?: string;
  audience?: string;
  sub?: string;
  expiry?: string;
  email?: string;
} = {}) {
  return new SignJWT({ email: options.email ?? "synthetic@example.test" })
    .setProtectedHeader({ alg: "RS256", kid: "test-only" })
    .setIssuer(options.issuer ?? `https://${domain}`)
    .setAudience(options.audience ?? aud)
    .setSubject(options.sub ?? "synthetic-subject")
    .setIssuedAt()
    .setExpirationTime(options.expiry ?? "5m")
    .sign(privateKey);
}
beforeAll(async () => {
  const key = await generateKeyPair("RS256");
  privateKey = key.privateKey;
  const jwk = await exportJWK(key.publicKey);
  resolver = createLocalJWKSet({ keys: [{ ...jwk, kid: "test-only", alg: "RS256", use: "sig" }] });
});
describe("W1 Cloudflare Access JWT verification", () => {
  it("accepts a correctly signed RS256 token with issuer and audience", async () => {
    const token = await makeToken();
    expect(await verifyAccessJWT(token, domain, aud, resolver)).toEqual({
      sub: "synthetic-subject", email: "synthetic@example.test"
    });
  });
  it("rejects wrong audience, issuer and expired token", async () => {
    expect(await verifyAccessJWT(await makeToken({ audience: "other" }), domain, aud, resolver)).toBeNull();
    expect(await verifyAccessJWT(await makeToken({ issuer: "https://bad.example" }), domain, aud, resolver)).toBeNull();
    expect(await verifyAccessJWT(await makeToken({ expiry: "-5m" }), domain, aud, resolver)).toBeNull();
  });
  it("rejects missing or placeholder configuration without network calls", async () => {
    const token = await makeToken();
    expect(await verifyAccessJWT(null, domain, aud, resolver)).toBeNull();
    expect(await verifyAccessJWT(token, "CONFIGURE_YOUR_TEAM.cloudflareaccess.com", aud, resolver)).toBeNull();
    expect(await verifyAccessJWT(token, domain, "CONFIGURE_ACCESS_AUD", resolver)).toBeNull();
    expect(await verifyAccessJWT(token, "https://evil.example", aud, resolver)).toBeNull();
  });
  it("rejects structurally invalid and tampered signed tokens", async () => {
    expect(await verifyAccessJWT("not-a-jwt", domain, aud, resolver)).toBeNull();
    const token = await makeToken();
    expect(await verifyAccessJWT(token.slice(0, -3) + "abc", domain, aud, resolver)).toBeNull();
  });
});
