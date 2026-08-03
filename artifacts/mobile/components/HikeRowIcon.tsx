import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";
import { getAvatarPreset, PRESET_DISC_ALPHA } from "@/lib/avatars";
import { trailIconKey } from "@/lib/trailIcons";

// The icon beside a hike in a list, derived from the trail's tags.
//
// Shared rather than written twice: `profile.tsx` and `user-profile.tsx` both
// render hike rows, and they previously held identical copies of the same
// hardcoded trending-up glyph. Duplicating it again — with mapping logic this
// time — is how the two drift.
//
// The tinted disc matches the avatar presets and the difficulty pills, so a
// hike row reads as part of the same system rather than a new visual language.

type Props = {
  tags: readonly (string | null | undefined)[] | null | undefined;
  /** Row icons differ slightly between the two screens; 40 and 36 are in use. */
  size?: number;
};

export default function HikeRowIcon({ tags, size = 40 }: Props) {
  // trailIconKey always returns a key that exists, so the fallback below is for
  // the type checker rather than a state that can occur.
  const preset = getAvatarPreset(trailIconKey(tags));
  if (!preset) return null;

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 4,
          backgroundColor: preset.color + PRESET_DISC_ALPHA,
        },
      ]}
    >
      <MaterialCommunityIcons name={preset.icon} size={Math.round(size * 0.5)} color={preset.color} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", flexShrink: 0 },
});
