// src/notifications/registerPushToken.ts
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { doc, setDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { auth, db } from "../firebase";

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

    // 1) Richiedi permessi
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      console.log("Permesso notifiche non concesso");
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

    let tokenData: Notifications.ExpoPushToken;
    try {
      if (projectId) {
        tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      } else {
        console.warn(
          "[registerPushToken] projectId non trovato nel manifest. Procedo senza specificarlo (fallback). " +
            "Aggiungi 'extra.eas.projectId' in app.json/app.config.ts per evitare questo avviso."
        );
        // Fallback: su Expo Go spesso funziona senza specificarlo
        // @ts-ignore overload senza parametri
        tokenData = await Notifications.getExpoPushTokenAsync();
      }
    } catch (err) {
      console.error("Errore getExpoPushTokenAsync:", err);
      throw err; // lascio propagare per il catch esterno
    }

    const expoPushToken = tokenData.data; // es. "ExponentPushToken[xxxxxxxxxxxxxx]"
    console.log("Expo push token:", expoPushToken);

    // 3) Salva nel profilo utente
    const user = auth.currentUser;
    if (!user) return;

    const userRef = doc(db, "users", user.uid);
    // Creazione/merge sicuro: mantiene un array di token (1 per dispositivo)
    await setDoc(
      userRef,
      { expoPushTokens: [expoPushToken] },
      { merge: true }
    );
    // In alternativa, per evitare duplicati multipli identici:
    await updateDoc(userRef, {
      expoPushTokens: arrayUnion(expoPushToken),
    });
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
  }),
});
