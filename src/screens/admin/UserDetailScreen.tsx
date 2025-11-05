// src/screens/admin/UserDetailScreen.tsx
import React, { useEffect, useState, useMemo, useLayoutEffect, useRef, useCallback } from "react";
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity, Alert, TextInput } from "react-native";

import { useRoute, useNavigation } from "@react-navigation/native";
import { auth, db } from "../../firebase";
import {
  doc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  deleteField,
} from "firebase/firestore";
import { Screen, Hero } from "../../components/Screen";
import { mergeUsersPublic, deleteUsersPublic } from "../../utils/usersPublicSync";

const SELF_DELETED_SENTINEL = "__self_deleted__";

type UserRole = "member" | "admin" | "owner";

const ROLE_TRANSITIONS: Record<UserRole, UserRole[]> = {
  owner: ["admin", "member"],
  admin: ["owner", "member"],
  member: ["admin", "owner"],
};

const ROLE_WEIGHTS: Record<UserRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

const ROLE_LABELS: Record<UserRole, string> = {
  member: "Member",
  admin: "Admin",
  owner: "Owner",
};

const getRoleActionLabel = (current: UserRole, target: UserRole): string => {
  if (target === "owner") {
    return "Promuovi a Owner";
  }
  if (target === "admin") {
    return current === "member" ? "Promuovi a Admin" : "Declassa a Admin";
  }
  return "Declassa a Member";
};

type Params = { uid: string; meRole?: string | null };

type UserDoc = {
  uid: string;
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  nickname?: string | null;
  role?: UserRole;
  approved?: boolean;
  disabled?: boolean;
  createdAt?: any;
  selfDeleted?: boolean;
  selfDeletedAt?: any;
};

