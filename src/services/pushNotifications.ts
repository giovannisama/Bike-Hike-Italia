// src/services/pushNotifications.ts
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { auth, db } from "../firebase";
import Constants from "expo-constants";
import { info, warn, error as logError } from "../utils/logger";

// 🔐 ID del progetto Expo / EAS (lo hai già in app.json -> extra.eas.projectId)
const FALLBACK_EXPO_PROJECT_ID = "e74521c0-d040-4137-a8d1-0d535e353f2d";

// Handler notifiche centralizzato altrove; qui non impostiamo più setNotificationHandler.

function resolveExpoProjectId(): string | null {
  try {
    // Prova a leggere da vari punti possibili
    const fromExpoConfig =
      (Constants as any)?.expoConfig?.extra?.eas?.projectId ??
      (Constants as any)?.expoConfig?.extra?.eas?.projectID;

    const fromEasConfig = (Constants as any)?.easConfig?.projectId;

    const resolved =
      fromExpoConfig ??
      fromEasConfig ??
      FALLBACK_EXPO_PROJECT_ID ??
      null;

    if (!resolved) {
      warn("Expo projectId not resolved");
      return null;
    }

    return resolved;
  } catch (err) {
    warn("Expo projectId resolution error");
    return null;
  }
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // NOTE: usata da NotificationSettingsScreen; salva i token con arrayUnion (non limita il numero).
  // Il flusso alternativo in notifications/registerPushToken.ts deduplica e limita i token.
  if (!Device.isDevice) {
    info("Push notifications require a physical device");
    return null;
  }

  const appOwnership = Constants.appOwnership;
  if (appOwnership === "expo") {
    // Evita di salvare token di Expo Go → niente notifiche duplicate in dev
    if (__DEV__) {
      info("Expo Go detected; skip push token registration");
    }
    return null;
  }

  info("Push registration context", { platform: Platform.OS, ownership: appOwnership });

  // Permessi
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    info("Push permission not granted");
    return null;
  }

  // Risolviamo il projectId di Expo/EAS
  const projectId = resolveExpoProjectId();
  if (!projectId) {
    warn("No valid projectId; cannot request push token");
    return null;
  }

  info("Using Expo projectId", { hasProjectId: true });

  // Ottieni token Expo
  let tokenResponse: Notifications.ExpoPushToken;
  try {
    tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
  } catch (err) {
    logError("getExpoPushTokenAsync failed");
    return null;
  }

  const token = tokenResponse.data;
  info("Expo push token obtained");

  // Solo Android: canale di default
  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      });
      info("Android notification channel configured", { channel: "default" });
    } catch (err) {
      warn("Android notification channel setup error");
    }
  }

  // Salva su Firestore se l’utente è loggato
  const currentUser = auth.currentUser;
  if (currentUser) {
    const userRef = doc(db, "users", currentUser.uid);
    try {
      await updateDoc(userRef, {
        expoPushTokens: arrayUnion(token),
      });
      info("Push token saved for current user");
    } catch (err) {
      logError("Failed to save push token to Firestore");
    }
  } else {
    warn("No authenticated user; skip saving push token");
  }

  return token;
}

export async function setNotificationsDisabled(disabled: boolean): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    warn("No authenticated user; cannot update notificationsDisabled");
    return;
  }

  const userRef = doc(db, "users", currentUser.uid);
  const payload = {
    notificationsDisabled: disabled,
  };
  try {
    await updateDoc(userRef, payload);
    info("notificationsDisabled updated", { disabled });
  } catch (err) {
    logError("Failed to update notificationsDisabled");
    throw err;
  }
}
