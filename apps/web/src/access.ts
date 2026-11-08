import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export type AccessIdentity = { sub: string; email: string };
const jwksCache = new Map<string, JWTVerifyGetKey>();

/** Server-side only; browser localStorage device labels are never identity proof.
 * The optional key resolver exists solely to exercise the same verification code
 * with locally minted synthetic JWTs in automated tests.
 */
export async function verifyAccessJWT(
  assertion: string | null | undefined,
  configuredDomain: string | undefined,
  configuredAud: string | undefined,
  testKeyResolver?: JWTVerifyGetKey
): Promise<AccessIdentity | null> {
  const domain = configuredDomain?.trim().replace(/^https?:\/\//, "").replace(/\/$/, "") || "";
  const aud = configuredAud?.trim() || "";
  if (!assertion || !/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(domain) ||
      domain.toUpperCase().startsWith("CONFIGURE_") ||
      !aud || aud === "CONFIGURE_ACCESS_AUD") return null;
  try {
    let key = testKeyResolver ?? jwksCache.get(domain);
    if (!key) {
      key = createRemoteJWKSet(new URL(`https://${domain}/cdn-cgi/access/certs`));
      jwksCache.set(domain, key);
    }
    const { payload } = await jwtVerify(assertion, key, {
      issuer: `https://${domain}`,
      audience: aud,
      algorithms: ["RS256"]
    });
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    return { sub: payload.sub, email: typeof payload.email === "string" ? payload.email : "已验证用户" };
  } catch {
    return null;
  }
}
