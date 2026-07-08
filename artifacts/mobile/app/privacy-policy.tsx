import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

function BulletList({ items }: { items: string[] }) {
  return (
    <View style={styles.bulletList}>
      {items.map((item, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>{"\u2022"}</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="chevron-left" size={28} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Privacy Policy</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>Last updated: July 8, 2026</Text>

        <Paragraph>
          Summit ("we", "us", or "our") respects your privacy and is committed to protecting it
          through this Privacy Policy. This policy explains what information we collect, how we
          use it, and the choices you have regarding your data when you use the Summit app.
        </Paragraph>

        <SectionTitle>1. Information We Collect</SectionTitle>
        <Paragraph>We collect the following types of information:</Paragraph>
        <BulletList
          items={[
            "Account information: your name, email address, username, and password.",
            "Profile information: profile photo, bio, and unit preferences.",
            "Activity data: hikes, trails, distance, elevation, duration, difficulty, and ratings you log or select within the app.",
            "Content you create: photos, comments, likes, and posts shared within the app.",
            "Device information: device type, operating system, and app version, used for troubleshooting.",
            "Basic technical logs generated when you use the app, used to maintain and improve service reliability.",
          ]}
        />

        <SectionTitle>2. How We Use Your Information</SectionTitle>
        <Paragraph>We use the information we collect to:</Paragraph>
        <BulletList
          items={[
            "Provide, operate, and maintain the Summit app and its features.",
            "Track and display your hikes, statistics, milestones, and badges.",
            "Enable social features such as following other users, likes, and comments.",
            "Send notifications about likes, followers, and milestones (which you can control in Settings).",
            "Improve and personalize your experience within the app.",
            "Respond to support requests and communicate important updates.",
            "Detect, prevent, and address technical issues, fraud, or abuse.",
          ]}
        />

        <SectionTitle>3. Location Data</SectionTitle>
        <Paragraph>
          Summit uses location services to help you find nearby trails, display trail maps, and
          fetch local weather conditions. Summit does not track your live GPS location while you
          are hiking. Trail locations and any hike details you log or select (such as distance
          and elevation) are stored as part of your hike history and are only shared with other
          users if you choose to make that hike visible to them. You can disable location
          permissions at any time through your device settings, though this will limit the app's
          ability to help you find and display trails near you.
        </Paragraph>

        <SectionTitle>4. Sharing Your Information</SectionTitle>
        <Paragraph>We do not sell your personal information. We may share information with:</Paragraph>
        <BulletList
          items={[
            "Other users, limited to content and profile details you choose to make public (e.g. profile visibility settings).",
            "Service providers who help us operate the app, such as our hosting, database, and storage provider, under confidentiality obligations.",
            "Third-party map and weather providers, which receive trail coordinates needed to display maps and forecasts, but not your personal account information.",
            "Authorities, if required by law, to protect our rights, or to prevent fraud or harm.",
          ]}
        />

        <SectionTitle>5. Data Retention</SectionTitle>
        <Paragraph>
          We retain your information for as long as your account is active or as needed to
          provide you services. If you delete your account, we will delete or anonymize your
          personal data within a reasonable period, except where retention is required by law.
        </Paragraph>

        <SectionTitle>6. Your Rights &amp; Choices</SectionTitle>
        <Paragraph>Depending on your location, you may have the right to:</Paragraph>
        <BulletList
          items={[
            "Access, correct, or update your personal information from within the app.",
            "Request deletion of your account and associated data from the Settings screen.",
            "Control which notifications you receive.",
            "Change your profile visibility between public and private.",
            "Object to or restrict certain uses of your data by contacting us.",
          ]}
        />

        <SectionTitle>7. Security</SectionTitle>
        <Paragraph>
          We use industry-standard technical and organizational measures to protect your
          information from unauthorized access, alteration, disclosure, or destruction. However,
          no method of transmission or storage is completely secure, and we cannot guarantee
          absolute security.
        </Paragraph>

        <SectionTitle>8. Children's Privacy</SectionTitle>
        <Paragraph>
          Summit is not intended for children under the age of 13. We do not knowingly collect
          personal information from children under 13. If you believe a child has provided us
          with personal information, please contact us so we can delete it.
        </Paragraph>

        <SectionTitle>9. Changes to This Policy</SectionTitle>
        <Paragraph>
          We may update this Privacy Policy from time to time. We will notify you of material
          changes by updating the "Last updated" date above or through an in-app notice.
        </Paragraph>

        <SectionTitle>10. Contact Us</SectionTitle>
        <Paragraph>
          If you have questions or concerns about this Privacy Policy or our data practices,
          please contact us at privacy@summitapp.com.
        </Paragraph>

        <Paragraph style={styles.approvalNote}>
          Reviewed and approved by the app owner (final decision-maker) on July 8, 2026. This
          policy has not been reviewed by a licensed attorney; jurisdiction-specific requirements
          (e.g. GDPR/CCPA formal request handling) should be revisited with legal counsel before
          expanding to new markets or adding new data collection.
        </Paragraph>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backBtn: { marginLeft: -6, marginRight: 4, padding: 2 },
  title: { fontFamily: "Inter_700Bold", fontSize: 22, color: Colors.text, letterSpacing: -0.5 },
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  updated: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text3,
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.text,
    marginTop: 24,
    marginBottom: 8,
  },
  paragraph: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 21,
    color: Colors.text2,
    marginBottom: 4,
  },
  bulletList: { marginTop: 8 },
  bulletRow: { flexDirection: "row", marginBottom: 8, paddingRight: 8 },
  bulletDot: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.accent,
    marginRight: 8,
    lineHeight: 21,
  },
  bulletText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 21,
    color: Colors.text2,
    flex: 1,
  },
  approvalNote: {
    marginTop: 24,
    fontStyle: "italic",
    color: Colors.text3,
    fontSize: 12,
    lineHeight: 18,
  },
});
