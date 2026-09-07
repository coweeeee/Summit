import React from "react";
import LegalDocumentScreen from "@/components/LegalDocumentScreen";
import { PRIVACY_POLICY } from "@/lib/legalContent";

/**
 * The policy TEXT lives in lib/legalContent.ts, not here.
 *
 * It has to, because App Store Connect requires a public privacy-policy URL
 * rather than an in-app screen, so the same document is also served from web/
 * at https://summit-api-server.vercel.app/privacy-policy. Two hand-maintained
 * copies of a legal document drift, and the published one is what a reviewer
 * or regulator reads.
 *
 * Editing the text, or the notes about which factual claims it makes about the
 * app's behaviour, means editing lib/legalContent.ts.
 */
export default function PrivacyPolicyScreen() {
  return <LegalDocumentScreen document={PRIVACY_POLICY} />;
}
