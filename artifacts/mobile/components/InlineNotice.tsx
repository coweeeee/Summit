import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";

// A one-line banner that sits above working content, with an optional action.
//
// Explicitly NOT EmptyState, and named so the two cannot be confused. EmptyState
// is a page-filling block — 48pt of vertical padding, centred, a solid primary
// button — which is right when there is genuinely nothing to show. It is wrong
// for a recoverable condition sitting on top of content that works: using it to
// ask for a location permission would blank out 225 perfectly good trails to
// deliver an optional upsell.
//
// The rule of thumb between them: if the screen has something worth reading
// behind the message, it is an InlineNotice. If the screen is empty without it,
// it is an EmptyState.

type Props = {
  icon: React.ComponentProps<typeof Feather>["name"];
  message: string;
  /** Omit both for a plain, actionless notice. */
  actionLabel?: string;
  onAction?: () => void;
  /** Amber for something the user may want to fix; neutral for pure information. */
  tone?: "info" | "attention";
};

export default function InlineNotice({ icon, message, actionLabel, onAction, tone = "info" }: Props) {
  const accent = tone === "attention" ? Colors.amber : Colors.text3;
  return (
    <View style={styles.wrap}>
      <Feather name={icon} size={14} color={accent} style={styles.icon} />
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg3,
  },
  icon: { flexShrink: 0 },
  // flexShrink so a long message wraps inside the banner rather than pushing
  // the action off the right edge.
  message: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3, lineHeight: 16 },
  action: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.accent, flexShrink: 0 },
});
