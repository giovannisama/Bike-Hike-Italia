import React, { useEffect, useState } from "react";
import { View, Text, Switch, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { registerForPushNotificationsAsync, setNotificationsDisabled } from "../services/pushNotifications";
import { Screen, UI } from "../components/Screen";

const NotificationSettingsScreen: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
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
          const data = snap.data();
          const notificationsDisabled = data.notificationsDisabled === true;
          setEnabled(!notificationsDisabled);
        }
      } catch (e) {
        console.error("Error loading notification settings", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleToggle = async (value: boolean) => {
    if (saving) return;
    const previousValue = enabled;
    setEnabled(value);
    setSaving(true);
    try {
      if (value) {
        // Abilita notifiche: chiedi permessi + registra token
        const token = await registerForPushNotificationsAsync();
        if (!token) {
          Alert.alert(
            "Notifiche",
            "Non è stato possibile attivare le notifiche. Controlla i permessi nelle impostazioni di sistema."
          );
          setEnabled(previousValue);
          await setNotificationsDisabled(true);
          return;
        }
        await setNotificationsDisabled(false);
      } else {
        // Disabilita notifiche
        await setNotificationsDisabled(true);
      }
    } catch (e) {
      console.error("Error updating notification settings", e);
      setEnabled(previousValue);
      Alert.alert("Errore", "Si è verificato un errore aggiornando le impostazioni notifiche.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen title="Notifiche">
        <View style={styles.center}>
          <ActivityIndicator color={UI.colors.primary} />
        </View>
      </Screen>
    );
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    return (
      <Screen title="Notifiche">
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            Devi effettuare l'accesso per gestire le notifiche.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen title="Notifiche">
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Nuove uscite</Text>
            <Text style={styles.cardSubtitle}>
              Ricevi una notifica quando viene pubblicata una nuova uscita.
            </Text>
          </View>
          <Switch value={enabled} onValueChange={handleToggle} disabled={saving} />
        </View>
      </View>
      <Text style={styles.note}>
        Se le notifiche risultano ancora disattivate, controlla anche le
        impostazioni di iOS per l'app "Bike Hike Italia".
      </Text>
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
    borderColor: "#e5e7eb",
    padding: UI.spacing.lg,
    ...UI.shadow.card,
    marginBottom: UI.spacing.lg,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: UI.spacing.md,
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
  note: {
    marginTop: UI.spacing.xl,
    fontSize: 13,
    lineHeight: 20,
    color: UI.colors.muted,
  },
});

export default NotificationSettingsScreen;
