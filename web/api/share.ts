// Renders the page a shared Summit link opens.
//
// Server-rendered rather than static because the Open Graph tags have to be
// per-profile and per-hike -- that is the whole mechanism by which iMessage,
// WhatsApp, Slack and Discord show a preview instead of a bare URL.
//
// All data comes from the `share-preview` Supabase edge function, which is the
// only thing allowed to touch the database. This file never sees a service
// role key and cannot read anything the function does not choose to return.

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";

// Custom scheme, not a universal link. Until Phase 2 (which needs a paid Apple
// Developer account for the associated-domains entitlement) the OS cannot hand
// this URL to the app automatically, so the page offers it as a button that
// works for anyone who already has Summit installed.
const APP_SCHEME = "summit";

/**
 * Everything interpolated below is user-controlled -- display names and bios
 * are free text typed into the app -- so it is escaped before it reaches the
 * HTML or a meta tag. Without this a bio containing markup would be a stored
 * XSS on a page served to strangers.
 */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Preview =
  | { ok: true; kind: "profile"; username: string | null; displayName: string | null; bio: string | null; avatarUrl: string | null; hikeCount: number; totalMiles: number }
  | { ok: true; kind: "hike"; trailName: string | null; location: string | null; distanceMi: number | null; elevationFt: number | null; difficulty: string | null; date: string | null; authorName: string | null; authorUsername: string | null; authorAvatarUrl: string | null }
  | { ok: false };

function page(opts: {
  title: string;
  description: string;
  ogImage: string;
  canonical: string;
  appLink: string | null;
  heading: string;
  sub: string;
  stats: { label: string; value: string }[];
}): string {
  const statsHtml = opts.stats
    .map(s => `<div class="stat"><span class="v">${esc(s.value)}</span><span class="l">${esc(s.label)}</span></div>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<link rel="canonical" href="${esc(opts.canonical)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:image" content="${esc(opts.ogImage)}">
<meta property="og:url" content="${esc(opts.canonical)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(opts.title)}">
<meta name="twitter:description" content="${esc(opts.description)}">
<meta name="twitter:image" content="${esc(opts.ogImage)}">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  body { background:#0f1a0f; color:#e8ede8; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
         min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
  .card { width:100%; max-width:420px; text-align:center; }
  .brand { font-size:15px; letter-spacing:.14em; text-transform:uppercase; color:#6db87a; margin-bottom:28px; }
  h1 { font-size:30px; line-height:1.2; margin-bottom:8px; }
  .sub { color:#9aa79a; font-size:15px; line-height:1.5; margin-bottom:26px; }
  .stats { display:flex; justify-content:center; gap:14px; flex-wrap:wrap; margin-bottom:30px; }
  .stat { background:#162416; border:1px solid #223022; border-radius:12px; padding:12px 18px; min-width:92px; }
  .stat .v { display:block; font-size:19px; font-weight:600; }
  .stat .l { display:block; font-size:11px; letter-spacing:.09em; text-transform:uppercase; color:#7d8a7d; margin-top:4px; }
  .btn { display:block; padding:14px 20px; border-radius:12px; text-decoration:none; font-weight:600; font-size:15px; }
  .primary { background:#6db87a; color:#0f1a0f; margin-bottom:10px; }
  .soon { border:1px solid #223022; color:#9aa79a; }
  footer { margin-top:26px; font-size:12px; color:#66735f; }
</style>
</head>
<body>
  <main class="card">
    <div class="brand">Summit</div>
    <h1>${esc(opts.heading)}</h1>
    <p class="sub">${esc(opts.sub)}</p>
    ${statsHtml ? `<div class="stats">${statsHtml}</div>` : ""}
    ${opts.appLink ? `<a class="btn primary" href="${esc(opts.appLink)}">Open in Summit</a>` : ""}
    <div class="btn soon">Summit is launching soon — check back here</div>
    <footer>Your trail journal</footer>
  </main>
</body>
</html>`;
}

function notFoundPage(origin: string): string {
  return page({
    title: "Summit",
    description: "Summit — your trail journal.",
    ogImage: `${origin}/api/og`,
    canonical: origin,
    appLink: null,
    heading: "Nothing to see here",
    sub: "This link has expired, was never valid, or points to a private account.",
    stats: [],
  });
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = url.origin;
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id");

  const html = (body: string, status = 200) =>
    new Response(body, {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        // Unfurlers from several apps hit the same link at once.
        "cache-control": "public, max-age=300, s-maxage=300",
      },
    });

  if (!id || (type !== "profile" && type !== "hike")) return html(notFoundPage(origin), 404);

  let data: Preview = { ok: false };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/share-preview?type=${type}&id=${encodeURIComponent(id)}`
    );
    data = (await res.json()) as Preview;
  } catch {
    // A preview that will not load is indistinguishable from one that does not
    // exist, as far as this page is concerned.
    return html(notFoundPage(origin), 502);
  }

  if (!data.ok) return html(notFoundPage(origin), 404);

  const canonical = `${origin}/${type === "profile" ? "u" : "h"}/${encodeURIComponent(id)}`;
  const ogFor = (params: Record<string, string>) =>
    `${origin}/api/og?${new URLSearchParams(params).toString()}`;

  if (data.kind === "profile") {
    const name = data.displayName || (data.username ? `@${data.username}` : "A hiker");
    return html(
      page({
        title: `${name} on Summit`,
        description: data.bio || `${data.hikeCount} hikes and ${data.totalMiles} miles logged on Summit.`,
        ogImage: ogFor({ kind: "profile", title: name, sub: data.username ? `@${data.username}` : "", a: String(data.hikeCount), b: String(data.totalMiles) }),
        canonical,
        appLink: data.username ? `${APP_SCHEME}://u/${data.username}` : null,
        heading: name,
        sub: data.bio || "Tracking hikes on Summit.",
        stats: [
          { label: "Hikes", value: String(data.hikeCount) },
          { label: "Miles", value: String(data.totalMiles) },
        ],
      })
    );
  }

  const trail = data.trailName || "A hike";
  const by = data.authorName || (data.authorUsername ? `@${data.authorUsername}` : "someone");
  const stats: { label: string; value: string }[] = [];
  if (data.distanceMi != null) stats.push({ label: "Distance", value: `${data.distanceMi} mi` });
  if (data.elevationFt != null) stats.push({ label: "Elevation", value: `${data.elevationFt} ft` });
  if (data.difficulty) stats.push({ label: "Difficulty", value: data.difficulty });

  return html(
    page({
      title: `${trail} — logged on Summit`,
      description: `${by} hiked ${trail}${data.location ? ` in ${data.location}` : ""}.`,
      ogImage: ogFor({ kind: "hike", title: trail, sub: data.location || "", a: data.distanceMi != null ? `${data.distanceMi} mi` : "", b: data.elevationFt != null ? `${data.elevationFt} ft` : "" }),
      canonical,
      appLink: `${APP_SCHEME}://h/${id}`,
      heading: trail,
      sub: `${by}${data.location ? ` · ${data.location}` : ""}`,
      stats,
    })
  );
}
