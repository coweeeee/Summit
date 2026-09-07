// GENERATED FILE — DO NOT EDIT.
//
// Verbatim copy of artifacts/mobile/lib/legalContent.ts, which is the canonical
// source for both the in-app screens and this public site. Edit that file and
// run `pnpm sync:web-legal`; a test fails if these two have drifted.
//
// Copied rather than imported because web/ sits outside the pnpm workspace and
// Vercel builds from web/ alone — see scripts/sync-web-legal.mjs.

// CANONICAL SOURCE for the Privacy Policy and Terms of Service.
//
// These documents now have to exist in two places at once: inside the app, and
// on a public URL, because App Store Connect requires a privacy policy URL at
// submission and will not accept an in-app screen. Two copies of a legal
// document that can drift is a genuinely bad outcome -- the published one is
// what a regulator or reviewer reads, and the in-app one is what a user reads.
//
// So the text lives HERE, once, as data. Nothing in this file may import
// anything: app/privacy-policy.tsx and app/terms-of-service.tsx render it with
// React Native, and web/ renders it as HTML from a generated verbatim copy
// (web/ is deliberately outside the pnpm workspace -- see web/README.md -- so
// it cannot import across the boundary). `pnpm sync:web-legal` regenerates that
// copy and a test fails if it has drifted.
//
// WHEN YOU EDIT THIS FILE:
//   1. Bump `lastUpdated` on the document you changed.
//   2. Run `pnpm sync:web-legal` (or the test will tell you to).
//   3. Re-read the sync notes below -- the policy makes factual claims about
//      what the app does, and those claims have to stay true.
//
// FACTUAL CLAIMS THIS TEXT MAKES, which must be kept in sync with the app:
// the policy states that Summit does NOT do live/background GPS tracking and
// does NOT use any analytics or crash-reporting SDK (only basic server logs).
// If either changes, update Sections 1 and 3 of the privacy policy before
// shipping:
//   - Live/background GPS during hikes            -> Section 3 (Location Data)
//   - Any analytics or crash-reporting SDK (Sentry, PostHog, Amplitude,
//     Firebase) -> Section 1 (Information We Collect), and Section 4 (Sharing)
//     if it hands data to a third party.

export type LegalBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "bullets"; items: string[] };

export type LegalDocument = {
  /** Route segment in the app AND path on the public site — they match on purpose. */
  slug: string;
  title: string;
  lastUpdated: string;
  blocks: LegalBlock[];
  /**
   * Rendered quieter than the body in both surfaces. Kept separate rather than
   * as a trailing block so neither renderer has to special-case the last item.
   */
  approvalNote: string;
};

const CONTACT_EMAIL = "sneakergoathead1@gmail.com";

