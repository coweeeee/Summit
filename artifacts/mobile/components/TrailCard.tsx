import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import Colors from "@/constants/colors";
import { Hike } from "@/context/HikesContext";
import { DistanceUnit, formatDistance, formatElevation } from "@/lib/units";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  hike: Hike & { likes?: number };
  liked: boolean;
  onLike: () => void;
  userInitials?: string;
  userColor?: string;
  distanceUnit?: DistanceUnit;
};

function getDifficultyStyle(diff: string) {
  switch (diff.toLowerCase()) {
    case "easy":
      return { bg: "rgba(109,184,122,0.15)", color: Colors.green, border: "rgba(109,184,122,0.3)" };
    case "moderate":
      return { bg: "rgba(212,148,58,0.15)", color: Colors.amber, border: "rgba(212,148,58,0.3)" };
    case "hard":
    case "expert":
      return { bg: "rgba(196,96,96,0.15)", color: Colors.red, border: "rgba(196,96,96,0.3)" };
    default:
      return { bg: "rgba(109,184,122,0.15)", color: Colors.green, border: "rgba(109,184,122,0.3)" };
  }
}

function getElevPoints(diff: string): string {
  switch (diff.toLowerCase()) {
    case "easy":
      return "0,50 80,48 160,44 240,46 320,42 420,40";
    case "moderate":
      return "0,55 40,50 80,42 120,28 160,18 200,22 240,16 280,10 320,20 360,35 420,45";
    case "hard":
    case "expert":
      return "0,58 30,55 60,48 90,35 120,20 150,8 180,5 210,12 240,22 270,30 300,25 340,18 380,22 420,28";
    default:
      return "0,50 80,48 160,44 240,46 320,42 420,40";
  }
}

function getElevColor(diff: string): string {
  switch (diff.toLowerCase()) {
    case "easy": return "rgba(122,184,200,0.5)";
    case "moderate": return "rgba(109,184,122,0.5)";
    case "hard":
    case "expert": return "rgba(196,96,96,0.5)";
    default: return "rgba(109,184,122,0.5)";
  }
}

