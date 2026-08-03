import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { USERNAME_RULE_HINT, isValidUsername, normalizeUsername } from "@/lib/username";
import { uploadImage } from "@/lib/upload";
import Avatar from "@/components/Avatar";
import { AVATAR_PRESETS, PRESET_DISC_ALPHA } from "@/lib/avatars";

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

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const router = useRouter();
  const { profile, session, signOut, refreshProfile, claimUsername } = useAuth();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [deleteLoading, setDeleteLoading] = useState(false);

    const handleDeleteAccount = async () => {
      if (!session) return;
      setDeleteLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("delete-account");
        if (error || data?.error) {
          setDeleteLoading(false);
          Alert.alert("Deletion failed", error?.message || data?.error || "Something went wrong. Please try again.");
          return;
        }
        setDeleteLoading(false);
        setShowDeleteModal(false);
        await signOut();
      } catch (e: any) {
        setDeleteLoading(false);
        Alert.alert("Deletion failed", e?.message || "Something went wrong. Please try again.");
      }
    };

    const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState(profile?.full_name || "");
  const [editBio, setEditBio] = useState(profile?.bio || "");
  const [editUsername, setEditUsername] = useState(profile?.username || "");
  const [saveLoading, setSaveLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  // The icon grid lives behind this rather than inline on the Settings screen.
  // Choosing a profile picture is something you do once and then never think
  // about, so twenty coloured circles do not belong in the resting state of a
  // screen you open to flip a notification switch.
  const [showAvatarModal, setShowAvatarModal] = useState(false);

  const [isPrivate, setIsPrivate] = useState(profile?.is_private ?? false);

  const handleTogglePrivate = async (next: boolean) => {
    const previous = isPrivate;
    setIsPrivate(next);
    if (profile?.id) {
      const { error } = await supabase.from("profiles").update({ is_private: next }).eq("id", profile.id);
      if (error) {
        setIsPrivate(previous);
        Alert.alert("Error", "Could not save privacy setting. Please try again.");
      } else {
        await refreshProfile();
      }
    }
  };

  const [notifLikes, setNotifLikes] = useState(
    profile?.notif_likes ?? true
  );
  const [notifFollows, setNotifFollows] = useState(
    profile?.notif_follows ?? true
  );
  const [notifMilestones, setNotifMilestones] = useState(
    profile?.notif_milestones ?? true
  );
  const [notifComments, setNotifComments] = useState(
    profile?.notif_comments ?? true
  );
  const [units, setUnits] = useState<"imperial" | "metric">(
    profile?.distance_unit || "imperial"
  );

  // Every control below is initialized from `profile`, which can still be
  // loading when this screen mounts. Without this resync the switches would
  // keep showing their fallback defaults while the database says otherwise.
  useEffect(() => {
    if (!profile) return;
    setIsPrivate(profile.is_private);
    setNotifLikes(profile.notif_likes);
    setNotifFollows(profile.notif_follows);
    setNotifMilestones(profile.notif_milestones);
    setNotifComments(profile.notif_comments);
    setUnits(profile.distance_unit);
  }, [profile]);

  const handleToggleUnits = async () => {
    const next = units === "imperial" ? "metric" : "imperial";
    setUnits(next);
    if (profile?.id) {
      const { error } = await supabase.from("profiles").update({ distance_unit: next }).eq("id", profile.id);
      if (error) {
        setUnits(units);
        Alert.alert("Error", "Could not save unit preference. Please try again.");
      } else {
        await refreshProfile();
      }
    }
  };

  const handleToggleLikes = async (next: boolean) => {
    const previous = notifLikes;
    setNotifLikes(next);
    if (profile?.id) {
      const { error } = await supabase.from("profiles").update({ notif_likes: next }).eq("id", profile.id);
      if (error) {
        setNotifLikes(previous);
        Alert.alert("Error", "Could not save notification preference. Please try again.");
      } else {
        await refreshProfile();
      }
    }
  };

  const handleToggleFollows = async (next: boolean) => {
    const previous = notifFollows;
    setNotifFollows(next);
    if (profile?.id) {
      const { error } = await supabase.from("profiles").update({ notif_follows: next }).eq("id", profile.id);
      if (error) {
        setNotifFollows(previous);
        Alert.alert("Error", "Could not save notification preference. Please try again.");
      } else {
        await refreshProfile();
      }
    }
  };

  const handleToggleMilestones = async (next: boolean) => {
    const previous = notifMilestones;
    setNotifMilestones(next);
    if (profile?.id) {
      const { error } = await supabase.from("profiles").update({ notif_milestones: next }).eq("id", profile.id);
      if (error) {
        setNotifMilestones(previous);
        Alert.alert("Error", "Could not save notification preference. Please try again.");
      } else {
        await refreshProfile();
      }
    }
  };

  const handleToggleComments = async (next: boolean) => {
    const previous = notifComments;
    setNotifComments(next);
    if (profile?.id) {
      const { error } = await supabase.from("profiles").update({ notif_comments: next }).eq("id", profile.id);
      if (error) {
        setNotifComments(previous);
        Alert.alert("Error", "Could not save notification preference. Please try again.");
      } else {
        await refreshProfile();
      }
    }
  };

  const handleSaveProfile = async () => {
    if (!profile) return;

    const nextUsername = normalizeUsername(editUsername);
    const usernameChanged = nextUsername !== (profile.username ?? "");

    // Validated before anything is written, so a rejected username can't leave
    // a half-saved profile behind.
    if (usernameChanged && !isValidUsername(nextUsername)) {
      Alert.alert("Invalid username", USERNAME_RULE_HINT);
      return;
    }

    setSaveLoading(true);

    // Username goes through claimUsername — the single validated write path,
    // shared with signup. Name and bio carry no uniqueness rules and are
    // written directly.
    if (usernameChanged) {
      const result = await claimUsername(nextUsername);
      if (!result.ok) {
        setSaveLoading(false);
        if (result.conflict) {
          Alert.alert("Username taken", "That username is already in use. Please choose another.");
        } else if (result.invalid) {
          Alert.alert("Invalid username", USERNAME_RULE_HINT);
        }
        return;
      }
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: editName.trim(),
        bio: editBio.trim(),
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
        // Required: React Native has no Blob.arrayBuffer(), so the bytes have
        // to come from here rather than from fetching the local file back.
        base64: true,
      });

      if (result.canceled || !result.assets[0]) return;

      setAvatarLoading(true);
      const asset = result.assets[0];
      if (!asset.base64) {
        setAvatarLoading(false);
        Alert.alert("Upload failed", "Could not read that image. Please try another.");
        return;
      }
      const ext = asset.uri.split(".").pop() || "jpg";
      const fileName = `${profile.id}/avatar.${ext}`;

      const { url: avatarUrl, error: uploadError } = await uploadImage(
        "avatars", fileName, asset.base64, ext
      );

      if (uploadError) {
        setAvatarLoading(false);
        Alert.alert("Upload failed", uploadError);
        return;
      }

      // Clearing the preset is what makes the two mutually exclusive, so a row
      // never carries both a photo and an icon for <Avatar> to choose between.
      await supabase.from("profiles").update({ avatar_url: avatarUrl, avatar_preset: null }).eq("id", profile.id);
      await refreshProfile();
      setAvatarLoading(false);
      setShowAvatarModal(false);
      Alert.alert("Done!", "Profile picture updated.");
    } catch (e) {
      setAvatarLoading(false);
      Alert.alert("Error", "Could not pick image. Please try again.");
    }
  };

  /**
   * Writes whichever of the two fields was chosen and nulls the other, which is
   * what keeps them mutually exclusive. Passing null for both is the "use my
   * initials" case.
   */
  const saveAvatarChoice = async (next: { avatar_url: string | null; avatar_preset: string | null }) => {
    if (!profile || avatarLoading) return;
    setAvatarLoading(true);
    const { error } = await supabase.from("profiles").update(next).eq("id", profile.id);
    setAvatarLoading(false);
    if (error) { Alert.alert("Could not save", error.message); return; }
    await refreshProfile();
    setShowAvatarModal(false);
  };

  // Tapping the icon you already have turns it off, so the grid doubles as its
  // own undo without needing a separate control for that one case.
  const handlePickPreset = (key: string) =>
    saveAvatarChoice({
      avatar_preset: profile?.avatar_preset === key ? null : key,
      avatar_url: null,
    });

  // Explicit route back to initials. Without it there was no way to remove an
  // uploaded photo at all — you could only replace it with another photo or an
  // icon, since the picker only ever set fields and never cleared them both.
  const handleUseInitials = () => saveAvatarChoice({ avatar_url: null, avatar_preset: null });

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
          <Pressable
            onPress={() => setShowAvatarModal(true)}
            style={styles.avatarWrap}
            disabled={avatarLoading}
            accessibilityRole="button"
            accessibilityLabel="Change profile picture"
          >
            <Avatar profile={profile} size={80} ringWidth={2.5} />
            <View style={styles.avatarEditBadge}>
              {avatarLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Feather name="camera" size={12} color="#fff" />
              }
            </View>
          </Pressable>
          <Text style={styles.avatarName}>{profile?.full_name || "Your Name"}</Text>
          <Text style={styles.avatarSub}>Tap to change</Text>
        </View>

        <SectionHeader title="Account" />
        <View style={styles.section}>
          <SettingsRow
            icon="user"
            label="Edit Profile"
            value={profile?.username ? `@${profile.username}` : "Not set"}
            onPress={() => {
              setEditName(profile?.full_name || "");
              setEditBio(profile?.bio || "");
              setEditUsername(profile?.username || "");
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
            onPress={handleToggleUnits}
          />
        </View>

        <SectionHeader title="Notifications" />
        <View style={styles.section}>
          <SettingsRow icon="heart" label="Likes on your hikes" isSwitch switchValue={notifLikes} onSwitch={handleToggleLikes} />
          <SettingsRow icon="user-plus" label="New followers" isSwitch switchValue={notifFollows} onSwitch={handleToggleFollows} />
          <SettingsRow icon="award" label="Milestones & badges" isSwitch switchValue={notifMilestones} onSwitch={handleToggleMilestones} />
          <SettingsRow icon="message-circle" label="Comments on your hikes" isSwitch switchValue={notifComments} onSwitch={handleToggleComments} />
        </View>

        <SectionHeader title="Privacy" />
        <View style={styles.section}>
          <SettingsRow
            icon="lock"
            label="Private Account"
            isSwitch
            switchValue={isPrivate}
            onSwitch={handleTogglePrivate}
          />
          <View style={styles.settingHint}>
            <Text style={styles.settingHintText}>Only approved followers can see your hikes and activity.</Text>
          </View>
          <SettingsRow icon="slash" label="Blocked Accounts" onPress={() => router.push("/blocked-users")} />
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

        <SectionHeader title="Legal" />
        <View style={styles.section}>
          <SettingsRow
            icon="shield"
            label="Privacy Policy"
            onPress={() => router.push("/privacy-policy")}
          />
          <SettingsRow
            icon="file-text"
            label="Terms of Service"
            onPress={() => router.push("/terms-of-service")}
          />
        </View>

        <SectionHeader title="Danger zone" />
        <View style={styles.section}>
          <SettingsRow icon="log-out" label="Sign Out" onPress={signOut} danger />
          <SettingsRow
            icon="trash-2"
            label="Delete Account"
            onPress={() => { setDeleteConfirmText(""); setShowDeleteModal(true); }}
            danger
          />
        </View>
      </ScrollView>

      {/* ── Profile picture picker ── */}
        <Modal visible={showAvatarModal} transparent animationType="fade">
          <Pressable
            style={styles.deleteOverlay}
            onPress={() => !avatarLoading && setShowAvatarModal(false)}
          >
            {/* Swallows taps so pressing the sheet itself doesn't dismiss it. */}
            <Pressable style={styles.avatarSheet} onPress={() => {}}>
              <Text style={styles.avatarSheetTitle}>Profile picture</Text>

              <Pressable
                onPress={handlePickAvatar}
                disabled={avatarLoading}
                style={({ pressed }) => [styles.avatarPhotoBtn, { opacity: pressed || avatarLoading ? 0.6 : 1 }]}
              >
                <Feather name="image" size={16} color={Colors.accent} />
                <Text style={styles.avatarPhotoBtnText}>Upload a photo</Text>
              </Pressable>

              <Text style={styles.avatarSheetLabel}>Pick an icon</Text>
              <View style={styles.presetGrid}>
                {AVATAR_PRESETS.map(preset => {
                  const selected = profile?.avatar_preset === preset.key;
                  return (
                    <Pressable
                      key={preset.key}
                      onPress={() => handlePickPreset(preset.key)}
                      disabled={avatarLoading}
                      accessibilityRole="button"
                      accessibilityLabel={preset.label}
                      accessibilityState={{ selected }}
                      style={({ pressed }) => [
                        styles.presetCell,
                        { backgroundColor: preset.color + PRESET_DISC_ALPHA },
                        selected && { borderColor: preset.color },
                        { opacity: pressed ? 0.6 : 1 },
                      ]}
                    >
                      <MaterialCommunityIcons name={preset.icon} size={26} color={preset.color} />
                    </Pressable>
                  );
                })}
              </View>

              {(profile?.avatar_url || profile?.avatar_preset) && (
                <Pressable
                  onPress={handleUseInitials}
                  disabled={avatarLoading}
                  style={({ pressed }) => [styles.avatarClearBtn, { opacity: pressed || avatarLoading ? 0.6 : 1 }]}
                >
                  <Text style={styles.avatarClearText}>Use my initials instead</Text>
                </Pressable>
              )}

              <Pressable
                onPress={() => setShowAvatarModal(false)}
                disabled={avatarLoading}
                style={({ pressed }) => [styles.deleteCancelBtn, { opacity: pressed || avatarLoading ? 0.5 : 1 }]}
              >
                <Text style={styles.deleteCancelText}>{avatarLoading ? "Saving…" : "Done"}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

      {/* ── Delete Account confirmation modal ── */}
        <Modal visible={showDeleteModal} transparent animationType="fade">
          <Pressable
            style={styles.deleteOverlay}
            onPress={() => !deleteLoading && setShowDeleteModal(false)}
          >
            <Pressable style={styles.deleteSheet} onPress={() => {}}>
              <View style={styles.deleteIconWrap}>
                <Feather name="alert-triangle" size={28} color={Colors.red} />
              </View>
              <Text style={styles.deleteTitle}>Delete your account?</Text>
              <Text style={styles.deleteBody}>
                This will permanently delete your account, all your hikes, photos, comments, and followers.{"\n\n"}
                <Text style={styles.deleteBodyBold}>This cannot be undone.</Text>
              </Text>
              <Text style={styles.deleteInputLabel}>Type DELETE to confirm</Text>
              <TextInput
                style={styles.deleteInput}
                value={deleteConfirmText}
                onChangeText={setDeleteConfirmText}
                placeholder="DELETE"
                placeholderTextColor={Colors.text3}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!deleteLoading}
              />
              <Pressable
                onPress={handleDeleteAccount}
                disabled={deleteConfirmText.toUpperCase() !== "DELETE" || deleteLoading}
                style={[
                  styles.deleteConfirmBtn,
                  (deleteConfirmText.toUpperCase() !== "DELETE" || deleteLoading) && styles.deleteConfirmBtnDisabled,
                ]}
              >
                {deleteLoading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.deleteConfirmText}>Permanently Delete Account</Text>
                }
              </Pressable>
              <Pressable
                onPress={() => setShowDeleteModal(false)}
                disabled={deleteLoading}
                style={({ pressed }) => [styles.deleteCancelBtn, { opacity: pressed || deleteLoading ? 0.5 : 1 }]}
              >
                <Text style={styles.deleteCancelText}>Cancel</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

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
            <Text style={styles.modalHint}>{USERNAME_RULE_HINT}</Text>

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
  settingHint: { paddingHorizontal: 20, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.bg3 },
  settingHintText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3, lineHeight: 17 },
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
  avatarEditBadge: {
    position: "absolute", bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.green2,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: Colors.bg,
  },
  avatarName: { fontFamily: "Inter_600SemiBold", fontSize: 18, color: Colors.text },
  avatarSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3, marginTop: 2 },
  presetGrid: {
    flexDirection: "row", flexWrap: "wrap",
    gap: 12, padding: 16, justifyContent: "center",
    // Exactly five columns (5 x 52 + 4 x 12), so the twenty presets always
    // fill four whole rows instead of reflowing to a ragged last row on a
    // wider screen.
    maxWidth: 5 * 52 + 4 * 12 + 32, alignSelf: "center",
  },
  presetCell: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: "center", justifyContent: "center",
    // Transparent rather than absent so selecting one does not resize it.
    borderWidth: 2, borderColor: "transparent",
  },
  avatarSheet: {
    backgroundColor: Colors.bg2,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 24, paddingHorizontal: 20, paddingBottom: 32,
    alignItems: "center",
  },
  avatarSheetTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: Colors.text, marginBottom: 18 },
  avatarSheetLabel: {
    fontFamily: "Inter_500Medium", fontSize: 11, letterSpacing: 1.2,
    textTransform: "uppercase", color: Colors.text3,
    alignSelf: "flex-start", marginTop: 20,
  },
  avatarPhotoBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    width: "100%", paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border2, backgroundColor: Colors.bg3,
  },
  avatarPhotoBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.accent },
  avatarClearBtn: { width: "100%", paddingVertical: 12, alignItems: "center", marginTop: 4 },
  avatarClearText: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text2 },
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
  modalHint: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3, marginTop: 6 },
  modalTextarea: { minHeight: 100, textAlignVertical: "top" },
  charCount: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3, textAlign: "right", marginTop: 4 },
    deleteOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
    deleteSheet: { backgroundColor: Colors.bg2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, paddingBottom: 44, alignItems: "center" },
    deleteIconWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(196,96,96,0.12)", alignItems: "center", justifyContent: "center", marginBottom: 16, borderWidth: 1, borderColor: "rgba(196,96,96,0.3)" },
    deleteTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: Colors.text, marginBottom: 12, textAlign: "center" },
    deleteBody: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text3, textAlign: "center", lineHeight: 22, marginBottom: 24 },
    deleteBodyBold: { fontFamily: "Inter_600SemiBold", color: Colors.red },
    deleteInputLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.text3, alignSelf: "flex-start", marginBottom: 8, letterSpacing: 0.5, textTransform: "uppercase" },
    deleteInput: { width: "100%", backgroundColor: Colors.bg3, borderWidth: 1.5, borderColor: "rgba(196,96,96,0.55)", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.red, textAlign: "center", letterSpacing: 4, marginBottom: 20 },
    deleteConfirmBtn: { width: "100%", backgroundColor: Colors.red, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginBottom: 10 },
    deleteConfirmBtnDisabled: { opacity: 0.35 },
    deleteConfirmText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" },
    deleteCancelBtn: { width: "100%", paddingVertical: 12, alignItems: "center" },
    deleteCancelText: { fontFamily: "Inter_500Medium", fontSize: 15, color: Colors.text3 },
  });
