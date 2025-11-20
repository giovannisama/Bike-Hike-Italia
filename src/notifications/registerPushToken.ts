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

    console.log("[registerPushToken] POST_NOTIFICATIONS:", granted);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn("[registerPushToken] Errore richiesta POST_NOTIFICATIONS:", err);
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
    console.log("[registerPushToken] Canale 'default' configurato");
  } catch (err) {
    console.warn("[registerPushToken] Errore configurazione canale Android:", err);
  }
}

export async function registerPushToken() {
  try {
    if (!Device.isDevice) {
      if (__DEV__) {
        console.log("Le notifiche push richiedono un dispositivo reale.");
      }
      return;
    }

    // 1) Permessi Android 13+
    const androidOk = await ensureAndroidNotificationPermission();
    if (!androidOk) {
      if (__DEV__) {
        console.log("[registerPushToken] Permesso notifiche Android non concesso");
      }
      return;
    }

    // 2) Permessi generali Expo
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (__DEV__) {
      console.log("[registerPushToken] Stato permessi iniziale (Expo):", existingStatus);
    }

    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      if (__DEV__) {
        console.log("[registerPushToken] Permesso notifiche non concesso (Expo)");
      }
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

    if (__DEV__) {
      console.log("[registerPushToken] projectId Expo:", projectId);
    }

    // 5) Ottieni il token push da Expo
    let tokenData: Notifications.ExpoPushToken;
    try {
      if (projectId) {
        tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      } else {
        console.warn(
          "[registerPushToken] projectId non trovato nel manifest. " +
            "Procedo senza specificarlo (fallback)."
        );
        // @ts-ignore overload senza parametri
        tokenData = await Notifications.getExpoPushTokenAsync();
      }
    } catch (err) {
      console.error("[registerPushToken] Errore getExpoPushTokenAsync:", err);
      return;
    }

    const expoPushToken = tokenData.data; // es. "ExponentPushToken[xxxxxxxxxxxxxx]"
    if (__DEV__) {
      console.log("[registerPushToken] Expo token:", expoPushToken);
    }

    // 6) Salva nel profilo utente (deduplicato e limitato)
    const user = auth.currentUser;
    if (!user) {
      if (__DEV__) {
        console.log("[registerPushToken] Nessun utente loggato, salto salvataggio token.");
      }
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

    if (__DEV__) {
      console.log(
        "[registerPushToken] Token salvato su Firestore per utente:",
        user.uid,
        "tokens totali:",
        normalized.length
      );
    }
  } catch (e) {
    console.error("Errore registerPushToken:", e);
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
