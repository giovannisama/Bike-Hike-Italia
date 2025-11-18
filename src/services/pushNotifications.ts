// src/services/pushNotifications.ts
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { auth, db } from "../firebase"; // importa i tuoi oggetti firebase già inizializzati

// Config consigliata da Expo (se non l'hai già da qualche parte)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log("Push notifications require a physical device");
    return null;
  }

  // Permessi
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Push notification permissions not granted");
    return null;
  }

  // Ottieni token Expo
  const projectId = Notifications.getExpoPushTokenAsync.length
    ? undefined
    : undefined;

  const tokenResponse = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  const token = tokenResponse.data;
  console.log("Expo push token:", token);

  // Solo iOS: configurazione canali non necessaria, ma la lascio per Android
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  // Salva su Firestore se l’utente è loggato
  const currentUser = auth.currentUser;
  if (currentUser) {
    const userRef = doc(db, "users", currentUser.uid);
    await updateDoc(userRef, {
      expoPushTokens: arrayUnion(token),
    });
  } else {
    console.warn("No authenticated user; not saving token to Firestore");
  }

  return token;
}

export async function setNotificationsDisabled(disabled: boolean): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.warn("No authenticated user; cannot update notification settings");
    return;
  }

  const userRef = doc(db, "users", currentUser.uid);
  const payload = {
    notificationsDisabled: disabled,
  };
  await updateDoc(userRef, payload);
}
