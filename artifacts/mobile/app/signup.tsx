import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
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
import { supabase } from "@/lib/supabase";

const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

type UsernameStatus = "idle" | "invalid" | "checking" | "available" | "taken" | "error";

function UsernameHint({ status }: { status: UsernameStatus }) {
  if (status === "idle") return null;
  const copy: Record<Exclude<UsernameStatus, "idle">, string> = {
    invalid: "3-20 characters: lowercase letters, numbers, underscores",
    checking: "Checking availability...",
    available: "Username available",
    taken: "That username is taken",
    error: "Couldn't check availability, try again",
  };
  const color =
    status === "available" ? Colors.green : status === "checking" ? Colors.text3 : Colors.red;
  return <Text style={[styles.usernameHint, { color }]}>{copy[status]}</Text>;
}

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signUp, claimUsername } = useAuth();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [needsUsernameRetry, setNeedsUsernameRetry] = useState(false);
  const checkSeq = useRef(0);

  const normalizedUsername = username.trim().toLowerCase();

  const checkUsernameAvailability = async (value: string): Promise<boolean> => {
    const seq = ++checkSeq.current;
    if (!USERNAME_REGEX.test(value)) {
      setUsernameStatus("invalid");
      return false;
    }
    setUsernameStatus("checking");
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", value)
      .maybeSingle();
    if (seq !== checkSeq.current) return false;
    if (error) {
      setUsernameStatus("error");
      return false;
    }
    if (data) {
      setUsernameStatus("taken");
      return false;
    }
    setUsernameStatus("available");
    return true;
  };

  useEffect(() => {
    if (!username) {
      setUsernameStatus("idle");
      return;
    }
    const handle = setTimeout(() => {
      checkUsernameAvailability(normalizedUsername);
    }, 400);
    return () => clearTimeout(handle);
  }, [normalizedUsername]);

  const canSubmit =
    !!fullName &&
    usernameStatus === "available" &&
    !!email &&
    password.length >= 6 &&
    agreedToTerms;

  const handleSignup = async () => {
    if (!canSubmit) return;
    setLoading(true);
    const stillAvailable = await checkUsernameAvailability(normalizedUsername);
    if (!stillAvailable) { setLoading(false); return; }
    const result = await signUp(email.trim(), password, fullName.trim(), normalizedUsername, agreedToTerms);
    setLoading(false);
    if (result.ok && !result.usernameConflict) {
      router.replace("/(tabs)");
    } else if (result.ok && result.usernameConflict) {
      setUsernameStatus("taken");
      setNeedsUsernameRetry(true);
    }
  };

  const handleClaimUsername = async () => {
    if (usernameStatus !== "available") return;
    setLoading(true);
    const result = await claimUsername(normalizedUsername);
    setLoading(false);
    if (result.ok) {
      setNeedsUsernameRetry(false);
      router.replace("/(tabs)");
    } else if (result.conflict) {
      setUsernameStatus("taken");
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 40 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>Summit</Text>
        <Text style={styles.tagline}>create your account</Text>

        {needsUsernameRetry ? (
          <>
            <Text style={styles.usernameRetryNotice}>
              Your account was created, but that username was taken in the meantime. Please choose another to finish setting up your profile.
            </Text>

            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              placeholder="trailblazer_23"
              placeholderTextColor={Colors.text3}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <UsernameHint status={usernameStatus} />

            <Pressable
              style={({ pressed }) => [
                styles.btn,
                { opacity: pressed || loading ? 0.8 : 1 },
                usernameStatus !== "available" && styles.btnDisabled,
              ]}
              onPress={handleClaimUsername}
              disabled={loading || usernameStatus !== "available"}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Save Username</Text>
              }
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Alex Lee"
              placeholderTextColor={Colors.text3}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
            />

            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              placeholder="trailblazer_23"
              placeholderTextColor={Colors.text3}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <UsernameHint status={usernameStatus} />

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
          </>
        )}

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
  usernameHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 6,
  },
  usernameRetryNotice: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
    color: Colors.amber2,
    backgroundColor: Colors.bg3,
    borderWidth: 1,
    borderColor: Colors.border2,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
});
