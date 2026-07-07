import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function SettingsRow({
  icon,
  label,
  value,
  onPress,
  isSwitch,
  switchValue,
  onSwitch,
  danger,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value?: string;
  onPress?: () => void;
  isSwitch?: boolean;
  switchValue?: boolean;
  onSwitch?: (v: boolean) => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed && !isSwitch ? 0.6 : 1 }]}
    >
      <View style={styles.rowLeft}>
        <View style={[styles.iconWrap, danger && styles.iconWrapDanger]}>
          <Feather name={icon} size={17} color={danger ? Colors.red : Colors.accent} />
        </View>
        <Text style={[styles.rowLabel, danger && { color: Colors.red }]}>{label}</Text>
      </View>
      {isSwitch ? (
        <Switch
          value={switchValue}
          onValueChange={onSwitch}
          trackColor={{ false: Colors.surface2, true: Colors.green2 }}
          thumbColor="#fff"
        />
      ) : (
        <View style={styles.rowRight}>
          {value ? <Text style={styles.rowValue}>{value}</Text> : null}
          {!danger && <Feather name="chevron-right" size={16} color={Colors.text3} />}
        </View>
      )}
    </Pressable>
  );
}

function getInitials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const router = useRouter();
  const { profile, signOut, refreshProfile } = useAuth();

  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState(profile?.full_name || "");
  const [editBio, setEditBio] = useState((profile as any)?.bio || "");
  const [editUsername, setEditUsername] = useState((profile as any)?.username || "");
  const [saveLoading, setSaveLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);

  const [notifLikes, setNotifLikes] = useState(true);
  const [notifFollows, setNotifFollows] = useState(true);
  const [notifMilestones, setNotifMilestones] = useState(true);
  const [units, setUnits] = useState<"imperial" | "metric">("imperial");

  const handleSaveProfile = async () => {
    if (!profile) return;
    setSaveLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: editName.trim(),
        bio: editBio.trim(),
        username: editUsername.trim() || null,
      })
      .eq("id", profile.id);
    setSaveLoading(false);
    if (error) { Alert.alert("Error", error.message); return; }
    await refreshProfile();
    setShowEditModal(false);
    Alert.alert("Saved!", "Your profile has been updated.");
  };

  const handlePickAvatar = async () => {
    if (!profile) return;
    try {
      const ImagePicker = await import("expo-image-picker");
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Please allow photo access to set a profile picture.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1] as [number, number],
        quality: 0.7,
      });

      if (result.canceled || !result.assets[0]) return;

      setAvatarLoading(true);
      const asset = result.assets[0];
      const ext = asset.uri.split(".").pop() || "jpg";
      const fileName = `${profile.id}/avatar.${ext}`;

      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, arrayBuffer, { contentType: `image/${ext}`, upsert: true });

      if (uploadError) {
        setAvatarLoading(false);
        Alert.alert("Upload failed", uploadError.message);
        return;
      }

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(fileName);
      const avatarUrl = urlData.publicUrl + "?t=" + Date.now();

      await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", profile.id);
      await refreshProfile();
      setAvatarLoading(false);
      Alert.alert("Done!", "Profile picture updated.");
    } catch (e) {
      setAvatarLoading(false);
      Alert.alert("Error", "Could not pick image. Please try again.");
    }
  };

  const avatarUrl = (profile as any)?.avatar_url;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="chevron-left" size={28} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatarSection}>
          <Pressable onPress={handlePickAvatar} style={styles.avatarWrap} disabled={avatarLoading}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{getInitials(profile?.full_name || null)}</Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              {avatarLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Feather name="camera" size={12} color="#fff" />
              }
            </View>
          </Pressable>
          <Text style={styles.avatarName}>{profile?.full_name || "Your Name"}</Text>
          <Text style={styles.avatarSub}>Tap photo to change</Text>
        </View>

        <SectionHeader title="Account" />
        <View style={styles.section}>
          <SettingsRow
            icon="user"
            label="Edit Profile"
            onPress={() => {
              setEditName(profile?.full_name || "");
              setEditBio((profile as any)?.bio || "");
              setEditUsername((profile as any)?.username || "");
              setShowEditModal(true);
            }}
          />
          <SettingsRow
            icon="at-sign"
            label="Username"
            value={(profile as any)?.username || "Not set"}
            onPress={() => {
              setEditName(profile?.full_name || "");
              setEditBio((profile as any)?.bio || "");
              setEditUsername((profile as any)?.username || "");
              setShowEditModal(true);
            }}
          />
        </View>

        <SectionHeader title="Preferences" />
        <View style={styles.section}>
          <SettingsRow
            icon="map-pin"
            label="Units"
            value={units === "imperial" ? "Miles / Feet" : "km / Meters"}
            onPress={() => setUnits(u => u === "imperial" ? "metric" : "imperial")}
          />
        </View>

        <SectionHeader title="Notifications" />
        <View style={styles.section}>
          <SettingsRow icon="heart" label="Likes on your hikes" isSwitch switchValue={notifLikes} onSwitch={setNotifLikes} />
          <SettingsRow icon="user-plus" label="New followers" isSwitch switchValue={notifFollows} onSwitch={setNotifFollows} />
          <SettingsRow icon="award" label="Milestones & badges" isSwitch switchValue={notifMilestones} onSwitch={setNotifMilestones} />
        </View>

        <SectionHeader title="Privacy" />
        <View style={styles.section}>
          <SettingsRow
            icon="globe"
            label="Profile visibility"
            value="Public"
            onPress={() => Alert.alert("Profile visibility", "Your profile is public and visible to all Summit users.")}
          />
        </View>

        <SectionHeader title="About" />
        <View style={styles.section}>
          <SettingsRow icon="info" label="Version" value="1.0.0" />
          <SettingsRow
            icon="star"
            label="Rate Summit"
            onPress={() => Alert.alert("Rate Summit", "Thank you! Rating will be available after App Store publish.")}
          />
        </View>

        <SectionHeader title="Danger zone" />
        <View style={styles.section}>
          <SettingsRow icon="log-out" label="Sign Out" onPress={signOut} danger />
        </View>
      </ScrollView>

      <Modal visible={showEditModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { paddingTop: insets.top + 16 }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowEditModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <Pressable onPress={handleSaveProfile} disabled={saveLoading}>
              {saveLoading
                ? <ActivityIndicator color={Colors.accent} />
                : <Text style={styles.modalSave}>Save</Text>
              }
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalLabel}>Full Name</Text>
            <TextInput
              style={styles.modalInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Your full name"
              placeholderTextColor={Colors.text3}
              autoCapitalize="words"
            />

            <Text style={styles.modalLabel}>Username</Text>
            <TextInput
              style={styles.modalInput}
              value={editUsername}
              onChangeText={setEditUsername}
              placeholder="@username"
              placeholderTextColor={Colors.text3}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.modalLabel}>Bio</Text>
            <TextInput
              style={[styles.modalInput, styles.modalTextarea]}
              value={editBio}
              onChangeText={setEditBio}
              placeholder="Tell people about your hiking style..."
              placeholderTextColor={Colors.text3}
              multiline
              numberOfLines={4}
              maxLength={160}
            />
            <Text style={styles.charCount}>{editBio.length}/160</Text>
          </ScrollView>
        </View>
      </Modal>
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
  title: { fontFamily: "Inter_700Bold", fontSize: 26, color: Colors.text, letterSpacing: -0.5 },
  content: { paddingBottom: 40 },
  avatarSection: { alignItems: "center", paddingVertical: 24 },
  avatarWrap: { position: "relative", marginBottom: 10 },
  avatarImg: { width: 80, height: 80, borderRadius: 40, borderWidth: 2.5, borderColor: Colors.green },
  avatarFallback: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.surface2, borderWidth: 2.5, borderColor: Colors.green,
    alignItems: "center", justifyContent: "center",
  },
  avatarInitials: { fontFamily: "Inter_700Bold", fontSize: 30, color: Colors.accent },
  avatarEditBadge: {
    position: "absolute", bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.green2,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: Colors.bg,
  },
  avatarName: { fontFamily: "Inter_600SemiBold", fontSize: 18, color: Colors.text },
  avatarSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3, marginTop: 2 },
  sectionHeader: {
    fontFamily: "Inter_500Medium", fontSize: 11, letterSpacing: 1.2,
    textTransform: "uppercase", color: Colors.text3,
    paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8,
  },
  section: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg3 },
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 13, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: { width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center" },
  iconWrapDanger: { backgroundColor: "rgba(196,96,96,0.15)" },
  rowLabel: { fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.text },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowValue: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text3 },
  modalContainer: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalCancel: { fontFamily: "Inter_400Regular", fontSize: 16, color: Colors.text3 },
  modalTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  modalSave: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.accent },
  modalContent: { padding: 20, paddingBottom: 40 },
  modalLabel: {
    fontFamily: "Inter_500Medium", fontSize: 11, letterSpacing: 1,
    textTransform: "uppercase", color: Colors.text3,
    marginBottom: 8, marginTop: 16,
  },
  modalInput: {
    backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.text,
  },
  modalTextarea: { minHeight: 100, textAlignVertical: "top" },
  charCount: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3, textAlign: "right", marginTop: 4 },
});
