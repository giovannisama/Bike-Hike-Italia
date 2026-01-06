// App.tsx
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View, InteractionManager } from "react-native";
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from "@react-navigation/native";
import { registerPushToken } from "./src/data/notifications";
import * as Sentry from "sentry-expo";
import Constants from "expo-constants";
import { addBreadcrumbSafe } from "./src/utils/observability";
import { auth } from "./src/firebase";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import useCurrentProfile from "./src/hooks/useCurrentProfile";
import RootNavigator from "./src/navigation/RootNavigator";
import AppErrorBoundary from "./src/components/AppErrorBoundary";
import type { RootStackParamList } from "./src/navigation/types";

// Navigation ref
export const navRef = createNavigationContainerRef<RootStackParamList>();

const AppTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: "#ffffff" },
};

const APP_VERSION =
  Constants.expoConfig?.version ??
  (Constants as any)?.manifest?.version ??
  "unknown";
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
const SENTRY_ENV =
  process.env.EXPO_PUBLIC_SENTRY_ENV ?? (__DEV__ ? "development" : "production");

const scheduleNonCriticalWork = (fn: () => void) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const task = InteractionManager.runAfterInteractions(() => {
    timeout = setTimeout(fn, 1500);
  });
  return () => {
    task.cancel?.();
    if (timeout) {
      clearTimeout(timeout);
    }
  };
};

Sentry.init({
  dsn: SENTRY_DSN || undefined,
  enabled: !__DEV__ && !!SENTRY_DSN,
  enableInExpoDevelopment: false,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  release: APP_VERSION,
  environment: SENTRY_ENV,
});

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const { profile, loading: profileLoading } = useCurrentProfile();

  // 1) Ascolta lo stato di autenticazione
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (__DEV__) {
        console.log("[auth] onAuthStateChanged", firebaseUser?.uid ?? null);
      }
      const isAnonymous = !!firebaseUser?.isAnonymous;
      const hasNoProviders = (firebaseUser?.providerData?.length ?? 0) === 0;
      const isNotPasswordProvider =
        !!firebaseUser && firebaseUser.providerData?.[0]?.providerId !== "password";
      const missingEmail = !firebaseUser?.email;

      if (
        firebaseUser &&
        (isAnonymous || hasNoProviders || isNotPasswordProvider || missingEmail)
      ) {
        try {
          await signOut(auth);
        } catch { }
        setUser(null);
        return;
      }

      setUser(firebaseUser ?? null);
    });

    return () => unsub();
  }, []);

  // 1.b) register push token once we know the user
  useEffect(() => {
    if (!user?.uid) return;
    return scheduleNonCriticalWork(() => {
      if (__DEV__) {
        console.log("[App] registering push token for user", user.uid);
      }
      void registerPushToken();
    });
  }, [user?.uid]);

  // 2) Schermata di caricamento mentre verifichiamo auth o profilo
  if (user === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12 }}>Verifica accesso...</Text>
      </View>
    );
  }

  // 3) Navigator
  return (
    <AppErrorBoundary>
      <NavigationContainer
        theme={AppTheme}
        ref={navRef}
        onReady={() => {
          const route = navRef.getCurrentRoute();
          if (route?.name) {
            addBreadcrumbSafe({ category: "navigation", message: route.name, level: "info" });
          }
        }}
        onStateChange={() => {
          const route = navRef.getCurrentRoute();
          if (route?.name) {
            addBreadcrumbSafe({ category: "navigation", message: route.name, level: "info" });
          }
        }}
      >
        <RootNavigator user={user} profile={profile} profileLoading={profileLoading} />
      </NavigationContainer>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff", // ensure white bg
  },
});
