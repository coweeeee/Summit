import { ImageResponse } from "@vercel/og";

// The image that iMessage, WhatsApp, Slack, Discord and Twitter render when a
// Summit link is pasted. Generated here rather than in the app, so a link
// previews correctly however it was shared -- including when someone copies it
// by hand, which in-app image generation never covers.
//
// Instagram Stories is the deliberate exception: it ignores Open Graph
// entirely, and covering it needs real in-app image export. That is Phase 3.

export const config = { runtime: "edge" };

const BG = "#0f1a0f";
const ACCENT = "#6db87a";
const TEXT = "#e8ede8";
const MUTED = "#9aa79a";

export default function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  // Trimmed rather than wrapped: these render into a fixed 1200x630 card, and
  // an over-long trail name would otherwise push the stats off the canvas.
  const title = (searchParams.get("title") || "Summit").slice(0, 60);
  const sub = (searchParams.get("sub") || "").slice(0, 70);
  const a = (searchParams.get("a") || "").slice(0, 20);
  const b = (searchParams.get("b") || "").slice(0, 20);
  const kind = searchParams.get("kind") === "hike" ? "hike" : "profile";

  const statLabels = kind === "hike" ? ["", ""] : ["hikes", "miles"];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: BG,
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 26, letterSpacing: 6, color: ACCENT, textTransform: "uppercase" }}>
          Summit
        </div>
        <div style={{ display: "flex", fontSize: 68, color: TEXT, marginTop: 28, lineHeight: 1.15 }}>
          {title}
        </div>
        {sub ? (
          <div style={{ display: "flex", fontSize: 32, color: MUTED, marginTop: 16 }}>{sub}</div>
        ) : null}
        {(a || b) ? (
          <div style={{ display: "flex", gap: 24, marginTop: 44 }}>
            {[a, b].map((value, i) =>
              value ? (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    background: "#162416",
                    border: "1px solid #223022",
                    borderRadius: 16,
                    padding: "18px 30px",
                  }}
                >
                  <div style={{ display: "flex", fontSize: 38, color: TEXT }}>{value}</div>
                  {statLabels[i] ? (
                    <div style={{ display: "flex", fontSize: 20, color: MUTED, marginTop: 4 }}>
                      {statLabels[i]}
                    </div>
                  ) : null}
                </div>
              ) : null
            )}
          </div>
        ) : null}
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
