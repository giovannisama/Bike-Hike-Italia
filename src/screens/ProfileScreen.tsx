// src/screens/ProfileScreen.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Platform,
  Alert,
  Image,
  Switch,
  StyleSheet,
} from "react-native";
import { auth, db } from "../firebase";
import { doc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { updateProfile as fbUpdateProfile } from "firebase/auth";
import { Screen } from "../components/Screen";
import { PrimaryButton } from "../components/Button";
import {
  deviceSupportsBiometrics,
  loadCredsSecurely,
  clearCredsSecurely,
} from "../utils/biometricHelpers";

const logo = require("../../assets/images/logo.jpg");

export default function ProfileScreen() {
  const user = auth.currentUser;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [hasProfile, setHasProfile] = useState(false);

  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      setHasProfile(snap.exists());
      const data = snap.data() || {};
      setFirstName(data.firstName || "");
      setLastName(data.lastName || "");
      setNickname(data.nickname || "");
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    (async () => {
      const ok = await deviceSupportsBiometrics();
      const stored = await loadCredsSecurely();
      setBioAvailable(ok);
      setBioEnabled(!!stored);
    })();
  }, []);

  const onToggleBiometrics = async (next: boolean) => {
    if (!bioAvailable) {
      Alert.alert("Non supportato", "Questo dispositivo non supporta Face ID / Touch ID.");
      return;
    }
    if (next) {
      const stored = await loadCredsSecurely();
      if (!stored) {
        setBioEnabled(false);
        Alert.alert(
          "Come abilitare",
          "Per usare Face ID/Touch ID: effettua un login con email e password e, quando richiesto, scegli 'Sì' per salvare le credenziali."
        );
        return;
      }
      setBioEnabled(true);
      Alert.alert("Attivato", "Accesso rapido abilitato.");
    } else {
      await clearCredsSecurely();
      setBioEnabled(false);
      Alert.alert("Disattivato", "Accesso rapido disabilitato.");
    }
  };

  const handleSave = async () => {
    try {
      if (!user) {
        Alert.alert("Non sei loggato", "Effettua il login per salvare il profilo.");
        return;
      }
      const uid = user.uid;
      const email = user.email || "";
      const cleanFirst = firstName.trim();
      const cleanLast = lastName.trim();
      const cleanNick = nickname.trim();
      const displayName = `${cleanLast}${cleanLast && cleanFirst ? ", " : ""}${cleanFirst}`.trim();

      if (!hasProfile) {
        // CREATE: rispetta validUserCreateSelf (uid/email/role/approved/createdAt)
        await setDoc(
          doc(db, "users", uid),
          {
            uid,
            email,
            displayName,
            firstName: cleanFirst || null,
            lastName: cleanLast || null,
            nickname: cleanNick || null,
            role: "member",
            approved: false,
            disabled: false,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        // UPDATE: rispetta validUserUpdateSelf (solo questi campi)
        await setDoc(
          doc(db, "users", uid),
          {
            displayName,
            firstName: cleanFirst || null,
            lastName: cleanLast || null,
            nickname: cleanNick || null,
          },
          { merge: true }
        );
      }

      // PUBBLICO: includi SEMPRE createdAt (le regole lo accettano anche in update)
      await setDoc(
        doc(db, "users_public", uid),
        {
          displayName: displayName || null,
          firstName: cleanFirst || null,
          lastName: cleanLast || null,
          nickname: cleanNick || null,
          email: email || null,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      await fbUpdateProfile(user, { displayName });
      Alert.alert("Fatto!", "Profilo aggiornato correttamente.");
    } catch (e: any) {
      Alert.alert("Errore salvataggio", e?.message ?? "Operazione non riuscita.");
    }
  };

  return (
    <Screen title="Profilo" subtitle="Gestisci i tuoi dati">
      <View style={styles.header}>
        <Image source={logo} style={styles.logo} />
        <View>
          <Text style={styles.title}>Bike & Hike Italia</Text>
          <Text style={styles.subtitle}>Account</Text>
        </View>
      </View>

      <Text style={styles.label}>Nome</Text>
      <TextInput
        style={styles.input}
        value={firstName}
        onChangeText={setFirstName}
        placeholder="Mario"
      />

      <Text style={styles.label}>Cognome</Text>
      <TextInput
        style={styles.input}
        value={lastName}
        onChangeText={setLastName}
        placeholder="Rossi"
      />

      <Text style={styles.label}>Nickname</Text>
      <TextInput
        style={styles.input}
        value={nickname}
        onChangeText={setNickname}
        placeholder="SuperBiker"
      />

      <View style={{ marginTop: 24 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.label}>Face ID / Touch ID</Text>
          <Switch value={bioEnabled} onValueChange={onToggleBiometrics} disabled={!bioAvailable} />
        </View>
      </View>
      <PrimaryButton label="Salva" onPress={handleSave} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  logo: { width: 64, height: 64, marginRight: 12, borderRadius: 12 },
  title: { fontSize: 20, fontWeight: "700" },
  subtitle: { fontSize: 14, color: "#666" },
  label: { marginTop: 12, fontWeight: "600", color: "#374151" },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    backgroundColor: "#fff",
  },
});
