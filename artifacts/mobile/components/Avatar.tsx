import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Colors from "@/constants/colors";
import { getAvatarPreset, initialsColor, PRESET_DISC_ALPHA } from "@/lib/avatars";
import { profileInitials } from "@/lib/format";

// One avatar for the whole app.
//
// Seven screens rendered this by hand, and the copies had diverged in ways
// users could see. Two of them — the feed and Discover's People tab — never
// rendered `avatar_url` at all and showed initials unconditionally, so
// uploading a profile picture appeared to do nothing on the two screens where
// people are seen most. The other five each had their own sizes, their own
// fallback disc, and their own idea of the fallback colour.
//
// Everything also used React Native's Image, so avatars were the only remote
// images in the app with no caching — expo-image gives them the same
// memory/disk policy the feed's hike photos already had.

export type AvatarProfile = {
  id?: string | null;
  full_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  avatar_preset?: string | null;
};

type Props = {
  profile: AvatarProfile | null | undefined;
  size: number;
  /** Set to draw a ring. The profile headers use 2.5 in Colors.green. */
  ringWidth?: number;
  ringColor?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Precedence: uploaded photo, then preset, then initials.
 *
 * The picker keeps `avatar_url` and `avatar_preset` mutually exclusive, so in
 * practice at most one is set. The order still matters for rows that predate
 * the picker, and for the moment between an upload landing and a preset being
 * cleared — an uploaded photo is the more specific claim about a person, so it
 * wins.
 *
 * The frame is always a View, with the photo filling it rather than being
 * styled directly. That keeps one code path for the size, the ring and the
 * circle — and expo-image types its style as ImageStyle, which cannot accept
 * the ViewStyle the other two branches need.
 */
export default function Avatar({ profile, size, ringWidth, ringColor, style }: Props) {
  const preset = getAvatarPreset(profile?.avatar_preset);
  const photo = profile?.avatar_url;

  // Ratios derived from the sizes the hand-rolled copies actually used, which
  // clustered tightly enough (0.34–0.40 for text) to be one number.
  const fontSize = Math.round(size * 0.38);
  const iconSize = Math.round(size * 0.55);

  const frame: ViewStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    ...(ringWidth ? { borderWidth: ringWidth, borderColor: ringColor ?? Colors.green } : null),
    ...(photo ? null : { backgroundColor: preset ? preset.color + PRESET_DISC_ALPHA : initialsColor(profile?.id) }),
  };

  return (
    <View style={[styles.frame, frame, style]}>
      {photo ? (
        <Image
          source={photo}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : preset ? (
        <MaterialCommunityIcons name={preset.icon} size={iconSize} color={preset.color} />
      ) : (
        <Text
          style={[
            styles.initials,
            { fontSize, fontFamily: size >= 50 ? "Inter_700Bold" : "Inter_600SemiBold" },
          ]}
        >
          {profileInitials(profile)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" },
  initials: { color: Colors.accent },
});
