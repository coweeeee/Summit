import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";

// The "there is nothing here" block, with somewhere to go.
//
// Five screens rendered near-identical versions of this — icon, title, subtext —
// and none of them offered an action, so every one was a dead end. Extracted
// rather than adding a button to each copy, which would have made five near-
// identical blocks into five near-identical blocks plus five buttons.
//
// Two rules this encodes, because they were the actual problem rather than the
// missing markup:
//
//   - Never render this while data is still loading. A screen asserting "No
//     hikes yet" to someone who has hikes is worse than saying nothing, and
//     that is exactly what several of these did on every cold start. The
//     callers gate on their loading flag; this component cannot know.
//   - An action is optional. Some zero states are good news — nobody should be
//     nudged toward blocking someone — and a spinner never wants a button.

type Props = {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  message?: string;
  /** Omit both to render a plain, actionless empty state. */
  actionLabel?: string;
  onAction?: () => void;
  iconSize?: number;
};

export default function EmptyState({ icon, title, message, actionLabel, onAction, iconSize = 40 }: Props) {
  return (
    <View style={styles.wrap}>
      <Feather name={icon} size={iconSize} color={Colors.text3} />
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", paddingVertical: 48, paddingHorizontal: 32, gap: 6 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text2, marginTop: 8 },
  message: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text3, textAlign: "center", lineHeight: 18 },
  action: {
    marginTop: 16,
    paddingVertical: 11, paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: Colors.green2,
  },
  actionText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
});
