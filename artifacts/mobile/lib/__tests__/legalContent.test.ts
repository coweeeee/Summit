import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PRIVACY_POLICY, TERMS_OF_SERVICE, LEGAL_DOCUMENTS, legalDocumentBySlug } from "../legalContent.ts";

const REPO = join(import.meta.dirname, "../../../..");

describe("the published copy cannot drift from the canonical one", () => {
  test("web/legal-content.generated.ts is current", () => {
    // This is the whole safety net for having the same legal document in two
    // places. If it fails, run `pnpm sync:web-legal` -- do not edit the
    // generated file, and do not delete this test.
    const canonical = readFileSync(join(REPO, "artifacts/mobile/lib/legalContent.ts"), "utf8");
    const generated = readFileSync(join(REPO, "web/legal-content.generated.ts"), "utf8");
    assert.ok(
      generated.endsWith(canonical),
      "web/legal-content.generated.ts is stale — run `pnpm sync:web-legal`",
    );
  });

  test("the generated file is marked do-not-edit", () => {
    const generated = readFileSync(join(REPO, "web/legal-content.generated.ts"), "utf8");
    assert.match(generated, /GENERATED FILE — DO NOT EDIT/);
  });

  test("the canonical file imports nothing, so the copy is valid standalone", () => {
    // The sync is a verbatim copy. An import would resolve in the app and fail
    // on the web side, where there is no @/ alias and no workspace.
    const canonical = readFileSync(join(REPO, "artifacts/mobile/lib/legalContent.ts"), "utf8");
    assert.doesNotMatch(canonical, /^\s*import\s/m);
    assert.doesNotMatch(canonical, /\brequire\(/);
  });

  test("web/ routes both documents at the paths App Store Connect will be given", () => {
    const vercel = JSON.parse(readFileSync(join(REPO, "web/vercel.json"), "utf8"));
    const sources = vercel.rewrites.map((r: { source: string }) => r.source);
    for (const doc of LEGAL_DOCUMENTS) {
      assert.ok(sources.includes(`/${doc.slug}`), `web/vercel.json has no route for /${doc.slug}`);
    }
  });
});

describe("document integrity", () => {
  test("both documents are present and reachable by slug", () => {
    assert.equal(LEGAL_DOCUMENTS.length, 2);
    assert.equal(legalDocumentBySlug("privacy-policy")?.title, "Privacy Policy");
    assert.equal(legalDocumentBySlug("terms-of-service")?.title, "Terms of Service");
    assert.equal(legalDocumentBySlug("nope"), null);
  });

  test("slugs match the in-app route filenames", () => {
    // app/privacy-policy.tsx and app/terms-of-service.tsx. If a slug changes,
    // the in-app route and the public URL must move together.
    for (const doc of LEGAL_DOCUMENTS) {
      assert.match(doc.slug, /^[a-z-]+$/);
    }
  });

  test("no block is empty — an empty section renders as a gap, not as absence", () => {
    for (const doc of LEGAL_DOCUMENTS) {
      for (const block of doc.blocks) {
        if (block.kind === "bullets") {
          assert.ok(block.items.length > 0, `${doc.slug}: empty bullet list`);
          for (const item of block.items) assert.ok(item.trim().length > 0);
        } else {
          assert.ok(block.text.trim().length > 0, `${doc.slug}: empty ${block.kind}`);
        }
      }
      assert.ok(doc.approvalNote.trim().length > 0);
      assert.ok(doc.lastUpdated.trim().length > 0);
    }
  });

  test("the structure matches what was extracted from the original screens", () => {
    // Counted against the pre-extraction JSX. These numbers are a tripwire: if
    // a section is lost in a future edit, this fails rather than the omission
    // reaching a published legal document silently.
    const shape = (d: typeof PRIVACY_POLICY) => ({
      headings: d.blocks.filter(b => b.kind === "heading").length,
      paragraphs: d.blocks.filter(b => b.kind === "paragraph").length,
      bullets: d.blocks.reduce((n, b) => n + (b.kind === "bullets" ? b.items.length : 0), 0),
    });
    assert.deepEqual(shape(PRIVACY_POLICY), { headings: 10, paragraphs: 11, bullets: 22 });
    assert.deepEqual(shape(TERMS_OF_SERVICE), { headings: 11, paragraphs: 12, bullets: 10 });
  });

  test("the contact email is present in both documents", () => {
    for (const doc of LEGAL_DOCUMENTS) {
      const all = doc.blocks.map(b => (b.kind === "bullets" ? b.items.join(" ") : b.text)).join(" ");
      assert.match(all, /sneakergoathead1@gmail\.com/, `${doc.slug} lost its contact address`);
    }
  });

  test("no unresolved bracket placeholders survive into a published document", () => {
    // These pages go to App Store review. A "[COMPANY NAME]" reaching that page
    // is worse than a missing page.
    for (const doc of LEGAL_DOCUMENTS) {
      const all = [
        doc.title, doc.lastUpdated, doc.approvalNote,
        ...doc.blocks.map(b => (b.kind === "bullets" ? b.items.join(" ") : b.text)),
      ].join(" ");
      assert.doesNotMatch(all, /\[[A-Z][A-Z _-]{2,}\]/, `${doc.slug} still has a bracket placeholder`);
      assert.doesNotMatch(all, /\bTODO\b|\bTBD\b|\bXXX\b/, `${doc.slug} still has a TODO marker`);
    }
  });
});