export const PRIVACY_POLICY: LegalDocument = {
  slug: "privacy-policy",
  title: "Privacy Policy",
  lastUpdated: "July 8, 2026",
  blocks: [
    {
      kind: "paragraph",
      text:
        'Summit ("we", "us", or "our") respects your privacy and is committed to protecting it ' +
        "through this Privacy Policy. This policy explains what information we collect, how we " +
        "use it, and the choices you have regarding your data when you use the Summit app.",
    },
    { kind: "heading", text: "1. Information We Collect" },
    { kind: "paragraph", text: "We collect the following types of information:" },
    {
      kind: "bullets",
      items: [
        "Account information: your name, email address, username, and password.",
        "Profile information: profile photo, bio, and unit preferences.",
        "Activity data: hikes, trails, distance, elevation, duration, difficulty, and ratings you log or select within the app.",
        "Content you create: photos, comments, likes, and posts shared within the app.",
        "Device information: device type, operating system, and app version, used for troubleshooting.",
        "Basic technical logs generated when you use the app, used to maintain and improve service reliability.",
      ],
    },
    { kind: "heading", text: "2. How We Use Your Information" },
    { kind: "paragraph", text: "We use the information we collect to:" },
    {
      kind: "bullets",
      items: [
        "Provide, operate, and maintain the Summit app and its features.",
        "Track and display your hikes, statistics, milestones, and badges.",
        "Enable social features such as following other users, likes, and comments.",
        "Send notifications about likes, followers, and milestones (which you can control in Settings).",
        "Improve and personalize your experience within the app.",
        "Respond to support requests and communicate important updates.",
        "Detect, prevent, and address technical issues, fraud, or abuse.",
      ],
    },
    { kind: "heading", text: "3. Location Data" },
    {
      kind: "paragraph",
      text:
        "Summit uses location services to help you find nearby trails, display trail maps, and " +
        "fetch local weather conditions. Summit does not track your live GPS location while you " +
        "are hiking. Trail locations and any hike details you log or select (such as distance " +
        "and elevation) are stored as part of your hike history and are only shared with other " +
        "users if you choose to make that hike visible to them. You can disable location " +
        "permissions at any time through your device settings, though this will limit the app's " +
        "ability to help you find and display trails near you.",
    },
    { kind: "heading", text: "4. Sharing Your Information" },
    { kind: "paragraph", text: "We do not sell your personal information. We may share information with:" },
    {
      kind: "bullets",
      items: [
        "Other users, limited to content and profile details you choose to make public (e.g. profile visibility settings).",
        "Service providers who help us operate the app, such as our hosting, database, and storage provider, under confidentiality obligations.",
        "Third-party map and weather providers, which receive trail coordinates needed to display maps and forecasts, but not your personal account information.",
        "Authorities, if required by law, to protect our rights, or to prevent fraud or harm.",
      ],
    },
    { kind: "heading", text: "5. Data Retention" },
    {
      kind: "paragraph",
      text:
        "We retain your information for as long as your account is active or as needed to " +
        "provide you services. If you delete your account, we will delete or anonymize your " +
        "personal data within a reasonable period, except where retention is required by law.",
    },
    { kind: "heading", text: "6. Your Rights & Choices" },
    { kind: "paragraph", text: "Depending on your location, you may have the right to:" },
    {
      kind: "bullets",
      items: [
        "Access, correct, or update your personal information from within the app.",
        "Request deletion of your account and associated data from the Settings screen.",
        "Control which notifications you receive.",
        "Change your profile visibility between public and private.",
        "Object to or restrict certain uses of your data by contacting us.",
      ],
    },
    { kind: "heading", text: "7. Security" },
    {
      kind: "paragraph",
      text:
        "We use industry-standard technical and organizational measures to protect your " +
        "information from unauthorized access, alteration, disclosure, or destruction. However, " +
        "no method of transmission or storage is completely secure, and we cannot guarantee " +
        "absolute security.",
    },
    { kind: "heading", text: "8. Children's Privacy" },
    {
      kind: "paragraph",
      text:
        "Summit is not intended for children under the age of 13. We do not knowingly collect " +
        "personal information from children under 13. If you believe a child has provided us " +
        "with personal information, please contact us so we can delete it.",
    },
    { kind: "heading", text: "9. Changes to This Policy" },
    {
      kind: "paragraph",
      text:
        "We may update this Privacy Policy from time to time. We will notify you of material " +
        'changes by updating the "Last updated" date above or through an in-app notice.',
    },
    { kind: "heading", text: "10. Contact Us" },
    {
      kind: "paragraph",
      text:
        "If you have questions or concerns about this Privacy Policy or our data practices, " +
        `please contact us at ${CONTACT_EMAIL}.`,
    },
  ],
  approvalNote:
    "Reviewed and approved by the app owner (final decision-maker) on July 8, 2026. This " +
    "policy has not been reviewed by a licensed attorney; jurisdiction-specific requirements " +
    "(e.g. GDPR/CCPA formal request handling) should be revisited with legal counsel before " +
    "expanding to new markets or adding new data collection.",
};

