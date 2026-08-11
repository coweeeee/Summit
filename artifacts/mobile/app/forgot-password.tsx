import { useRouter } from "expo-router";
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

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!email.trim() || loading) return;
    setLoading(true);
    await sendPasswordReset(email);
    setLoading(false);
    // Deliberately ignores the result. Showing "no account with that address"
    // would turn this screen into a way to test whether someone is registered,
    // which is the same enumeration problem that got get_email_for_username
    // locked down. Sent or not, the user sees the same thing.
    setSent(true);
  };

  if (sent) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 40 }]}>
        <View style={styles.inner}>
          <Text style={styles.icon}>📬</Text>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.body}>
            If an account exists for {email.trim()}, we've sent a link to reset your password. It
            expires after a short time, so use it soon.
          </Text>
          <Text style={styles.hint}>
            Nothing arrived? Check your spam folder, or go back and try another address.
          </Text>

          <Pressable
            style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.8 : 1 }]}
            onPress={() => router.replace("/login")}
          >
            <Text style={styles.btnText}>Back to log in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 40 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Reset your password</Text>
        <Text style={styles.body}>
          Enter the email address you signed up with and we'll send you a link to set a new password.
        </Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="you@email.com"
          placeholderTextColor={Colors.text3}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        {/* Email only, even though logging in accepts a username. Resolving a
            username to its address is service-role only on purpose, and doing
            it here would rebuild the username-to-email oracle that was closed
            off. Better to ask for the address than to reopen that. */}
        <Text style={styles.hint}>
          This has to be your email address — a username won't work here.
        </Text>

        <Pressable
          style={({ pressed }) => [styles.btn, { opacity: pressed || loading ? 0.8 : 1 }]}
          onPress={handleSend}
          disabled={loading || !email.trim()}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Send reset link</Text>}
        </Pressable>

        <Pressable onPress={() => router.back()} style={styles.switchBtn}>
          <Text style={styles.switchText}>
            Remembered it? <Text style={styles.switchLink}>Back to log in</Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  inner: { flex: 1, paddingHorizontal: 24 },
  icon: { fontSize: 44, marginBottom: 16 },
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
    marginBottom: 10,
  },
  hint: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text3, lineHeight: 19, marginBottom: 28 },
  btn: { backgroundColor: Colors.accent, paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  btnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: "#fff" },
  switchBtn: { marginTop: 24, alignItems: "center" },
  switchText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text3 },
  switchLink: { color: Colors.accent, fontFamily: "Inter_600SemiBold" },
});
