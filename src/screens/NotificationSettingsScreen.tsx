import React, { useEffect, useState } from "react";
import { View, Text, Switch, StyleSheet, Alert, ActivityIndicator, Platform, Pressable, ScrollView } from "react-native";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { registerForPushNotificationsAsync, setNotificationsDisabled } from "../services/pushNotifications";
import { Screen, UI } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";

const CARD_BORDER = "#e5e7eb";

const NotificationSettingsScreen: React.FC = () => {
  const [loading, setLoading] = useState(true);

  // toggle globale (blocca/sblocca tutte le push)
  const [globalEnabled, setGlobalEnabled] = useState(false);

  // toggle per singolo evento
  const [rideCreatedEnabled, setRideCreatedEnabled] = useState(true);
  const [rideCancelledEnabled, setRideCancelledEnabled] = useState(true);
  const [pendingUserEnabled, setPendingUserEnabled] = useState(true);
  const [boardPostEnabled, setBoardPostEnabled] = useState(true);

  const [isOwner, setIsOwner] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          setLoading(false);
          return;
        }
        const userRef = doc(db, "users", currentUser.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const data = snap.data() as any;

          const role = (data.role || "").toString().toLowerCase();
          setIsOwner(role === "owner");

          const notificationsDisabledGlobal = data.notificationsDisabled === true;
          setGlobalEnabled(!notificationsDisabledGlobal);

          // se i flag specifici non esistono → li consideriamo come "abilitati"
          const disabledCreated = data.notificationsDisabledForCreatedRide === true;
          const disabledCancelled = data.notificationsDisabledForCancelledRide === true;
          const disabledPending = data.notificationsDisabledForPendingUser === true;
          const disabledBoardPost = data.notificationsDisabledForBoardPost === true;

          setRideCreatedEnabled(!disabledCreated);
          setRideCancelledEnabled(!disabledCancelled);
          setPendingUserEnabled(!disabledPending);
          setBoardPostEnabled(!disabledBoardPost);
        }
      } catch (e) {
        console.error("Error loading notification settings", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const ensureAuthUser = () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      Alert.alert("Notifiche", "Devi effettuare l'accesso per gestire le notifiche.");
      return null;
    }
    return currentUser;
  };

  // ------- toggle globale -------
  const handleGlobalToggle = async (value: boolean) => {
    if (saving) return;
    const currentUser = ensureAuthUser();
    if (!currentUser) return;

    const previous = globalEnabled;
    setGlobalEnabled(value);
    setSaving(true);

    try {
      if (value) {
        // ATTIVA notifiche push: chiedi permesso + registra token
        const token = await registerForPushNotificationsAsync();
        if (!token) {
          Alert.alert(
            "Notifiche",
            "Non è stato possibile attivare le notifiche. Controlla i permessi nelle impostazioni di sistema."
          );
          setGlobalEnabled(previous);
          await setNotificationsDisabled(true);
          return;
        }
        await setNotificationsDisabled(false);
      } else {
        // DISATTIVA tutte le notifiche push
        await setNotificationsDisabled(true);
      }
    } catch (e) {
      console.error("Error updating global notification settings", e);
      setGlobalEnabled(previous);
      Alert.alert("Errore", "Si è verificato un errore aggiornando le impostazioni notifiche.");
    } finally {
      setSaving(false);
    }
  };

  // helper: blocca i toggle evento se globale OFF
  const guardEventToggle = () => {
    if (!globalEnabled) {
      Alert.alert(
        "Notifiche disattivate",
        "Per modificare queste opzioni devi prima attivare le notifiche push."
      );
      return false;
    }
    return true;
  };

  // ------- toggle: nuova uscita creata -------
  const handleRideCreatedToggle = async (value: boolean) => {
    if (saving) return;
    const currentUser = ensureAuthUser();
    if (!currentUser) return;
    if (!guardEventToggle()) return;

    const previous = rideCreatedEnabled;
    setRideCreatedEnabled(value);
    setSaving(true);

    try {
      const userRef = doc(db, "users", currentUser.uid);
      await updateDoc(userRef, {
        // campo booleano: true = notifiche DISABILITATE per questo evento
        notificationsDisabledForCreatedRide: !value,
      });
    } catch (e) {
      console.error("Error updating rideCreated notification setting", e);
      setRideCreatedEnabled(previous);
      Alert.alert(
        "Errore",
        "Si è verificato un errore aggiornando le impostazioni per le nuove uscite."
      );
    } finally {
      setSaving(false);
    }
  };

  // ------- toggle: news bacheca -------
  const handleBoardPostToggle = async (value: boolean) => {
    if (saving) return;
    const currentUser = ensureAuthUser();
    if (!currentUser) return;
    if (!guardEventToggle()) return;

    const previous = boardPostEnabled;
    setBoardPostEnabled(value);
    setSaving(true);

    try {
      const userRef = doc(db, "users", currentUser.uid);
      await updateDoc(userRef, {
        notificationsDisabledForBoardPost: !value,
      });
    } catch (e) {
      console.error("Error updating boardPost notification setting", e);
      setBoardPostEnabled(previous);
      Alert.alert(
        "Errore",
        "Si è verificato un errore aggiornando le impostazioni per le news in bacheca."
      );
    } finally {
      setSaving(false);
    }
  };

  // ------- toggle: uscita annullata -------
  const handleRideCancelledToggle = async (value: boolean) => {
    if (saving) return;
    const currentUser = ensureAuthUser();
    if (!currentUser) return;
    if (!guardEventToggle()) return;

    const previous = rideCancelledEnabled;
    setRideCancelledEnabled(value);
    setSaving(true);

    try {
      const userRef = doc(db, "users", currentUser.uid);
      await updateDoc(userRef, {
        notificationsDisabledForCancelledRide: !value,
      });
    } catch (e) {
      console.error("Error updating rideCancelled notification setting", e);
      setRideCancelledEnabled(previous);
      Alert.alert(
        "Errore",
        "Si è verificato un errore aggiornando le impostazioni per le uscite annullate."
      );
    } finally {
      setSaving(false);
    }
  };

  // ------- toggle: nuovo utente in attesa (solo owner) -------
  const handlePendingUserToggle = async (value: boolean) => {
    if (saving) return;
    const currentUser = ensureAuthUser();
    if (!currentUser) return;
    if (!guardEventToggle()) return;

    const previous = pendingUserEnabled;
    setPendingUserEnabled(value);
    setSaving(true);

    try {
      const userRef = doc(db, "users", currentUser.uid);
      await updateDoc(userRef, {
        notificationsDisabledForPendingUser: !value,
      });
    } catch (e) {
      console.error("Error updating pendingUser notification setting", e);
      setPendingUserEnabled(previous);
      Alert.alert(
        "Errore",
        "Si è verificato un errore aggiornando le impostazioni per le nuove registrazioni."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen useNativeHeader scroll backgroundColor="#FDFCF8">
        <ScreenHeader title="Notifiche" showBack />
        <View style={styles.center}>
          <ActivityIndicator color={UI.colors.primary} />
        </View>
      </Screen>
    );
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    return (
      <Screen useNativeHeader scroll backgroundColor="#FDFCF8">
        <ScreenHeader title="Notifiche" showBack />
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            Devi effettuare l'accesso per gestire le notifiche.
          </Text>
        </View>
      </Screen>
    );
  }

  const eventSwitchDisabled = saving || !globalEnabled;

  return (
    <Screen useNativeHeader scroll={false} backgroundColor="#FDFCF8">
      <ScreenHeader title="Notifiche" showBack />
      <ScrollView contentContainerStyle={{ padding: UI.spacing.lg }}>
        {/* Toggle globale */}
        <View style={styles.card}>
          <Pressable
            style={({ pressed }) => [styles.settingRow, pressed && styles.rowPressed]}
            onPress={() => handleGlobalToggle(!globalEnabled)}
            disabled={saving}
            android_ripple={{ color: UI.colors.tint }}
            hitSlop={{ top: 6, bottom: 6 }}
          >
            <View style={styles.rowText}>
              <Text style={styles.cardTitle}>Notifiche push</Text>
              <Text style={styles.cardSubtitle}>
                Attiva o disattiva le notifiche push dell&apos;app. Quando sono disattivate,
                non riceverai alcun avviso.
              </Text>
            </View>
            <View style={styles.switchWrapper}>
              <Switch
                value={globalEnabled}
                onValueChange={handleGlobalToggle}
                disabled={saving}
                trackColor={{ false: UI.colors.tint, true: UI.colors.action }}
              />
            </View>
          </Pressable>
        </View>

        {/* Toggle per singolo evento */}
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { marginBottom: UI.spacing.sm }]}>
            Eventi
          </Text>

          <Pressable
            style={({ pressed }) => [styles.settingRow, styles.eventRow, pressed && styles.rowPressed]}
            onPress={() => handleRideCreatedToggle(!rideCreatedEnabled)}
            disabled={eventSwitchDisabled}
            android_ripple={{ color: UI.colors.tint }}
            hitSlop={{ top: 6, bottom: 6 }}
          >
            <View style={styles.rowText}>
              <Text style={styles.eventTitle}>Nuove uscite</Text>
              <Text style={styles.eventSubtitle}>
                Ricevi una notifica quando viene pubblicata una nuova uscita.
              </Text>
            </View>
            <View style={styles.switchWrapper}>
              <Switch
                value={rideCreatedEnabled}
                onValueChange={handleRideCreatedToggle}
                disabled={eventSwitchDisabled}
                trackColor={{ false: UI.colors.tint, true: UI.colors.action }}
              />
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.settingRow, styles.eventRow, pressed && styles.rowPressed]}
            onPress={() => handleRideCancelledToggle(!rideCancelledEnabled)}
            disabled={eventSwitchDisabled}
            android_ripple={{ color: UI.colors.tint }}
            hitSlop={{ top: 6, bottom: 6 }}
          >
            <View style={styles.rowText}>
              <Text style={styles.eventTitle}>Uscite annullate</Text>
              <Text style={styles.eventSubtitle}>
                Ricevi una notifica quando un&apos;uscita a cui potresti partecipare viene annullata.
              </Text>
            </View>
            <View style={styles.switchWrapper}>
              <Switch
                value={rideCancelledEnabled}
                onValueChange={handleRideCancelledToggle}
                disabled={eventSwitchDisabled}
                trackColor={{ false: UI.colors.tint, true: UI.colors.action }}
              />
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.settingRow, styles.eventRow, pressed && styles.rowPressed]}
            onPress={() => handleBoardPostToggle(!boardPostEnabled)}
            disabled={eventSwitchDisabled}
            android_ripple={{ color: UI.colors.tint }}
            hitSlop={{ top: 6, bottom: 6 }}
          >
            <View style={styles.rowText}>
              <Text style={styles.eventTitle}>News in bacheca</Text>
              <Text style={styles.eventSubtitle}>
                Ricevi una notifica quando viene pubblicata una nuova news in bacheca.
              </Text>
            </View>
            <View style={styles.switchWrapper}>
              <Switch
                value={boardPostEnabled}
                onValueChange={handleBoardPostToggle}
                disabled={eventSwitchDisabled}
                trackColor={{ false: UI.colors.tint, true: UI.colors.action }}
              />
            </View>
          </Pressable>

          {isOwner && (
            <Pressable
              style={({ pressed }) => [styles.settingRow, styles.eventRow, pressed && styles.rowPressed]}
              onPress={() => handlePendingUserToggle(!pendingUserEnabled)}
              disabled={eventSwitchDisabled}
              android_ripple={{ color: UI.colors.tint }}
              hitSlop={{ top: 6, bottom: 6 }}
            >
              <View style={styles.rowText}>
                <Text style={styles.eventTitle}>Nuovi utenti in attesa</Text>
                <Text style={styles.eventSubtitle}>
                  Ricevi una notifica quando un nuovo utente si registra ed è in attesa di approvazione.
                </Text>
              </View>
              <View style={styles.switchWrapper}>
                <Switch
                  value={pendingUserEnabled}
                  onValueChange={handlePendingUserToggle}
                  disabled={eventSwitchDisabled}
                  trackColor={{ false: UI.colors.tint, true: UI.colors.action }}
                />
              </View>
            </Pressable>
          )}
        </View>

        <Text style={styles.note}>
          Se le notifiche risultano ancora disattivate, controlla anche le
          impostazioni di sistema del dispositivo per l&apos;app{" "}
          {Platform.OS === "ios" ? `"Bike Hike Italia".` : `"Bike Hike Italia".`}
        </Text>
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 220,
  },
  emptyState: {
    flex: 1,
    minHeight: 200,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyStateText: {
    fontSize: 16,
    color: UI.colors.text,
    textAlign: "center",
  },
  card: {
    backgroundColor: UI.colors.card,
    borderRadius: UI.radius.xl,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: UI.spacing.lg,
    ...UI.shadow.card,
    marginBottom: UI.spacing.lg,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: UI.spacing.sm,
    borderRadius: UI.radius.md,
  },
  rowPressed: {
    backgroundColor: "#F8FAFC",
  },
  rowText: {
    flex: 1,
    paddingRight: UI.spacing.md,
  },
  switchWrapper: {
    justifyContent: "center",
    alignItems: "flex-end",
    paddingLeft: UI.spacing.md,
    flexShrink: 0,
    minWidth: 68,
    marginTop: -2, // alza leggermente lo switch per allinearlo visivamente al titolo
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: UI.colors.text,
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: UI.colors.muted,
  },
  eventRow: {
    marginTop: UI.spacing.md,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: UI.colors.text,
  },
  eventSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: UI.colors.muted,
  },
  note: {
    marginTop: UI.spacing.xl,
    fontSize: 13,
    lineHeight: 20,
    color: UI.colors.muted,
  },
});

export default NotificationSettingsScreen;
