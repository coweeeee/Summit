import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { MIN_PASSWORD_LENGTH, passwordProblem } from "@/lib/passwordReset";

/**
 * Set a new password after following a recovery link.
 *
 * Lives in components/, NOT app/, and that placement is load-bearing. Everything
 * under app/ is a route, so as `app/reset-password.tsx` this was reachable by
 * opening `summit://reset-password` directly -- which skipped the recoveryMode
 * gate, and for a user already signed in normally offered to change their
 * password without asking for the old one. That was observed, not theorised:
 * the screen rendered behind the expired-link alert during testing. Do not move
 * it back under app/.
 *
 * Rendered only by the gate in _layout.tsx while recoveryMode is on. The
 * recovery link establishes a real session, so without that gate the user would
 * land inside the app already signed in and never be asked to set anything.
 */
export default function ResetPasswordGate() {
  const insets = useSafeAreaInsets();
  const { completeRecovery, cancelRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const problem = passwordProblem(password, confirmation);
  // Only after a submit attempt, so the rules are not shouted at someone who
  // has typed two characters so far.
  const shownProblem = touched ? problem : null;

  const handleSubmit = async () => {
    setTouched(true);
    if (problem || loading) return;
    setLoading(true);
    const ok = await completeRecovery(password);
    setLoading(false);
    // On success the gate unmounts this screen, so only failure needs handling
    // here -- completeRecovery has already explained why.
    if (!ok) setPassword("");
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 16 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.body}>
          Choose a new password for your Summit account. It needs to be at least{" "}
          {MIN_PASSWORD_LENGTH} characters.
        </Text>

        <Text style={styles.label}>New password</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor={Colors.text3}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
        />

        <Text style={styles.label}>Confirm new password</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor={Colors.text3}
          value={confirmation}
          onChangeText={setConfirmation}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
        />

        {shownProblem ? <Text style={styles.error}>{shownProblem}</Text> : null}

        <Pressable
          style={({ pressed }) => [styles.btn, { opacity: pressed || loading ? 0.8 : 1 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Set password</Text>}
        </Pressable>

        {/* Cancel signs out. The recovery session is a live session, so simply
            dismissing this screen would leave someone inside the account
            without ever having proved a password. */}
        <Pressable onPress={cancelRecovery} style={styles.switchBtn} disabled={loading}>
          <Text style={styles.switchText}>Cancel and return to log in</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // Absolute, not flex -- the identical trap that gateStyles in app/_layout.tsx
  // already documents, applied there and missed here. This screen is returned by
  // <AuthGate />, and RootLayoutNav renders <AuthGate /> as a SIBLING of <Stack>
  // inside a flex column. Two flex:1 siblings SPLIT that column, so the reset
  // form took its share and the navigator went on rendering the Feed -- tab bar,
  // header, hike cards -- in the remainder, overlapping the Cancel link at the
  // seam. `flex: 1` never meant "fill the screen" in this position; it meant
  // "take your share of it". An opaque backgroundColor cannot help, because the
  // Feed is not behind this view, it is beside it.
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    backgroundColor: Colors.bg,
  },
  inner: { flex: 1, paddingHorizontal: 24 },
  title: { fontFamily: "Inter_700Bold", fontSize: 28, color: Colors.text, marginBottom: 12 },
  body: { fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.text3, lineHeight: 22, marginBottom: 28 },
  label: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text3, marginBottom: 8 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: Colors.text,
    marginBottom: 16,
  },
  error: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.red, marginBottom: 16 },
  btn: { backgroundColor: Colors.accent, paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  btnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: "#fff" },
  switchBtn: { marginTop: 24, alignItems: "center" },
  switchText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text3 },
});
