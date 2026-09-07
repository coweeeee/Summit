import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import type { LegalDocument } from "@/lib/legalContent";

/**
 * Renders a legal document from lib/legalContent.ts.
 *
 * The two screens that use this used to hold their own copy of the text inline
 * as JSX. They no longer do, because the same documents must also be served
 * publicly from web/ for App Store Connect, and two hand-maintained copies of a
 * legal document drift. The text is data now; this is one of its two renderers.
 * The other is web/api/legal.ts.
 *
 * Styling is unchanged from the inline versions, deliberately -- this was an
 * extraction, not a redesign, so a reviewer can see the text moved and nothing
 * else did.
 */
export default function LegalDocumentScreen({ document }: { document: LegalDocument }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={28} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>{document.title}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>Last updated: {document.lastUpdated}</Text>

        {document.blocks.map((block, i) => {
          // Index keys are acceptable here and nowhere else in this app: the
          // list is a static, ordered document that is never reordered,
          // filtered or appended to at runtime.
          if (block.kind === "heading") {
            return <Text key={i} style={styles.sectionTitle}>{block.text}</Text>;
          }
          if (block.kind === "paragraph") {
            return <Text key={i} style={styles.paragraph}>{block.text}</Text>;
          }
          return (
            <View key={i} style={styles.bulletList}>
              {block.items.map((item, j) => (
                <View key={j} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>{"•"}</Text>
                  <Text style={styles.bulletText}>{item}</Text>
                </View>
              ))}
            </View>
          );
        })}

        <Text style={[styles.paragraph, styles.approvalNote]}>{document.approvalNote}</Text>
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
