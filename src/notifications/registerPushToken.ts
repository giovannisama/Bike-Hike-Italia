// src/notifications/registerPushToken.ts
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform, PermissionsAndroid } from "react-native";
import { doc, setDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { auth, db } from "../firebase";

/**
 * Richiede il permesso di sistema POST_NOTIFICATIONS su Android 13+
 */
async function ensureAndroidNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== "android" || Platform.Version < 33) return true;

  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      {
        title: "Notifiche",
        message: "Per ricevere le notifiche push è necessario il permesso.",
        buttonPositive: "Consenti",
        buttonNegative: "Non consentire",
      }
    );

    console.log("[registerPushToken] POST_NOTIFICATIONS:", granted);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.log(
      "[registerPushToken] Errore richiesta POST_NOTIFICATIONS:",
      err
    );
    return false;
  }
}

/**
 * Richiede i permessi, ottiene l'Expo Push Token e lo salva nel documento utente:
 * users/{uid}.expoPushTokens = array di stringhe
 */
export async function registerPushToken() {
  try {
    if (!Device.isDevice) {
      console.log("Le notifiche push richiedono un dispositivo reale.");
      return;
    }

    // ANDROID: permesso di sistema + canale "default"
    if (Platform.OS === "android") {
      const androidPermOk = await ensureAndroidNotificationPermission();
      if (!androidPermOk) {
        console.log(
          "[registerPushToken] Permesso di sistema per le notifiche negato"
        );
        return;
      }

      // Crea/aggiorna il canale di notifica predefinito
      await Notifications.setNotificationChannelAsync("default", {
        name: "Notifiche generali",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
      });
      console.log("[registerPushToken] Canale 'default' configurato");
    }

    // 1) Richiedi permessi lato Expo
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    console.log(
      "[registerPushToken] Stato permessi iniziale (Expo):",
      existingStatus
    );

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log(
        "[registerPushToken] Permesso notifiche non concesso (Expo):",
        finalStatus
      );
      return;
    }

    // 2) Ottieni il token push da Expo
    // Prova a leggere il projectId da varie posizioni (SDK/ambienti diversi)
    let projectId =
      (Constants?.expoConfig as any)?.extra?.eas?.projectId ||
      (Constants as any)?.easConfig?.projectId ||
      (Constants?.expoConfig as any)?.extra?.projectId ||
      (Constants?.manifest2 as any)?.extra?.eas?.projectId ||
      (Constants?.manifest as any)?.extra?.eas?.projectId;

    if (!projectId) {
      console.warn(
        "[registerPushToken] projectId non trovato nel manifest. Procedo senza specificarlo (fallback). " +
          "Aggiungi 'extra.eas.projectId' in app.json/app.config.ts per evitare questo avviso."
      );
    } else {
      console.log("[registerPushToken] projectId Expo:", projectId);
    }

    let tokenData: Notifications.ExpoPushToken;
    try {
      if (projectId) {
        tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      } else {
        // Fallback: su Expo Go spesso funziona senza specificarlo
        // @ts-ignore overload senza parametri
        tokenData = await Notifications.getExpoPushTokenAsync();
      }
    } catch (err) {
      console.error("Errore getExpoPushTokenAsync:", err);
      throw err; // lascio propagare per il catch esterno
    }

    const expoPushToken = tokenData.data; // es. "ExponentPushToken[xxxxxxxxxxxxxx]"
    console.log("[registerPushToken] Expo token:", expoPushToken);

    // 3) Salva nel profilo utente
    const user = auth.currentUser;
    if (!user) {
      console.log(
        "[registerPushToken] Nessun utente autenticato, non salvo il token"
      );
      return;
    }

    const userRef = doc(db, "users", user.uid);

    try {
      await updateDoc(userRef, {
        expoPushTokens: arrayUnion(expoPushToken),
      });
      console.log(
        "[registerPushToken] Token salvato su Firestore per utente:",
        user.uid
      );
    } catch (err) {
      console.error(
        "[registerPushToken] Errore salvataggio token su Firestore:",
        err
      );
    }
  } catch (e) {
    console.error("Errore registerPushToken:", e);
  }
}

// (opzionale) gestisci come vengono mostrate le notif in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});