export const TERMS_OF_SERVICE: LegalDocument = {
  slug: "terms-of-service",
  title: "Terms of Service",
  lastUpdated: "July 8, 2026",
  blocks: [
    {
      kind: "paragraph",
      text:
        'These Terms of Service ("Terms") govern your access to and use of Summit (the "App"). ' +
        "By creating an account or using the App, you agree to be bound by these Terms. If you " +
        "do not agree, please do not use the App.",
    },
    { kind: "heading", text: "1. Eligibility & Accounts" },
    { kind: "paragraph", text: "To use Summit, you must:" },
    {
      kind: "bullets",
      items: [
        "Be at least 13 years old, or the minimum age required in your country to use the App.",
        "Provide accurate and complete registration information.",
        "Keep your password confidential and be responsible for all activity on your account.",
        "Notify us promptly of any unauthorized use of your account.",
      ],
    },
    { kind: "heading", text: "2. Use of the App" },
    {
      kind: "paragraph",
      text:
        "Summit lets you record hikes, track statistics, share photos and comments, and connect " +
        "with other outdoor enthusiasts. You agree to use the App only for lawful purposes and " +
        "in accordance with these Terms.",
    },
    { kind: "heading", text: "3. Acceptable Use" },
    { kind: "paragraph", text: "You agree not to:" },
    {
      kind: "bullets",
      items: [
        "Post content that is unlawful, harassing, defamatory, obscene, or infringes on others' rights.",
        "Impersonate any person or entity, or misrepresent your affiliation with anyone.",
        "Upload viruses, malware, or attempt to disrupt or compromise the App's security.",
        "Scrape, reverse engineer, or use automated means to access the App without permission.",
        "Use the App to harm, threaten, or endanger yourself or others, including sharing false or misleading trail or safety information.",
        "Violate any applicable local, state, national, or international law.",
      ],
    },
    { kind: "heading", text: "4. User Content" },
    {
      kind: "paragraph",
      text:
        'You retain ownership of the photos, comments, and other content you post ("User ' +
        'Content"). By posting User Content, you grant Summit a worldwide, non-exclusive, ' +
        "royalty-free license to host, store, display, and distribute that content within the " +
        "App for the purpose of operating and promoting the service. You are solely responsible " +
        "for the content you share and confirm you have the necessary rights to share it.",
    },
    { kind: "heading", text: "5. Safety Disclaimer" },
    {
      kind: "paragraph",
      text:
        "Hiking and outdoor activities carry inherent risks, including injury, exposure to " +
        "weather, wildlife encounters, and getting lost. Summit is a tracking and social " +
        "companion app, not a safety device or guarantee of accurate trail conditions. You use " +
        "the App and any trail information at your own risk, and you are solely responsible for " +
        "your own safety, preparation, and decisions while hiking.",
    },
    { kind: "heading", text: "6. Intellectual Property" },
    {
      kind: "paragraph",
      text:
        "The App, including its design, logos, graphics, and software (excluding User Content), " +
        "is owned by Summit and protected by intellectual property laws. You may not copy, " +
        "modify, distribute, or create derivative works from the App without our written " +
        "permission.",
    },
    { kind: "heading", text: "7. Termination" },
    {
      kind: "paragraph",
      text:
        "You may delete your account at any time from Settings. We may suspend or terminate " +
        "your access to the App if you violate these Terms, engage in fraudulent or harmful " +
        "activity, or for any other reason at our discretion, with or without notice.",
    },
    { kind: "heading", text: "8. Disclaimers" },
    {
      kind: "paragraph",
      text:
        'The App is provided "as is" and "as available" without warranties of any kind, whether ' +
        "express or implied, including but not limited to accuracy, reliability, or fitness for " +
        "a particular purpose. We do not guarantee the App will be uninterrupted, secure, or " +
        "error-free.",
    },
    { kind: "heading", text: "9. Limitation of Liability" },
    {
      kind: "paragraph",
      text:
        "To the fullest extent permitted by law, Summit and its affiliates shall not be liable " +
        "for any indirect, incidental, special, consequential, or punitive damages, including " +
        "personal injury while hiking, arising from your use of or inability to use the App.",
    },
    { kind: "heading", text: "10. Changes to These Terms" },
    {
      kind: "paragraph",
      text:
        "We may update these Terms from time to time. Continued use of the App after changes " +
        "take effect constitutes acceptance of the updated Terms. Material changes will be " +
        'reflected by the "Last updated" date above.',
    },
    { kind: "heading", text: "11. Contact Us" },
    {
      kind: "paragraph",
      text: `If you have any questions about these Terms, please contact us at ${CONTACT_EMAIL}.`,
    },
  ],
  approvalNote:
    "Reviewed and approved by the app owner (final decision-maker) on July 8, 2026. These " +
    "Terms have not been reviewed by a licensed attorney; provisions such as arbitration, " +
    "dispute resolution, and governing law should be revisited with legal counsel before " +
    "expanding to new markets.",
};

export const LEGAL_DOCUMENTS: LegalDocument[] = [PRIVACY_POLICY, TERMS_OF_SERVICE];

export function legalDocumentBySlug(slug: string): LegalDocument | null {
  return LEGAL_DOCUMENTS.find(d => d.slug === slug) ?? null;
}
