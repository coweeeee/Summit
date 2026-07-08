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
  import { supabase } from "@/lib/supabase";

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
    if (isExpoGo) return;
    if (!Device.isDevice) return;
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    if (token) {
      await supabase.from("push_tokens").upsert({ user_id: userId, token, updated_at: new Date().toISOString() });
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
    const { session, loading, networkError, retryAuth } = useAuth();
    const segments = useSegments();
    const router = useRouter();

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

    return null;
  }

  const gateStyles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center", padding: 32 },
    icon: { fontSize: 48, marginBottom: 16 },
    title: { fontFamily: "Inter_700Bold", fontSize: 22, color: Colors.text, marginBottom: 8, textAlign: "center" },
    sub: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text3, textAlign: "center", marginBottom: 32 },
    btn: { backgroundColor: Colors.accent, paddingVertical: 14, paddingHorizontal: 40, borderRadius: 12 },
    btnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" },
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
      if (fontsLoaded || fontError) SplashScreen.hideAsync();
    }, [fontsLoaded, fontError]);

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
  