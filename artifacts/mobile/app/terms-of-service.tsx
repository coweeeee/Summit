import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, StyleProp, Text, TextStyle, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function Paragraph({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.paragraph, style]}>{children}</Text>;
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

export default function TermsOfServiceScreen() {
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
        <Text style={styles.title}>Terms of Service</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>Last updated: July 8, 2026</Text>

        <Paragraph>
          These Terms of Service ("Terms") govern your access to and use of Summit (the "App").
          By creating an account or using the App, you agree to be bound by these Terms. If you
          do not agree, please do not use the App.
        </Paragraph>

        <SectionTitle>1. Eligibility &amp; Accounts</SectionTitle>
        <Paragraph>To use Summit, you must:</Paragraph>
        <BulletList
          items={[
            "Be at least 13 years old, or the minimum age required in your country to use the App.",
            "Provide accurate and complete registration information.",
            "Keep your password confidential and be responsible for all activity on your account.",
            "Notify us promptly of any unauthorized use of your account.",
          ]}
        />

        <SectionTitle>2. Use of the App</SectionTitle>
        <Paragraph>
          Summit lets you record hikes, track statistics, share photos and comments, and connect
          with other outdoor enthusiasts. You agree to use the App only for lawful purposes and
          in accordance with these Terms.
        </Paragraph>

        <SectionTitle>3. Acceptable Use</SectionTitle>
        <Paragraph>You agree not to:</Paragraph>
        <BulletList
          items={[
            "Post content that is unlawful, harassing, defamatory, obscene, or infringes on others' rights.",
            "Impersonate any person or entity, or misrepresent your affiliation with anyone.",
            "Upload viruses, malware, or attempt to disrupt or compromise the App's security.",
            "Scrape, reverse engineer, or use automated means to access the App without permission.",
            "Use the App to harm, threaten, or endanger yourself or others, including sharing false or misleading trail or safety information.",
            "Violate any applicable local, state, national, or international law.",
          ]}
        />

        <SectionTitle>4. User Content</SectionTitle>
        <Paragraph>
          You retain ownership of the photos, comments, and other content you post ("User
          Content"). By posting User Content, you grant Summit a worldwide, non-exclusive,
          royalty-free license to host, store, display, and distribute that content within the
          App for the purpose of operating and promoting the service. You are solely responsible
          for the content you share and confirm you have the necessary rights to share it.
        </Paragraph>

        <SectionTitle>5. Safety Disclaimer</SectionTitle>
        <Paragraph>
          Hiking and outdoor activities carry inherent risks, including injury, exposure to
          weather, wildlife encounters, and getting lost. Summit is a tracking and social
          companion app, not a safety device or guarantee of accurate trail conditions. You use
          the App and any trail information at your own risk, and you are solely responsible for
          your own safety, preparation, and decisions while hiking.
        </Paragraph>

        <SectionTitle>6. Intellectual Property</SectionTitle>
        <Paragraph>
          The App, including its design, logos, graphics, and software (excluding User Content),
          is owned by Summit and protected by intellectual property laws. You may not copy,
          modify, distribute, or create derivative works from the App without our written
          permission.
        </Paragraph>

        <SectionTitle>7. Termination</SectionTitle>
        <Paragraph>
          You may delete your account at any time from Settings. We may suspend or terminate
          your access to the App if you violate these Terms, engage in fraudulent or harmful
          activity, or for any other reason at our discretion, with or without notice.
        </Paragraph>

        <SectionTitle>8. Disclaimers</SectionTitle>
        <Paragraph>
          The App is provided "as is" and "as available" without warranties of any kind, whether
          express or implied, including but not limited to accuracy, reliability, or fitness for
          a particular purpose. We do not guarantee the App will be uninterrupted, secure, or
          error-free.
        </Paragraph>

        <SectionTitle>9. Limitation of Liability</SectionTitle>
        <Paragraph>
          To the fullest extent permitted by law, Summit and its affiliates shall not be liable
          for any indirect, incidental, special, consequential, or punitive damages, including
          personal injury while hiking, arising from your use of or inability to use the App.
        </Paragraph>

        <SectionTitle>10. Changes to These Terms</SectionTitle>
        <Paragraph>
          We may update these Terms from time to time. Continued use of the App after changes
          take effect constitutes acceptance of the updated Terms. Material changes will be
          reflected by the "Last updated" date above.
        </Paragraph>

        <SectionTitle>11. Contact Us</SectionTitle>
        <Paragraph>
          If you have any questions about these Terms, please contact us at
          support@summitapp.com.
        </Paragraph>

        <Paragraph style={styles.approvalNote}>
          Reviewed and approved by the app owner (final decision-maker) on July 8, 2026. These
          Terms have not been reviewed by a licensed attorney; provisions such as arbitration,
          dispute resolution, and governing law should be revisited with legal counsel before
          expanding to new markets.
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
