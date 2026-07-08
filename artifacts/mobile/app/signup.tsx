import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const canSubmit =
    !!fullName && !!email && password.length >= 6 && agreedToTerms;

  const handleSignup = async () => {
    if (!canSubmit) return;
    setLoading(true);
    const ok = await signUp(email.trim(), password, fullName.trim(), agreedToTerms);
    setLoading(false);
    if (ok) router.replace("/(tabs)");
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 40 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>Summit</Text>
        <Text style={styles.tagline}>create your account</Text>

        <Text style={styles.label}>Full Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Alex Lee"
          placeholderTextColor={Colors.text3}
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="you@email.com"
          placeholderTextColor={Colors.text3}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Min. 6 characters"
          placeholderTextColor={Colors.text3}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Pressable
          style={styles.checkboxRow}
          onPress={() => setAgreedToTerms((prev) => !prev)}
          hitSlop={8}
        >
          <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
            {agreedToTerms && <Feather name="check" size={14} color="#fff" />}
          </View>
          <Text style={styles.checkboxLabel}>
            I agree to the{" "}
            <Text style={styles.checkboxLink} onPress={() => router.push("/privacy-policy")}>
              Privacy Policy
            </Text>{" "}
            and{" "}
            <Text style={styles.checkboxLink} onPress={() => router.push("/terms-of-service")}>
              Terms of Service
            </Text>
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.btn,
            { opacity: pressed || loading ? 0.8 : 1 },
            !canSubmit && styles.btnDisabled,
          ]}
          onPress={handleSignup}
          disabled={loading || !canSubmit}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Create Account</Text>
          }
        </Pressable>

        <Pressable onPress={() => router.push("/login")} style={styles.switchBtn}>
          <Text style={styles.switchText}>
            Already have an account?{" "}
            <Text style={styles.switchLink}>Log in</Text>
          </Text>
        </Pressable>

        <View style={styles.legalLinks}>
          <Pressable onPress={() => router.push("/privacy-policy")}>
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </Pressable>
          <Text style={styles.legalDivider}>{"\u00B7"}</Text>
          <Pressable onPress={() => router.push("/terms-of-service")}>
            <Text style={styles.legalLink}>Terms of Service</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  inner: { paddingHorizontal: 24, paddingBottom: 40 },
  logo: {
    fontFamily: "Inter_700Bold",
    fontSize: 42,
    color: Colors.accent,
    letterSpacing: -1,
  },
  tagline: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text3,
    fontStyle: "italic",
    marginBottom: 48,
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.text3,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: Colors.bg3,
    borderWidth: 1,
    borderColor: Colors.border2,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.text,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 24,
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Colors.border2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: Colors.green2,
    borderColor: Colors.green2,
  },
  checkboxLabel: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
    color: Colors.text3,
  },
  checkboxLink: {
    color: Colors.accent,
    fontFamily: "Inter_500Medium",
    textDecorationLine: "underline",
  },
  btn: {
    backgroundColor: Colors.green2,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 20,
  },
  btnDisabled: {
    backgroundColor: Colors.border2,
  },
  btnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: "#fff" },
  switchBtn: { alignItems: "center", marginTop: 24 },
  switchText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text3,
  },
  switchLink: { color: Colors.accent, fontFamily: "Inter_600SemiBold" },
  legalLinks: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
  },
  legalLink: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text3,
    textDecorationLine: "underline",
  },
  legalDivider: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text3,
  },
});