export default function UserDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { uid, meRole: initialMeRole } = route.params as Params;

  // Safety guard: Handle missing/invalid UID
  useEffect(() => {
    if (!uid) {
      try { (navigation as any)?.goBack?.(); } catch {}
    }
  }, [uid, navigation]);

  const [user, setUser] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(initialMeRole ?? null);

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
        const displayNameRaw = typeof d.displayName === "string" ? d.displayName : "";
        const isSelfDeleted = d.selfDeleted === true || displayNameRaw === SELF_DELETED_SENTINEL;
        const next: UserDoc = {
          uid: snap.id,
          email: d.email ?? "",
          firstName: isSelfDeleted ? "" : d.firstName ?? "",
          lastName: isSelfDeleted ? "" : d.lastName ?? "",
          displayName: isSelfDeleted ? "" : displayNameRaw,
          nickname: isSelfDeleted ? "" : d.nickname ?? "",
          role: d.role ?? "member",
          approved: d.approved === true,
          disabled: d.disabled === true,
          createdAt: d.createdAt,
          selfDeleted: isSelfDeleted,
          selfDeletedAt: d.selfDeletedAt,
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
  useEffect(() => {
    if (!currentUid) {
      setMyRole(null);
      return;
    }
    const selfRef = doc(db, "users", currentUid);
    const unsubSelf = onSnapshot(
      selfRef,
      (snap) => {
        if (!snap.exists()) {
          setMyRole(null);
          return;
        }
        const role = (snap.data() as any)?.role;
        setMyRole(typeof role === "string" ? role : null);
      },
      () => setMyRole(null)
    );
    return () => {
      try { unsubSelf(); } catch {}
    };
  }, [currentUid]);

  const isOwner = user?.role === "owner";
  const isSelf  = !!currentUid && user?.uid === currentUid;
  const isCurrentOwner = myRole === "owner";
  const isSelfDeleted = user?.selfDeleted === true;

  // Abilitazioni azioni
  const canApprove   = isCurrentOwner && !isOwner && !isSelf && !isSelfDeleted && user?.role === "member" && user?.approved === false && user?.disabled !== true;
  const canActivate  = isCurrentOwner && !isOwner && !isSelf && !isSelfDeleted && user?.disabled === true;
  const canDeactivate= isCurrentOwner && !isOwner && !isSelf && !isSelfDeleted && user?.approved === true && user?.disabled !== true;
  const canDelete    = isCurrentOwner && !isOwner && !isSelf && (user?.disabled === true || isSelfDeleted);
  const canEditProfile = isCurrentOwner && !isOwner && !isSelf && !isSelfDeleted && user?.approved === true && user?.disabled !== true;
  const currentRole: UserRole = (user?.role ?? "member") as UserRole;
  const canChangeRole =
    isCurrentOwner &&
    !isSelf &&
    !isSelfDeleted &&
    user?.approved === true &&
    user?.disabled !== true;
  const availableRoleTargets: UserRole[] = canChangeRole ? ROLE_TRANSITIONS[currentRole] : [];

  const state = useMemo(() => {
    const isAdmin = user?.role === "admin" || user?.role === "owner";
    const isMember = user?.role === "member";
    const isApproved = user?.approved === true;
    const isDisabled = user?.disabled === true;
    const wasSelfDeleted = user?.selfDeleted === true;

    return { isAdmin, isMember, isApproved, isDisabled, wasSelfDeleted };
  }, [user]);

  const fullName = () => {
    if (user?.selfDeleted) return "Account eliminato";
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

  const handleChangeRole = (targetRole: UserRole) => {
    if (!user || !canChangeRole) return;
    const fromRole: UserRole = (user.role ?? "member") as UserRole;
    if (!ROLE_TRANSITIONS[fromRole].includes(targetRole)) return;

    const performChange = async () => {
      try {
        setActionLoading(`role:${targetRole}`);
        await updateDoc(doc(db, "users", user.uid), { role: targetRole });
        await mergeUsersPublic(user.uid, { role: targetRole }, "UserDetail");
      } catch (e: any) {
        Alert.alert("Errore", e?.message ?? "Impossibile aggiornare il ruolo.");
      } finally {
        setActionLoading(null);
      }
    };

    const fromWeight = ROLE_WEIGHTS[fromRole];
    const toWeight = ROLE_WEIGHTS[targetRole];

    if (toWeight < fromWeight) {
      Alert.alert(
        "Conferma",
        `Declassare questo utente da ${ROLE_LABELS[fromRole]} a ${ROLE_LABELS[targetRole]}?`,
        [
          { text: "Annulla", style: "cancel" },
          {
            text: "Conferma",
            style: "destructive",
            onPress: () => {
              void performChange();
            },
          },
        ]
      );
      return;
    }

    void performChange();
  };

  const handleDelete = () => {
    if (!user || !canDelete) return;
    Alert.alert(
      "Conferma",
      "Eliminare l'utente selezionato? (Non sarà possibile tornare indietro)",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Elimina",
          style: "destructive",
          onPress: async () => {
            const userRef = doc(db, "users", user.uid);
            try {
              setActionLoading("delete");
              let removed = false;
              try {
                await deleteDoc(userRef);
                removed = true;
              } catch (fireErr: any) {
                if (fireErr?.code === "permission-denied") {
                  try {
                    await updateDoc(userRef, {
                      displayName: SELF_DELETED_SENTINEL,
                      firstName: null,
                      lastName: null,
                      nickname: null,
                      approved: false,
                      disabled: true,
                      membershipCard: deleteField(),
                    });
                    removed = true;
                  } catch (fallbackErr: any) {
                    if (fallbackErr?.code === "permission-denied") {
                      Alert.alert(
                        "Permessi insufficienti",
                        "Non hai i permessi necessari per eliminare questo utente. Contatta un Owner."
                      );
                      return;
                    }
                    throw fallbackErr;
                  }
                } else if (fireErr?.code !== "not-found") {
                  throw fireErr;
                }
              }

              const publicDeleted = await deleteUsersPublic(user.uid, "UserDetail");
              if (!publicDeleted) {
                await mergeUsersPublic(
                  user.uid,
                  {
                    displayName: SELF_DELETED_SENTINEL,
                    firstName: null,
                    lastName: null,
                    nickname: null,
                    email: user.email ?? null,
                    disabled: true,
                    approved: false,
                  },
                  "UserDetail.deleteFallback"
                );
              }

              if (!removed) {
                Alert.alert(
                  "Eliminato parzialmente",
                  "Il profilo è stato oscurato ma non è stato possibile rimuoverlo completamente per via delle regole di sicurezza."
                );
              }

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

  const handleFirstNameChange = (text: string) => {
    setFFirstName(text);
  };
  const handleLastNameChange = (text: string) => {
    setFLastName(text);
  };
  const handleDisplayNameChange = (text: string) => {
    setFDisplayName(text);
  };
  const handleNicknameChange = (text: string) => {
    setFNickname(text);
  };

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
  const roleLabel = user?.role === "owner" ? "Owner" : state.isAdmin ? "Admin" : "Member";
  const statusLabel = isSelfDeleted
    ? "Eliminato"
    : user?.disabled
    ? "Disattivo"
    : user?.approved
    ? "Attivo"
    : "In attesa";
  const heroSubtitle = `${roleLabel} • ${statusLabel} • ${user?.email || "—"}`;

  return (
    <Screen useNativeHeader={true} scroll={true} keyboardShouldPersistTaps="handled">
      <Hero title={fullName()} subtitle={heroSubtitle} />

      <View style={styles.container}>
        <Text style={styles.title}>Dettagli</Text>

        <View style={styles.badgeRow}>
          <View style={[styles.badge, user?.role === "owner" ? styles.badgeOwner : state.isAdmin ? styles.badgeAdmin : styles.badgeMember]}>
            <Text style={styles.badgeText}>{roleLabel}</Text>
          </View>
          <View
            style={[
              styles.badge,
              isSelfDeleted
                ? styles.badgeDanger
                : user.disabled
                ? styles.badgeMuted
                : user.approved
                ? styles.badgeSuccess
                : styles.badgePending,
            ]}
          >
            <Text style={styles.badgeText}>{statusLabel}</Text>
          </View>
        </View>

        <View style={styles.card}>
          {!editMode ? (
            <>
              <InfoRow
                label="Nome completo"
                value={
                  isSelfDeleted
                    ? "—"
                    : `${user.firstName || "—"} ${user.lastName || ""}`.trim() || user.displayName || "—"
                }
              />
              <InfoRow label="Display name" value={isSelfDeleted ? "—" : user.displayName || "—"} />
              <InfoRow label="Nickname" value={isSelfDeleted ? "—" : user.nickname || "—"} />
              <InfoRow label="Email" value={user.email || "—"} />
              <InfoRow label="Stato" value={statusLabel} />
              {isSelfDeleted && (
                <InfoRow
                  label="Eliminato il"
                  value={user.selfDeletedAt?.toDate?.() ? user.selfDeletedAt.toDate().toLocaleString() : "—"}
                />
              )}
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

        <View style={{ gap: 8 }}>
          {editMode ? (
            <>
              <Button title={actionLoading === "edit" ? "Salvataggio…" : "Salva"} onPress={saveEdit} disabled={!!actionLoading} />
              <Button title="Annulla" onPress={cancelEdit} />
            </>
          ) : (
            <>
              {isSelfDeleted ? (
                <Text style={{ color: "#b91c1c", fontWeight: "600" }}>
                  Questo account è stato eliminato dall'utente. Puoi rimuoverlo definitivamente dall'archivio se necessario.
                </Text>
              ) : isCurrentOwner ? (
                <>
                  {canEditProfile && (
                    <Button title="Modifica" onPress={startEdit} disabled={!!actionLoading} />
                  )}
                  {availableRoleTargets.map((targetRole) => {
                    const loadingKey = `role:${targetRole}`;
                    const isDemotion = ROLE_WEIGHTS[targetRole] < ROLE_WEIGHTS[currentRole];
                    const buttonTitle =
                      actionLoading === loadingKey
                        ? "Aggiornamento ruolo…"
                        : getRoleActionLabel(currentRole, targetRole);
                    return (
                      <Button
                        key={`role-${targetRole}`}
                        title={buttonTitle}
                        onPress={() => handleChangeRole(targetRole)}
                        disabled={!!actionLoading}
                        danger={isDemotion}
                      />
                    );
                  })}
                  {canDeactivate && (
                    <Button
                      title={actionLoading === "deactivate" ? "Disattivazione…" : "Disattiva"}
                      onPress={handleDeactivate}
                      disabled={!!actionLoading}
                      danger
                    />
                  )}
                  {canApprove && (
                    <Button
                      title={actionLoading === "approve" ? "Approvazione…" : "Approva"}
                      onPress={handleApprove}
                      disabled={!!actionLoading}
                    />
                  )}
                  {canActivate && (
                    <Button
                      title={actionLoading === "activate" ? "Attivazione…" : "Attiva"}
                      onPress={handleActivate}
                      disabled={!!actionLoading}
                    />
                  )}
                </>
              ) : (
                <Text style={{ color: "#64748b", fontWeight: "600" }}>
                  Solo un Owner può modificare o approvare altri utenti.
                </Text>
              )}

              {canDelete && (
                <Button
                  title={actionLoading === "delete" ? "Eliminazione…" : "Elimina"}
                  onPress={handleDelete}
                  disabled={!!actionLoading}
                  danger
                />
              )}
            </>
          )}
        </View>
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
  container: {
    paddingHorizontal: 4,
    paddingBottom: 32,
    gap: 20,
  },
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
  badgeOwner: {
    backgroundColor: "#0f172a",
  },
  badgeSuccess: {
    backgroundColor: "#16A34A",
  },
  badgeDanger: {
    backgroundColor: "#DC2626",
  },
  badgeMuted: {
    backgroundColor: "#6B7280",
  },
  badgePending: {
    backgroundColor: "#F59E0B",
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