function getElevFill(diff: string): string {
  switch (diff.toLowerCase()) {
    case "easy": return "rgba(122,184,200,0.1)";
    case "moderate": return "rgba(109,184,122,0.1)";
    case "hard":
    case "expert": return "rgba(196,96,96,0.1)";
    default: return "rgba(109,184,122,0.1)";
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 86400) return "today";
  if (diff < 172800) return "yesterday";
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  if (diff < 1209600) return "1 week ago";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getDimColor(name: string): string {
  const map: Record<string, string> = {
    "Scenery": Colors.amber,
    "Views": Colors.sky,
    "Trail Cond.": Colors.green,
    "Trail Condition": Colors.green,
    "Crowds": Colors.amber,
    "Difficulty": Colors.red,
    "Accessibility": Colors.sky,
  };
  return map[name] ?? Colors.text2;
}

function LikeButton({ liked, likes, onLike }: { liked: boolean; likes: number; onLike: () => void }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSpring(1.3, {}, () => {
      scale.value = withSpring(1);
    });
    onLike();
  };

  return (
    <Pressable onPress={handlePress} style={styles.likeBtn}>
      <Animated.View style={[styles.likeBtnInner, style]}>
        <Feather name="heart" size={14} color={liked ? Colors.red : Colors.text3} />
        <Text style={[styles.likeBtnText, liked && { color: Colors.red }]}>
          {likes}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function TrailCard({ hike, liked, onLike, userInitials = "AL", userColor = Colors.accent, distanceUnit = "imperial" }: Props) {
  const diffStyle = getDifficultyStyle(hike.difficulty);
  const points = getElevPoints(hike.difficulty);
  const elevColor = getElevColor(hike.difficulty);
  const elevFill = getElevFill(hike.difficulty);
  const totalLikes = (hike.likes ?? 0) + (liked ? 1 : 0);

  return (
    <View style={styles.card}>
      <View style={styles.imgArea}>
        <View style={styles.elevChart}>
          {/* Simple elevation line visualization using a View strip */}
        </View>
        <View style={[styles.diffBadge, { backgroundColor: diffStyle.bg, borderColor: diffStyle.border }]}>
          <Text style={[styles.diffText, { color: diffStyle.color }]}>{hike.difficulty}</Text>
        </View>
        <View style={styles.elevLineContainer}>
          <View style={[styles.elevBar, { backgroundColor: elevColor }]} />
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.metaRow}>
          <Text style={styles.trailName} numberOfLines={1}>{hike.trailName}</Text>
          <View style={styles.ratingRow}>
            <Feather name="star" size={12} color={Colors.amber2} />
            <Text style={styles.ratingText}>{hike.overallScore.toFixed(1)}</Text>
          </View>
        </View>
        <Text style={styles.location} numberOfLines={1}>{hike.location}</Text>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{formatDistance(hike.distanceMi, distanceUnit)}</Text>
            <Text style={styles.statLbl}>Distance</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{formatElevation(hike.elevationFt, distanceUnit)}</Text>
            <Text style={styles.statLbl}>Elevation</Text>
          </View>
          {hike.durationHr && (
            <View style={styles.stat}>
              <Text style={styles.statVal}>{hike.durationHr} hr</Text>
              <Text style={styles.statLbl}>Duration</Text>
            </View>
          )}
        </View>
        {hike.dimRatings.length > 0 && (
          <View style={styles.dimRow}>
            {hike.dimRatings.slice(0, 3).map((d) => (
              <View key={d.name} style={styles.dimPill}>
                <View style={[styles.dimDot, { backgroundColor: getDimColor(d.name) }]} />
                <Text style={styles.dimText}>{d.name} {d.score}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.userChip}>
          <View style={[styles.userAvatar, { backgroundColor: Colors.surface2 }]}>
            <Text style={[styles.userInitials, { color: userColor }]}>{userInitials}</Text>
          </View>
          <View>
            <Text style={styles.userName}>You</Text>
            <Text style={styles.userTime}>{formatDate(hike.date)}</Text>
          </View>
        </View>
        <LikeButton liked={liked} likes={totalLikes} onLike={onLike} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.bg3,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  imgArea: {
    height: 100,
    backgroundColor: Colors.surface,
    position: "relative",
    justifyContent: "flex-end",
  },
  elevChart: {
    position: "absolute",
    inset: 0,
  },
  elevLineContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  elevBar: {
    flex: 1,
    borderRadius: 2,
    opacity: 0.6,
  },
  diffBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  diffText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
  },
  body: {
    padding: 14,
    paddingBottom: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  trailName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingText: {
    fontSize: 13,
    color: Colors.amber2,
    fontFamily: "Inter_500Medium",
  },
  location: {
    fontSize: 12,
    color: Colors.text3,
    marginBottom: 10,
    fontFamily: "Inter_400Regular",
  },
  statsRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 10,
  },
  stat: {
    gap: 1,
  },
  statVal: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  statLbl: {
    fontSize: 10,
    color: Colors.text3,
    fontFamily: "Inter_400Regular",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dimRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  dimPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.surface,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 20,
  },
  dimDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dimText: {
    fontSize: 11,
    color: Colors.text2,
    fontFamily: "Inter_400Regular",
  },
  footer: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
  },
  userChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  userAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  userInitials: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  userName: {
    fontSize: 12,
    color: Colors.text2,
    fontFamily: "Inter_500Medium",
  },
  userTime: {
    fontSize: 11,
    color: Colors.text3,
    fontFamily: "Inter_400Regular",
  },
  likeBtn: {
    padding: 6,
  },
  likeBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  likeBtnText: {
    fontSize: 12,
    color: Colors.text3,
    fontFamily: "Inter_500Medium",
  },
});
