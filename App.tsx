// App.tsx
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from "@react-navigation/native";
import { registerPushToken } from "./src/notifications/registerPushToken";
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

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const { profile, loading: profileLoading } = useCurrentProfile();

  // 1) Ascolta lo stato di autenticazione
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      const isAnonymous = !!(firebaseUser as any)?.isAnonymous;
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
    if (__DEV__) {
      console.log("[App] registering push token for user", user.uid);
    }
    void registerPushToken();
  }, [user?.uid]);

  // 2) Schermata di caricamento mentre verifichiamo auth o profilo
  if (user === undefined || (user && profileLoading)) {
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
      <NavigationContainer theme={AppTheme} ref={navRef}>
        <RootNavigator user={user} profile={profile} />
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
