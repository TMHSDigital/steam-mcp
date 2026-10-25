// Netscape/curl cookie-jar parsing for the Partner-admin process.
// Columns: domain, includeSubdomains, path, secure, expires, name, value.
// HttpOnly cookies are written with a "#HttpOnly_" domain prefix, and
// steamLoginSecure is HttpOnly, so those rows must not be treated as comments.

export interface JarCookie {
  domain: string;
  name: string;
  value: string;
  expires: number;
}

const HTTP_ONLY_PREFIX = "#HttpOnly_";

/** Only these registrable domains (and their subdomains) are ever read from the jar. */
export const STEAM_COOKIE_DOMAINS = [
  "steamgames.com",
  "steampowered.com",
  "steamcommunity.com",
] as const;

function isSteamDomain(domain: string): boolean {
  const host = domain.replace(/^\./, "").toLowerCase();
  return STEAM_COOKIE_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

function domainMatches(cookieDomain: string, host: string): boolean {
  const d = cookieDomain.replace(/^\./, "").toLowerCase();
  const h = host.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

export function parseCookieJar(raw: string, nowSeconds = Date.now() / 1000): JarCookie[] {
  const cookies: JarCookie[] = [];
  for (let line of raw.split(/\r?\n/)) {
    if (line.startsWith(HTTP_ONLY_PREFIX)) {
      line = line.slice(HTTP_ONLY_PREFIX.length);
    } else if (!line || line.startsWith("#")) {
      continue;
    }
    const cols = line.split("\t");
    if (cols.length < 7) {
      continue;
    }
    const [domain, , , , expiresRaw, name, value] = cols;
    const expires = Number(expiresRaw);
    // 0 marks a session cookie; anything else in the past is expired.
    if (expires !== 0 && Number.isFinite(expires) && expires < nowSeconds) {
      continue;
    }
    if (!name || !isSteamDomain(domain)) {
      continue;
    }
    cookies.push({ domain, name, value, expires });
  }
  return cookies;
}

/** Cookie header for `host`, built only from jar rows whose domain matches it. */
export function cookieHeaderFor(cookies: JarCookie[], host: string): string {
  const parts = cookies
    .filter((c) => domainMatches(c.domain, host))
    .map((c) => `${c.name}=${c.value}`);
  if (parts.length === 0) {
    throw new Error(
      `Cookie jar has no unexpired cookies for ${host}. Export a fresh jar after logging in to partner.steamgames.com.`,
    );
  }
  return parts.join("; ");
}

/** Replace every cookie value from the jar, and any name=value pair for those names, with ****. */
export function redactCookies(text: string, cookies: JarCookie[]): string {
  let out = text;
  for (const { name, value } of cookies) {
    if (value.length >= 4) {
      out = out.split(value).join("****");
    }
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`${escaped}=[^;\\s"&]+`, "g"), `${name}=****`);
  }
  return out;
}
