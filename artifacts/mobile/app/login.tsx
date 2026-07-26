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
import { supabase } from "@/lib/supabase";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!identifier || !password) return;
    setError("");
    setLoading(true);
    const raw = identifier.trim();
    let emailToUse = raw;
    if (!raw.includes("@")) {
      const { data: resolvedEmail, error: rpcError } = await supabase.rpc(
        "get_email_for_username",
        { lookup_username: raw }
      );
      if (rpcError || !resolvedEmail) {
        setLoading(false);
        setError("No account found with that username.");
        return;
      }
      emailToUse = resolvedEmail as string;
    }
    const ok = await signIn(emailToUse, password);
    setLoading(false);
    if (ok) router.replace("/(tabs)");
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 40 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>Summit</Text>
        <Text style={styles.tagline}>your trail journal</Text>

        <Text style={styles.label}>Email or Username</Text>
        <TextInput
          style={styles.input}
          placeholder="you@email.com or username"
          placeholderTextColor={Colors.text3}
          value={identifier}
          onChangeText={v => { setIdentifier(v); setError(""); }}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor={Colors.text3}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Pressable
          style={({ pressed }) => [styles.btn, { opacity: pressed || loading ? 0.8 : 1 }]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Log In</Text>
          }
        </Pressable>

        <Pressable onPress={() => router.push("/signup")} style={styles.switchBtn}>
          <Text style={styles.switchText}>
            Don't have an account?{" "}
            <Text style={styles.switchLink}>Sign up</Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  inner: { flex: 1, paddingHorizontal: 24 },
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
  btn: {
    backgroundColor: Colors.green2,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 28,
  },
  btnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: "#fff" },
  switchBtn: { alignItems: "center", marginTop: 24 },
  switchText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text3,
  },
  switchLink: { color: Colors.accent, fontFamily: "Inter_600SemiBold" },
  errorText: { color: Colors.red, fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 6 },
});
