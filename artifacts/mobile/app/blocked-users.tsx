import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { ANONYMOUS_LABEL, displayName } from "@/lib/format";
import Avatar from "@/components/Avatar";

type BlockedUser = { id: string; full_name: string | null; username: string | null; avatar_url: string | null; avatar_preset: string | null; blockRowId?: string };

export default function BlockedUsersScreen() {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const router = useRouter();

  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  // Starts true. It was false, and fetchBlockedUsers early-returns on a null
  // profile *before* setting it, so the screen asserted "No blocked users"
  // before it had looked — a flash of wrong information in the same slot the
  // real answer lands in. profile always arrives for a signed-in user, and this
  // screen is only reachable signed in.
  const [blockedLoading, setBlockedLoading] = useState(true);

  const fetchBlockedUsers = async () => {
    if (!profile) return;
    setBlockedLoading(true);
    const { data: blockRows } = await supabase.from("blocks").select("id, blocked_id").eq("blocker_id", profile.id);
    if (blockRows && blockRows.length > 0) {
      const ids = blockRows.map((r: any) => r.blocked_id);
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, username, avatar_url, avatar_preset").in("id", ids);
      if (profiles) {
        const rowMap: Record<string, string> = {};
        blockRows.forEach((r: any) => { rowMap[r.blocked_id] = r.id; });
        setBlockedUsers(profiles.map((p: any) => ({ ...p, blockRowId: rowMap[p.id] })));
      }
    } else {
      setBlockedUsers([]);
    }
    setBlockedLoading(false);
  };

  const unblockUser = (userId: string, name: string | null) => {
    Alert.alert(
      "Unblock " + (name || ANONYMOUS_LABEL) + "?",
      "They will be able to see your posts again.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Unblock", onPress: async () => {
          if (!profile) return;
          await supabase.from("blocks").delete().eq("blocker_id", profile.id).eq("blocked_id", userId);
          setBlockedUsers(prev => prev.filter(u => u.id !== userId));
        }},
      ]
    );
  };

  useEffect(() => { fetchBlockedUsers(); }, [profile?.id]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Feather name="chevron-left" size={28} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Blocked Accounts</Text>
      </View>

      {blockedLoading ? (
        <View style={styles.empty}><ActivityIndicator color={Colors.accent} /></View>
      ) : blockedUsers.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="slash" size={36} color={Colors.text3} />
          <Text style={styles.emptyText}>No blocked users</Text>
          <Text style={styles.emptySubtext}>Users you block won't see your content and you won't see theirs</Text>
        </View>
      ) : (
        <>
          <Text style={styles.sectionLabel}>Blocked Users ({blockedUsers.length})</Text>
          {blockedUsers.map(u => (
            <View key={u.id} style={styles.blockedRow}>
              <Avatar profile={u} size={40} />
              <Text style={styles.blockedName} numberOfLines={1}>{displayName(u)}</Text>
              <Pressable
                onPress={() => unblockUser(u.id, displayName(u))}
                style={({ pressed }) => [styles.unblockBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={styles.unblockBtnText}>Unblock</Text>
              </Pressable>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  title: { fontFamily: "Inter_700Bold", fontSize: 20, color: Colors.text },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, paddingHorizontal: 32, gap: 6 },
  emptyText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text, marginTop: 8 },
  emptySubtext: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text3, textAlign: "center" },
  sectionLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.text3, textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: 20, marginBottom: 8, marginTop: 8 },
  blockedRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
  blockedName: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text },
  unblockBtn: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: Colors.border2, backgroundColor: Colors.bg3 },
  unblockBtnText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text2 },
});
