// Serves the Privacy Policy and Terms of Service as public web pages.
//
// WHY THIS EXISTS: App Store Connect requires a privacy policy URL at
// submission and will not accept an in-app screen. These documents already
// existed as Expo Router routes inside the app; this renders the SAME text at
// a public URL so the two cannot say different things.
//
// The text is not written here. It comes from legal-content.generated.ts, a
// verbatim copy of artifacts/mobile/lib/legalContent.ts produced by
// `pnpm sync:web-legal`. Edit the canonical file, not the copy, and not this.
//
// Unlike api/share.ts this touches no database and no edge function -- the
// content is static, so the response is cacheable and cannot fail on a network
// call.

import { legalDocumentBySlug, type LegalDocument } from "../legal-content.generated";

export const config = { runtime: "edge" };

/**
 * The document text is authored by us, not by users, so this is not the stored
 * XSS defence api/share.ts needs -- it is here so an apostrophe or ampersand in
 * the policy renders as itself rather than breaking the markup. "Your Rights &
 * Choices" is a real heading in the policy and would otherwise emit a bare `&`.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Styling mirrors web/index.html so the legal pages look like the same site. */
function page(doc: LegalDocument): string {
  const body = doc.blocks
    .map(block => {
      if (block.kind === "heading") return `<h2>${esc(block.text)}</h2>`;
      if (block.kind === "paragraph") return `<p>${esc(block.text)}</p>`;
      return `<ul>${block.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>`;
    })
    .join("\n    ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.title)} — Summit</title>
<meta name="description" content="${esc(doc.title)} for Summit, a trail journal for logging hikes.">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(doc.title)} — Summit">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  body { background:#0f1a0f; color:#e8ede8;
         font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
         line-height:1.6; padding:32px 20px 64px; }
  main { max-width:70ch; margin:0 auto; }
  .brand { font-size:13px; letter-spacing:.14em; text-transform:uppercase; color:#6db87a; margin-bottom:20px; }
  .brand a { color:inherit; text-decoration:none; }
  h1 { font-size:30px; line-height:1.2; letter-spacing:-0.5px; margin-bottom:6px; }
  .updated { color:#7d8a7d; font-size:13px; margin-bottom:28px; }
  h2 { font-size:17px; margin:28px 0 8px; color:#e8ede8; }
  p { color:#9aa79a; font-size:15px; margin-bottom:10px; }
  ul { margin:8px 0 14px; padding-left:20px; }
  li { color:#9aa79a; font-size:15px; margin-bottom:8px; }
  .approval { margin-top:32px; padding-top:20px; border-top:1px solid #223022;
              color:#7d8a7d; font-size:13px; font-style:italic; }
  a { color:#6db87a; }
</style>
</head>
<body>
  <main>
    <div class="brand"><a href="/">Summit</a></div>
    <h1>${esc(doc.title)}</h1>
    <p class="updated">Last updated: ${esc(doc.lastUpdated)}</p>
    ${body}
    <p class="approval">${esc(doc.approvalNote)}</p>
  </main>
</body>
</html>`;
}

export default function handler(req: Request): Response {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  const doc = legalDocumentBySlug(slug);

  if (!doc) {
    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  }

  return new Response(page(doc), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Static content, but short enough that a correction reaches readers the
      // same day rather than sitting stale in a CDN for a week. App Store
      // review fetches this live, so it must never serve a stale document.
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
