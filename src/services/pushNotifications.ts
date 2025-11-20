// src/services/pushNotifications.ts
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { auth, db } from "../firebase";
import Constants from "expo-constants";

// 🔐 ID del progetto Expo / EAS (lo hai già in app.json -> extra.eas.projectId)
const FALLBACK_EXPO_PROJECT_ID = "e74521c0-d040-4137-a8d1-0d535e353f2d";

// Config consigliata da Expo
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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
      console.warn(
        "[pushNotifications] impossibile risolvere l'Expo projectId (nessun valore trovato)."
      );
      return null;
    }

    return resolved;
  } catch (err) {
    console.warn(
      "[pushNotifications] errore risolvendo l'Expo projectId:",
      err
    );
    return null;
  }
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log("[pushNotifications] push supportate solo su dispositivo reale");
    return null;
  }

  const appOwnership = Constants.appOwnership;
  if (appOwnership === "expo") {
    // Evita di salvare token di Expo Go → niente notifiche duplicate in dev
    console.log(
      "[pushNotifications] esecuzione dentro Expo Go; salto registrazione token per evitare duplicati."
    );
    return null;
  }

  console.log("[pushNotifications] Platform:", Platform.OS, "ownership:", appOwnership);

  // Permessi
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("[pushNotifications] permessi push non concessi");
    return null;
  }

  // Risolviamo il projectId di Expo/EAS
  const projectId = resolveExpoProjectId();
  if (!projectId) {
    console.warn(
      "[pushNotifications] nessun projectId valido; impossibile richiedere il token push."
    );
    return null;
  }

  console.log("[pushNotifications] usando projectId:", projectId);

  // Ottieni token Expo
  let tokenResponse: Notifications.ExpoPushToken;
  try {
    tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
  } catch (error) {
    console.error(
      "[pushNotifications] errore in getExpoPushTokenAsync:",
      error
    );
    return null;
  }

  const token = tokenResponse.data;
  console.log("[pushNotifications] Expo push token ottenuto:", token);

  // Solo Android: canale di default
  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      });
      console.log("[pushNotifications] canale Android 'default' configurato");
    } catch (error) {
      console.warn(
        "[pushNotifications] errore configurando il canale Android:",
        error
      );
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
      console.log(
        "[pushNotifications] token salvato per l'utente",
        currentUser.uid
      );
    } catch (error) {
      console.error(
        "[pushNotifications] impossibile salvare il token su Firestore:",
        error
      );
    }
  } else {
    console.warn(
      "[pushNotifications] nessun utente autenticato; non salvo il token su Firestore"
    );
  }

  return token;
}

export async function setNotificationsDisabled(disabled: boolean): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.warn(
      "[pushNotifications] nessun utente autenticato; impossibile aggiornare notificationsDisabled"
    );
    return;
  }

  const userRef = doc(db, "users", currentUser.uid);
  const payload = {
    notificationsDisabled: disabled,
  };
  try {
    await updateDoc(userRef, payload);
    console.log(
      "[pushNotifications] notificationsDisabled aggiornato a",
      disabled,
      "per utente",
      currentUser.uid
    );
  } catch (error) {
    console.error(
      "[pushNotifications] errore aggiornando notificationsDisabled:",
      error
    );
    throw error;
  }
}