// src/screens/admin/UserDetailScreen.tsx
import React, { useEffect, useState, useMemo, useLayoutEffect, useRef, useCallback } from "react";
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity, Alert, TextInput, ScrollView } from "react-native";

import { useRoute, useNavigation } from "@react-navigation/native";
import { auth, db } from "../../firebase";
import { doc, onSnapshot, updateDoc, deleteDoc } from "firebase/firestore";
import { Screen, Hero } from "../../components/Screen";
import { mergeUsersPublic, deleteUsersPublic } from "../../utils/usersPublicSync";

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
  const firstNameRef = useRef<TextInput>(null);
  const lastNameRef = useRef<TextInput>(null);
  const displayNameRef = useRef<TextInput>(null);
  const nicknameRef = useRef<TextInput>(null);

  const editModeRef = useRef(editMode);
  const pendingUserRef = useRef<UserDoc | null>(null);

  const applySnapshot = useCallback((next: UserDoc | null) => {
    setUser(next);
    if (!next) return;
    setFFirstName(next.firstName || "");
    setFLastName(next.lastName || "");
    setFDisplayName(next.displayName || "");
    setFNickname(next.nickname || "");
  }, []);

  useEffect(() => {
    editModeRef.current = editMode;
    if (!editMode && pendingUserRef.current) {
      applySnapshot(pendingUserRef.current);
      pendingUserRef.current = null;
    }
  }, [editMode, applySnapshot]);

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
        setLoading(false);

        if (editModeRef.current) {
          pendingUserRef.current = next;
        } else {
          applySnapshot(next);
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
    const ln = (user?.lastName ?? "").trim();
    const fn = (user?.firstName ?? "").trim();
    if (ln || fn) return `${ln}${ln && fn ? ", " : ""}${fn}`;
    return user?.displayName || user?.email || user?.uid || "Utente";
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
      await mergeUsersPublic(user.uid, { approved: true }, "UserDetail");
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
      await mergeUsersPublic(user.uid, { disabled: false }, "UserDetail");
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
            await mergeUsersPublic(user.uid, { disabled: true }, "UserDetail");
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
      await mergeUsersPublic(user.uid, { role: "admin" }, "UserDetail");
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
            await mergeUsersPublic(user.uid, { role: "member" }, "UserDetail");
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
              await deleteUsersPublic(user.uid, "UserDetail");
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
    setFFirstName(user?.firstName ?? "");
    setFLastName(user?.lastName ?? "");
    setFDisplayName(user?.displayName ?? "");
    setFNickname(user?.nickname ?? "");
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setFFirstName(user?.firstName ?? "");
    setFLastName(user?.lastName ?? "");
    setFDisplayName(user?.displayName ?? "");
    setFNickname(user?.nickname ?? "");
  };

  const handleFirstNameChange = (text: string) => setFFirstName(text);
  const handleLastNameChange = (text: string) => setFLastName(text);
  const handleDisplayNameChange = (text: string) => setFDisplayName(text);
  const handleNicknameChange = (text: string) => setFNickname(text);

  const saveEdit = async () => {
    if (!user) return;
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
      await mergeUsersPublic(user.uid, patch, "UserDetail");
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
    <Screen useNativeHeader={true} scroll={false}>
      <Hero title={fullName()} subtitle={`${state.isAdmin ? "Admin" : "Member"} • ${user?.email || "—"}`} />

      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Dettagli</Text>

          <View style={styles.badgeRow}>
            <View style={[styles.badge, state.isAdmin ? styles.badgeAdmin : styles.badgeMember]}>
              <Text style={styles.badgeText}>{state.isAdmin ? "Admin" : state.isMember ? "Member" : "Owner"}</Text>
            </View>
            {user.disabled ? (
              <View style={[styles.badge, styles.badgeDanger]}>
                <Text style={styles.badgeText}>Disattivo</Text>
              </View>
            ) : (
              <View style={[styles.badge, styles.badgeSuccess]}>
                <Text style={styles.badgeText}>{user.approved ? "Attivo" : "In attesa"}</Text>
              </View>
            )}
          </View>

          <View style={styles.card}>
            {!editMode ? (
              <>
                <InfoRow label="Nome completo" value={`${user.firstName || "—"} ${user.lastName || ""}`.trim() || user.displayName || "—"} />
                <InfoRow label="Display name" value={user.displayName || "—"} />
                <InfoRow label="Nickname" value={user.nickname || "—"} />
                <InfoRow label="Email" value={user.email || "—"} />
                <InfoRow label="Ruolo" value={state.isAdmin ? "Admin" : state.isMember ? "Member" : "Owner"} />
                <InfoRow
                  label="Stato"
                  value={
                    user.disabled === true ? "Disattivo" : user.approved === true ? "Attivo" : "In attesa approvazione"
                  }
                />
              </>
            ) : (
              <>
                <LabeledInput
                  ref={firstNameRef}
                  label="Nome"
                  value={fFirstName}
                  placeholder="Mario"
                  returnKeyType="next"
                  onSubmitEditing={() => lastNameRef.current?.focus()}
                  onChangeText={handleFirstNameChange}
                />
                <LabeledInput
                  ref={lastNameRef}
                  label="Cognome"
                  value={fLastName}
                  placeholder="Rossi"
                  returnKeyType="next"
                  onSubmitEditing={() => displayNameRef.current?.focus()}
                  onChangeText={handleLastNameChange}
                />
                <LabeledInput
                  ref={displayNameRef}
                  label="Display Name"
                  value={fDisplayName}
                  placeholder="Rossi, Mario"
                  returnKeyType="next"
                  onSubmitEditing={() => nicknameRef.current?.focus()}
                  onChangeText={handleDisplayNameChange}
                />
                <LabeledInput
                  ref={nicknameRef}
                  label="Nickname"
                  value={fNickname}
                  placeholder="SuperBiker"
                  returnKeyType="done"
                  onChangeText={handleNicknameChange}
                />
              </>
            )}
          </View>

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
          <View style={{ height: 120 }} />
        </ScrollView>
      </View>
    </Screen>
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
  btn: {
    backgroundColor: "#111",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 8,
  },
  btnText: { color: "#fff", fontWeight: "700", textAlign: "center" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  infoRow: {
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    marginTop: 4,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.4,
  },
  badgeAdmin: {
    backgroundColor: "#1D4ED8",
  },
  badgeMember: {
    backgroundColor: "#64748B",
  },
  badgeSuccess: {
    backgroundColor: "#16A34A",
  },
  badgeDanger: {
    backgroundColor: "#DC2626",
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#fff",
    fontSize: 16,
    color: "#0f172a",
  },
});

type LabeledInputProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  returnKeyType?: "done" | "next" | "go" | "search" | "send" | "default";
  onSubmitEditing?: () => void;
};

const LabeledInput = React.forwardRef<TextInput, LabeledInputProps>(
  ({ label, value, onChangeText, placeholder, returnKeyType = "default", onSubmitEditing }, ref) => (
    <View style={{ marginBottom: 18 }}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        style={styles.input}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        blurOnSubmit={returnKeyType !== "next"}
      />
    </View>
  )
);

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || "—"}</Text>
    </View>
  );
}
