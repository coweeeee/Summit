import {
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    useFonts,
  } from "@expo-google-fonts/inter";
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
  import { Stack, useRouter, useSegments } from "expo-router";
  import * as SplashScreen from "expo-splash-screen";
  import * as Notifications from "expo-notifications";
  import * as Device from "expo-device";
  import Constants from "expo-constants";
  import React, { useEffect } from "react";
  import { GestureHandlerRootView } from "react-native-gesture-handler";
  import { KeyboardProvider } from "react-native-keyboard-controller";
  import { SafeAreaProvider } from "react-native-safe-area-context";
  import { Platform, Text, View, Pressable, StyleSheet } from "react-native";

  import { ErrorBoundary } from "@/components/ErrorBoundary";
  import { AuthProvider, useAuth } from "@/context/AuthContext";
  import { HikesProvider } from "@/context/HikesContext";
  import Colors from "@/constants/colors";
  import { supabase, supabaseConfigError } from "@/lib/supabase";

  SplashScreen.preventAutoHideAsync();

  const isExpoGo = Constants.appOwnership === "expo";

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  const queryClient = new QueryClient();

  async function registerForPushNotifications(userId: string) {
    try {
      await registerForPushNotificationsInner(userId);
    } catch (e: any) {
      console.warn("push registration failed", e?.message ?? e);
    }
  }

  async function registerForPushNotificationsInner(userId: string) {
    if (isExpoGo) return;
    if (!Device.isDevice) return;

    // Resolve the EAS project id BEFORE asking for permission, not after.
    // getExpoPushTokenAsync needs it and throws without one, so with no
    // projectId there is nothing useful to do with a granted permission --
    // and asking first spends the one-shot iOS permission dialog on a token
    // that is then never requested. A user who declines, or who accepts and
    // gets nothing, cannot be asked again except through iOS Settings.
    //
    // app.json has no extra.eas.projectId, and easConfig cannot supply one in
    // a locally built app either, so today this always returns here -- before
    // the user is ever prompted. `eas init` writes the id. Sequence the Expo
    // push credentials before adding it: with an id but no credentials this
    // stops returning early and starts failing at the network call instead.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as any).easConfig?.projectId;
    if (!projectId) {
      console.warn("push registration skipped: no EAS projectId in app config");
      return;
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (token) {
      const { error } = await supabase
        .from("push_tokens")
        .upsert({ user_id: userId, token, updated_at: new Date().toISOString() });
      // Silently losing this is why push_tokens stayed empty without a trace.
      if (error) console.warn("push token upsert failed", error.message);
    }

    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
      });
    }
  }

  function handleNotificationResponse(
    router: ReturnType<typeof useRouter>,
    data: Record<string, any> | undefined
  ) {
    if (!data) return;
    if (data.hikeId) {
      router.push({ pathname: "/hike-detail", params: { id: String(data.hikeId) } });
    } else if (data.userId) {
      router.push({ pathname: "/user-profile", params: { id: String(data.userId) } });
    } else if (data.badgeKey) {
      router.push("/(tabs)/profile");
    }
  }

  function AuthGate() {
    const { session, loading, networkError, retryAuth, termsOutOfDate, acceptCurrentTerms, signOut } = useAuth();
    const segments = useSegments();
    const router = useRouter();
    const [accepting, setAccepting] = React.useState(false);

    useEffect(() => {
      if (loading) return;
      if (networkError) return;
      const inTabs = segments[0] === "(tabs)";
      const inAuth = segments[0] === "login" || segments[0] === "signup";
      if (!session && inTabs) router.replace("/login");
      else if (session && (inAuth || segments[0] === undefined)) router.replace("/(tabs)");
    }, [session, loading, networkError, segments]);

    useEffect(() => {
      if (session?.user.id) registerForPushNotifications(session.user.id);
    }, [session?.user.id]);

    useEffect(() => {
      if (Platform.OS === "web") return;

      const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as Record<string, any> | undefined;
        handleNotificationResponse(router, data);
      });
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (!response) return;
        const data = response.notification.request.content.data as Record<string, any> | undefined;
        handleNotificationResponse(router, data);
      });
      return () => subscription.remove();
    }, [router]);

    if (networkError) {
      return (
        <View style={gateStyles.container}>
          <Text style={gateStyles.icon}>📡</Text>
          <Text style={gateStyles.title}>Can't reach server</Text>
          <Text style={gateStyles.sub}>Check your connection and try again.</Text>
          <Pressable onPress={retryAuth} style={({ pressed }) => [gateStyles.btn, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={gateStyles.btnText}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    // Ordered after networkError on purpose: offline, we cannot tell a stale
    // acceptance from an unread session, and blocking someone behind a prompt
    // whose Accept button cannot reach the server is worse than letting them
    // through until the connection returns.
    if (termsOutOfDate) {
      return (
        <View style={gateStyles.container}>
          <Text style={gateStyles.icon}>📄</Text>
          <Text style={gateStyles.title}>We've updated our terms</Text>
          <Text style={gateStyles.sub}>
            Our Privacy Policy and Terms of Service have changed since you last accepted them. Please
            review and accept them to keep using Summit.
          </Text>

          <View style={gateStyles.linkRow}>
            <Pressable onPress={() => router.push("/privacy-policy")} hitSlop={8}>
              <Text style={gateStyles.link}>Privacy Policy</Text>
            </Pressable>
            <Text style={gateStyles.linkSep}>·</Text>
            <Pressable onPress={() => router.push("/terms-of-service")} hitSlop={8}>
              <Text style={gateStyles.link}>Terms of Service</Text>
            </Pressable>
          </View>

          <Pressable
            disabled={accepting}
            onPress={async () => {
              setAccepting(true);
              const ok = await acceptCurrentTerms();
              // On success the session updates and this gate unmounts, so only
              // the failure path needs to hand the button back.
              if (!ok) setAccepting(false);
            }}
            style={({ pressed }) => [gateStyles.btn, { opacity: pressed || accepting ? 0.7 : 1 }]}
          >
            <Text style={gateStyles.btnText}>{accepting ? "Saving…" : "Accept and continue"}</Text>
          </Pressable>

          {/* Nobody can be made to agree. Without a way out, declining means
              being stuck on this screen with no route to deleting the account
              either -- Settings is behind the gate. */}
          <Pressable onPress={signOut} hitSlop={8} style={gateStyles.declineWrap}>
            <Text style={gateStyles.decline}>Sign out instead</Text>
          </Pressable>
        </View>
      );
    }

    return null;
  }

  const gateStyles = StyleSheet.create({
    // Absolute, not flex. AuthGate and Stack are sibling children of a flex
    // column, so two flex:1 children would split the screen between the retry
    // UI and the navigator behind it rather than the gate covering it. This
    // never surfaced before because networkError was effectively unreachable.
    container: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 10,
      backgroundColor: Colors.bg,
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
    },
    icon: { fontSize: 48, marginBottom: 16 },
    title: { fontFamily: "Inter_700Bold", fontSize: 22, color: Colors.text, marginBottom: 8, textAlign: "center" },
    sub: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text3, textAlign: "center", marginBottom: 32 },
    btn: { backgroundColor: Colors.accent, paddingVertical: 14, paddingHorizontal: 40, borderRadius: 12 },
    btnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" },
    linkRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 28 },
    link: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.accent, textDecorationLine: "underline" },
    linkSep: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text3 },
    declineWrap: { marginTop: 20 },
    decline: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text3 },
  });

  // Not routed through <ErrorBoundary>: a credential-less build fails while
  // this module's own imports are still evaluating, which is before React
  // renders anything at all. RootLayout is the first point where a message can
  // be put on screen, so the check lives there and this is what it shows.
  function ConfigErrorScreen({ message }: { message: string }) {
    return (
      <View style={configStyles.container}>
        <Text style={configStyles.title}>Missing configuration</Text>
        <Text style={configStyles.body}>{message}</Text>
        <Text style={configStyles.hint}>
          Add the missing values to artifacts/mobile/.env and rebuild.
        </Text>
      </View>
    );
  }

  const configStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.bg,
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
    },
    // No Inter here on purpose -- useFonts may not have resolved, and a config
    // failure has to stay legible regardless of what else did or didn't load.
    title: { fontSize: 22, fontWeight: "700", color: Colors.text, marginBottom: 12, textAlign: "center" },
    body: { fontSize: 14, color: Colors.text3, textAlign: "center", marginBottom: 8, lineHeight: 20 },
    hint: { fontSize: 13, color: Colors.text3, textAlign: "center", lineHeight: 20 },
  });

  function RootLayoutNav() {
    return (
      <>
        <AuthGate />
        <Stack screenOptions={{ contentStyle: { backgroundColor: Colors.bg } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="signup" options={{ headerShown: false }} />
          <Stack.Screen name="notifications" options={{ headerShown: false, presentation: "modal" }} />
          <Stack.Screen name="settings" options={{ headerShown: false, presentation: "modal" }} />
          <Stack.Screen name="blocked-users" options={{ headerShown: false }} />
          <Stack.Screen name="trail-detail" options={{ headerShown: false, presentation: "modal" }} />
          <Stack.Screen name="hike-detail" options={{ headerShown: false, presentation: "modal" }} />
          <Stack.Screen name="edit-hike" options={{ headerShown: false, presentation: "modal" }} />
          <Stack.Screen name="user-profile" options={{ headerShown: false }} />
          <Stack.Screen name="privacy-policy" options={{ headerShown: false, presentation: "modal" }} />
          <Stack.Screen name="terms-of-service" options={{ headerShown: false, presentation: "modal" }} />
        </Stack>
      </>
    );
  }

  export default function RootLayout() {
    const [fontsLoaded, fontError] = useFonts({
      Inter_400Regular,
      Inter_500Medium,
      Inter_600SemiBold,
      Inter_700Bold,
    });

    useEffect(() => {
      // A config failure has to drop the splash too. Gating only on fonts is
      // what turned a missing-credentials build into a permanent hang.
      if (supabaseConfigError || fontsLoaded || fontError) SplashScreen.hideAsync();
    }, [fontsLoaded, fontError]);

    // Before the font gate: fonts are irrelevant if there is no backend, and
    // returning null here would reinstate the blank hang.
    if (supabaseConfigError) return <ConfigErrorScreen message={supabaseConfigError} />;

    if (!fontsLoaded && !fontError) return null;

    return (
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.bg }}>
              <KeyboardProvider>
                <AuthProvider>
                  <HikesProvider>
                    <RootLayoutNav />
                  </HikesProvider>
                </AuthProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    );
  }
  