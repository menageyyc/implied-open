// Login gate for the private site. Runs before EVERY request (the page, its files and /api/sxf).
// Cloudflare Access sits in front of this site and logs Matt in. This code checks Access's signed
// login token again, so the site stays locked even if a hostname or preview link ever ends up
// outside the Access rule. It fails closed: if the settings below are missing, nobody gets in.
//
// Settings (Pages project environment variables):
//   ACCESS_TEAM_DOMAIN  e.g. small-credit-1e44.cloudflareaccess.com
//   ACCESS_AUD          the Access application's audience (AUD) tag
//   ALLOWED_EMAIL       the one email address allowed in

const te = new TextEncoder();
const td = new TextDecoder();

function b64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let certs = { team: null, at: 0, keys: null };
async function signingKeys(team, force) {
  if (!force && certs.keys && certs.team === team && Date.now() - certs.at < 3600e3) return certs.keys;
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error("certs " + r.status);
  const j = await r.json();
  certs = { team, at: Date.now(), keys: j.keys || [] };
  return certs.keys;
}

async function validToken(token, env) {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const header = JSON.parse(td.decode(b64url(parts[0])));
  if (header.alg !== "RS256") return false;
  let jwk = (await signingKeys(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await signingKeys(env.ACCESS_TEAM_DOMAIN, true)).find((k) => k.kid === header.kid);
  if (!jwk) return false;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(parts[2]), te.encode(parts[0] + "." + parts[1]));
  if (!ok) return false;
  const p = JSON.parse(td.decode(b64url(parts[1])));
  const now = Date.now() / 1000;
  if (!(typeof p.exp === "number" && p.exp > now)) return false;
  if (typeof p.nbf === "number" && p.nbf > now + 60) return false;
  if (p.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return false;
  const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
  if (!aud.includes(env.ACCESS_AUD)) return false;
  if (typeof p.email !== "string" || p.email.toLowerCase() !== env.ALLOWED_EMAIL.toLowerCase()) return false;
  return true;
}

function deny() {
  return new Response("Forbidden", {
    status: 403,
    headers: { "content-type": "text/plain", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow, noarchive" },
  });
}

export async function onRequest(ctx) {
  const { request, env } = ctx;
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ALLOWED_EMAIL) return deny();
  let token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) {
    const m = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
    token = m ? m[1] : null;
  }
  if (!token) return deny();
  try {
    if (!(await validToken(token, env))) return deny();
  } catch {
    return deny();
  }
  const res = await ctx.next();
  const out = new Response(res.body, res);
  out.headers.set("cache-control", "no-store, private");
  out.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  return out;
}
