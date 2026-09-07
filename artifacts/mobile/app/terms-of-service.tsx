import React from "react";
import LegalDocumentScreen from "@/components/LegalDocumentScreen";
import { TERMS_OF_SERVICE } from "@/lib/legalContent";

/**
 * The terms TEXT lives in lib/legalContent.ts, not here — same reason as
 * privacy-policy.tsx: the document is also served publicly from web/ at
 * https://summit-api-server.vercel.app/terms-of-service, and two copies drift.
 */
export default function TermsOfServiceScreen() {
  return <LegalDocumentScreen document={TERMS_OF_SERVICE} />;
}
