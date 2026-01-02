// src/notifications/registerPushToken.ts
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import {
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { Platform, PermissionsAndroid } from "react-native";
import { info, warn, error } from "../utils/logger";

/**
 * Richiede permessi, configura il canale (Android),
 * ottiene l'Expo Push Token e lo salva nel documento utente:
 * users/{uid}.expoPushTokens = array di stringhe (deduplicato, max N token)
 */

const MAX_TOKENS_PER_USER = 5;

// Permesso POST_NOTIFICATIONS per Android 13+
async function ensureAndroidNotificationPermission(): Promise<boolean> {
  try {
    if (Platform.OS !== "android" || Platform.Version < 33) {
      return true;
    }

    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      {
        title: "Notifiche",
        message: "Serve il permesso per ricevere le notifiche push.",
        buttonPositive: "OK",
        buttonNegative: "Annulla",
      }
    );

    info("POST_NOTIFICATIONS permission result", { granted });
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    warn("POST_NOTIFICATIONS permission error");
    // In caso di errore consideriamo il permesso non concesso
    return false;
  }
}

// Configura il canale default su Android
async function ensureAndroidNotificationChannel() {
  if (Platform.OS !== "android") return;

  try {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Notifiche generali",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      vibrationPattern: [250, 250],
      enableVibrate: true,
      showBadge: true,
    });
    info("Android notification channel configured", { channel: "default" });
  } catch (err) {
    warn("Android notification channel setup error");
  }
}

export async function registerPushToken() {
  try {
    if (!Device.isDevice) {
      info("Push notifications require a physical device");
      return;
    }

    // 1) Permessi Android 13+
    const androidOk = await ensureAndroidNotificationPermission();
    if (!androidOk) {
    info("Android notification permission not granted");
    return;
  }

    // 2) Permessi generali Expo
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    info("Expo notification permission status", { status: existingStatus });

    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      info("Expo notification permission not granted");
      return;
    }

    // 3) Configura il canale su Android
    await ensureAndroidNotificationChannel();

    // 4) Ottieni il projectId per Expo push
    let projectId =
      (Constants?.expoConfig as any)?.extra?.eas?.projectId ||
      (Constants as any)?.easConfig?.projectId ||
      (Constants?.expoConfig as any)?.extra?.projectId ||
      (Constants?.manifest2 as any)?.extra?.eas?.projectId ||
      (Constants?.manifest as any)?.extra?.eas?.projectId;

    info("Expo projectId resolved", { hasProjectId: !!projectId });

    // 5) Ottieni il token push da Expo
    let tokenData: Notifications.ExpoPushToken;
    try {
      if (projectId) {
        tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      } else {
        warn("Expo projectId missing; fallback without projectId");
        // @ts-ignore overload senza parametri
        tokenData = await Notifications.getExpoPushTokenAsync();
      }
    } catch (err) {
      error("getExpoPushTokenAsync failed");
      return;
    }

    const expoPushToken = tokenData.data; // es. "ExponentPushToken[xxxxxxxxxxxxxx]"
    info("Expo push token obtained");

    // 6) Salva nel profilo utente (deduplicato e limitato)
    const user = auth.currentUser;
    if (!user) {
      info("No authenticated user; skip saving push token");
      return;
    }

    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    let existingTokens: string[] = [];
    if (snap.exists()) {
      const data = snap.data() as any;
      if (Array.isArray(data.expoPushTokens)) {
        existingTokens = data.expoPushTokens.filter(
          (t: any) => typeof t === "string" && t.length > 0
        );
      }
    }

    // Dedupe + aggiunta nuovo token
    const tokenSet = new Set<string>(existingTokens);
    tokenSet.add(expoPushToken);

    let normalized = Array.from(tokenSet);

    // Mantieni solo gli ultimi MAX_TOKENS_PER_USER
    if (normalized.length > MAX_TOKENS_PER_USER) {
      normalized = normalized.slice(normalized.length - MAX_TOKENS_PER_USER);
    }

    await setDoc(
      userRef,
      {
        expoPushTokens: normalized,
      },
      { merge: true }
    );

    info("Expo push token saved", { tokenCount: normalized.length });
  } catch (e) {
    error("registerPushToken failed");
  }
}

// Gestione centralizzata di come vengono mostrate le notifiche in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
