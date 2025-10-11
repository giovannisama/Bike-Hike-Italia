// src/screens/admin/UserDetailScreen.tsx
import React, { useEffect, useState, useMemo, useLayoutEffect, useCallback } from "react";
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity, Alert, TextInput, KeyboardAvoidingView, Platform, ScrollView } from "react-native";

import { useRoute, useNavigation } from "@react-navigation/native";
import { auth, db } from "../../firebase";
import { doc, onSnapshot, updateDoc, deleteDoc } from "firebase/firestore";
import { Screen, Hero } from "../../components/Screen";

type Params = { uid: string };

type UserDoc = {
  uid: string;
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  nickname?: string | null;
  role?: "member" | "admin" | "owner";
  approved?: boolean;
  disabled?: boolean;
  createdAt?: any;
};

export default function UserDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { uid } = route.params as Params;

  // Safety guard: Handle missing/invalid UID
  useEffect(() => {
    if (!uid) {
      try { (navigation as any)?.goBack?.(); } catch {}
    }
  }, [uid, navigation]);

  const [user, setUser] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // MODIFICA PROFILO (inline)
  const [editMode, setEditMode] = useState(false);
  const [fFirstName, setFFirstName] = useState("");
  const [fLastName, setFLastName] = useState("");
  const [fDisplayName, setFDisplayName] = useState("");
  const [fNickname, setFNickname] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: "Dettaglio Utente",
      headerTitleAlign: "center",
    });
  }, [navigation]);

  useEffect(() => {
    const ref = doc(db, "users", uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setUser(null);
          setLoading(false);
          return;
        }
        const d = snap.data() || {};
        const next: UserDoc = {
          uid: snap.id,
          email: d.email ?? "",
          firstName: d.firstName ?? "",
          lastName: d.lastName ?? "",
          displayName: d.displayName ?? "",
          nickname: d.nickname ?? "",
          role: d.role ?? "member",
          approved: d.approved === true,
          disabled: d.disabled === true,
          createdAt: d.createdAt,
        };
        setUser(next);
        setLoading(false);

        // Se sono in edit, non sovrascrivo mentre scrive l’utente.
        if (!editMode) {
          setFFirstName(next.firstName || "");
          setFLastName(next.lastName || "");
          setFDisplayName(next.displayName || "");
          setFNickname(next.nickname || "");
        }
      },
      (err) => {
        console.error("UserDetail error:", err);
        setLoading(false);
      }
    );
    return () => { try { unsub(); } catch {} };
  }, [uid, editMode]);

  const currentUid = auth.currentUser?.uid || null;

  const isOwner = user?.role === "owner";
  const isSelf  = !!currentUid && user?.uid === currentUid;

  // Abilitazioni azioni
  const canApprove   = !isOwner && !isSelf && user?.role === "member" && user?.approved === false && user?.disabled !== true;
  const canActivate  = !isOwner && !isSelf && user?.disabled === true;
  const canDeactivate= !isOwner && !isSelf && user?.approved === true && user?.disabled !== true;
  const canPromote   = !isOwner && !isSelf && user?.role === "member" && user?.approved === true && user?.disabled !== true;
  const canDemote    = !isOwner && !isSelf && user?.role === "admin"  && user?.approved === true && user?.disabled !== true;
  const canDelete    = !isOwner && !isSelf && user?.disabled === true; // eliminiamo solo utenti disattivi

  const state = useMemo(() => {
    const isAdmin = user?.role === "admin" || user?.role === "owner";
    const isMember = user?.role === "member";
    const isApproved = user?.approved === true;
    const isDisabled = user?.disabled === true;

    return { isAdmin, isMember, isApproved, isDisabled };
  }, [user]);

  const fullName = () => {
    const ln = (user?.lastName || "").trim();
    const fn = (user?.firstName || "").trim();
    if (ln || fn) return `${ln}${ln && fn ? ", " : ""}${fn}`;
    return user?.displayName || user?.email || user?.uid;
  };

  if (loading) {
    return (
      <Screen useNativeHeader={true} scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8 }}>Carico utente…</Text>
        </View>
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen useNativeHeader={true} scroll={false}>
        <View style={styles.center}>
          <Text>Utente non trovato.</Text>
        </View>
      </Screen>
    );
  }

  // ─────────────────────────────────────────
  // ACTION HANDLERS
  // ─────────────────────────────────────────
  const handleApprove = async () => {
    if (!user || !canApprove) return;
    try {
      setActionLoading("approve");
      await updateDoc(doc(db, "users", user.uid), { approved: true });
    } catch (e: any) {
      Alert.alert("Errore", e?.message ?? "Impossibile approvare l'utente.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleActivate = async () => {
    if (!user || !canActivate) return;
    try {
      setActionLoading("activate");
      await updateDoc(doc(db, "users", user.uid), { disabled: false });
    } catch (e: any) {
      Alert.alert("Errore", e?.message ?? "Impossibile attivare l'utente.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivate = () => {
    if (!user || !canDeactivate) return;
    Alert.alert("Conferma", "Disattivare questo utente?", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Disattiva",
        style: "destructive",
        onPress: async () => {
          try {
            setActionLoading("deactivate");
            await updateDoc(doc(db, "users", user.uid), { disabled: true });
          } catch (e: any) {
            Alert.alert("Errore", e?.message ?? "Impossibile disattivare l'utente.");
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  const handlePromote = async () => {
    if (!user || !canPromote) return;
    try {
      setActionLoading("promote");
      await updateDoc(doc(db, "users", user.uid), { role: "admin" });
    } catch (e: any) {
      Alert.alert("Errore", e?.message ?? "Impossibile promuovere l'utente.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDemote = () => {
    if (!user || !canDemote) return;
    Alert.alert("Conferma", "Rimuovere i permessi Admin da questo utente?", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Rimuovi Admin",
        style: "destructive",
        onPress: async () => {
          try {
            setActionLoading("demote");
            await updateDoc(doc(db, "users", user.uid), { role: "member" });
          } catch (e: any) {
            Alert.alert("Errore", e?.message ?? "Impossibile rimuovere i permessi Admin.");
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  const handleDelete = () => {
    if (!user || !canDelete) return;
    Alert.alert(
      "Conferma",
      "Eliminare il documento utente da Firestore? (Non elimina l'account di autenticazione)",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Elimina",
          style: "destructive",
          onPress: async () => {
            try {
              setActionLoading("delete");
              await deleteDoc(doc(db, "users", user.uid));
              try { (navigation as any)?.goBack?.(); } catch {}
            } catch (e: any) {
              Alert.alert("Errore", e?.message ?? "Impossibile eliminare l'utente.");
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  // ─────────────────────────────────────────
  // SALVATAGGIO PROFILO (Modifica)
  // ─────────────────────────────────────────
  const startEdit = () => {
    setFFirstName(user.firstName || "");
    setFLastName(user.lastName || "");
    setFDisplayName(user.displayName || "");
    setFNickname(user.nickname || "");
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setFFirstName(user.firstName || "");
    setFLastName(user.lastName || "");
    setFDisplayName(user.displayName || "");
    setFNickname(user.nickname || "");
  };

  const saveEdit = async () => {
    // valida minimale per i testi
    const patch: any = {
      firstName: fFirstName.trim() || null,
      lastName: fLastName.trim() || null,
      displayName: fDisplayName.trim() || null,
      nickname: fNickname.trim() || null,
    };
    try {
      setActionLoading("edit");
      await updateDoc(doc(db, "users", user.uid), patch);
      setEditMode(false);
    } catch (e: any) {
      Alert.alert("Errore", e?.message ?? "Impossibile salvare le modifiche.");
    } finally {
      setActionLoading(null);
    }
  };

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <Screen useNativeHeader={true} scroll={true}>
      <Hero title={fullName()} subtitle={`${state.isAdmin ? "Admin" : "Member"} • ${user?.email || "—"}`} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: 24 }}>
          <Text style={styles.title}>Dettagli</Text>

          {!editMode ? (
            <>
              <View style={styles.row}><Text style={styles.label}>Email: </Text><Text>{user.email || "—"}</Text></View>
              <View style={styles.row}><Text style={styles.label}>Nome: </Text><Text>{user.firstName || "—"}</Text></View>
              <View style={styles.row}><Text style={styles.label}>Cognome: </Text><Text>{user.lastName || "—"}</Text></View>
              <View style={styles.row}><Text style={styles.label}>Display Name: </Text><Text>{user.displayName || "—"}</Text></View>
              <View style={styles.row}><Text style={styles.label}>Nickname: </Text><Text>{user.nickname || "—"}</Text></View>
              <View style={styles.row}><Text style={styles.label}>Ruolo: </Text><Text>{state.isAdmin ? "Admin" : "Member"}</Text></View>
              <View style={styles.row}>
                <Text style={styles.label}>Stato: </Text>
                <Text>
                  {user.disabled === true ? "Disattivo" : user.approved === true ? "Attivo" : "In attesa approvazione"}
                </Text>
              </View>
            </>
          ) : (
            <>
              <Field label="Nome" value={fFirstName} onChangeText={setFFirstName} />
              <Field label="Cognome" value={fLastName} onChangeText={setFLastName} />
              <Field label="Display Name" value={fDisplayName} onChangeText={setFDisplayName} />
              <Field label="Nickname" value={fNickname} onChangeText={setFNickname} />
            </>
          )}

          <View style={{ height: 16 }} />

          {/* Azioni contestuali con abilitazioni reali */}
          {!editMode && (user.approved && !user.disabled) && (
            <>
              <Button title="Modifica" onPress={startEdit} disabled={!!actionLoading || isOwner} />
              {state.isMember && (
                <Button title={actionLoading === "promote" ? "Promozione…" : "Rendi Admin"} onPress={handlePromote} disabled={!canPromote || !!actionLoading} />
              )}
              {state.isAdmin && !isOwner && (
                <Button title={actionLoading === "demote" ? "Rimozione…" : "Rimuovi Admin"} onPress={handleDemote} disabled={!canDemote || !!actionLoading} danger />
              )}
              <Button title={actionLoading === "deactivate" ? "Disattivazione…" : "Disattiva"} onPress={handleDeactivate} disabled={!canDeactivate || !!actionLoading} danger />
            </>
          )}

          {!editMode && state.isMember && !user.approved && !user.disabled && (
            <Button title={actionLoading === "approve" ? "Approvazione…" : "Approva"} onPress={handleApprove} disabled={!canApprove || !!actionLoading} />
          )}

          {!editMode && user.disabled && (
            <>
              <Button title={actionLoading === "activate" ? "Attivazione…" : "Attiva"} onPress={handleActivate} disabled={!canActivate || !!actionLoading} />
              <Button title={actionLoading === "delete" ? "Eliminazione…" : "Elimina"} onPress={handleDelete} disabled={!canDelete || !!actionLoading} danger />
            </>
          )}

          {/* Comandi di edit */}
          {editMode && (
            <View style={{ gap: 8 }}>
              <Button title={actionLoading === "edit" ? "Salvataggio…" : "Salva"} onPress={saveEdit} disabled={!!actionLoading} />
              <Button title="Annulla" onPress={cancelEdit} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontWeight: "700", marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        style={styles.input}
        autoCapitalize="words"
      />
    </View>
  );
}

function Button({
  title,
  onPress,
  disabled = false,
  danger = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.btn,
        { backgroundColor: danger ? "#B91C1C" : "#111", opacity: disabled ? 0.6 : 1 },
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <Text style={styles.btnText}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "900", color: "#111", marginBottom: 12 },
  row: { flexDirection: "row", marginBottom: 6, flexWrap: "wrap" },
  label: { fontWeight: "700", color: "#222" },
  btn: {
    backgroundColor: "#111",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 8,
  },
  btnText: { color: "#fff", fontWeight: "700", textAlign: "center" },

  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
});
