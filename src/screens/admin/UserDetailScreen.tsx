// src/screens/admin/UserDetailScreen.tsx
import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity, Alert, TextInput, Switch, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useRoute, useNavigation } from "@react-navigation/native";
import { auth, db } from "../../firebase";
import {
  doc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  deleteField,
} from "firebase/firestore";
import { Screen, UI } from "../../components/Screen";
import { mergeUsersPublic, deleteUsersPublic } from "../../utils/usersPublicSync";
import { getUserStatus } from "../../utils/userStatus";
import {
  DEFAULT_ENABLED_SECTIONS,
  normalizeEnabledSections,
  type EnabledSectionKey,
} from "../../utils/enabledSections";

const SELF_DELETED_SENTINEL = "__self_deleted__";
const ACTION_GREEN = "#22c55e";

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

type Params = { uid: string; meRole?: string | null; openEdit?: boolean };

type UserDoc = {
  uid: string;
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  nickname?: string | null;
  role?: UserRole;
  approved?: boolean | string | number | null;
  disabled?: boolean | string | number | null;
  enabledSections?: string[] | null;
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
      try { (navigation as any)?.goBack?.(); } catch { }
    }
  }, [uid, navigation]);

  const [user, setUser] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(initialMeRole ?? null);
  const [visibilitySaving, setVisibilitySaving] = useState(false);

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
          approved: d.approved,
          disabled: d.disabled,
          enabledSections: d.enabledSections ?? null,
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
    return () => { try { unsub(); } catch { } };
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
      try { unsubSelf(); } catch { }
    };
  }, [currentUid]);

  const isOwner = user?.role === "owner";
  const isSelf = !!currentUid && user?.uid === currentUid;
  const isCurrentOwner = myRole === "owner";
  const isSelfDeleted = user?.selfDeleted === true;
  const status = user ? getUserStatus(user) : null;
  const canEditVisibility = isCurrentOwner && !isSelfDeleted;
  const baseVisibility = useMemo(
    () => normalizeEnabledSections(user?.enabledSections) ?? DEFAULT_ENABLED_SECTIONS,
    [user?.enabledSections]
  );
  const [enabledSectionsDraft, setEnabledSectionsDraft] =
    useState<EnabledSectionKey[]>(DEFAULT_ENABLED_SECTIONS);
  useEffect(() => {
    setEnabledSectionsDraft(baseVisibility);
  }, [user?.uid, baseVisibility]);

  // Abilitazioni azioni
  const canApprove = isCurrentOwner && !isOwner && !isSelf && !isSelfDeleted && user?.role === "member" && !!status?.isPending;
  const canReject = canApprove;
  const canActivate = isCurrentOwner && !isOwner && !isSelf && !isSelfDeleted && !!status?.isDisabled;
  const canDeactivate = isCurrentOwner && !isOwner && !isSelf && !isSelfDeleted && !!status?.isActive;
  const canDelete = isCurrentOwner && !isOwner && !isSelf && !isSelfDeleted && status?.statusKey === "disabled";
  const canEditProfile = isCurrentOwner && !isOwner && !isSelf && !isSelfDeleted && !!status?.isActive;
  const currentRole: UserRole = (user?.role ?? "member") as UserRole;
  const canChangeRole =
    isCurrentOwner &&
    !isSelf &&
    !isSelfDeleted &&
    !!status?.isActive;
  const availableRoleTargets: UserRole[] = canChangeRole ? ROLE_TRANSITIONS[currentRole] : [];

  const startEdit = useCallback(() => {
    setFFirstName(user?.firstName ?? "");
    setFLastName(user?.lastName ?? "");
    setFDisplayName(user?.displayName ?? "");
    setFNickname(user?.nickname ?? "");
    setEditMode(true);
  }, [user]);
  // Sync params for App.tsx header
  // Hide native stack header manual check
  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  const state = useMemo(() => {
    const isAdmin = user?.role === "admin" || user?.role === "owner";
    const isMember = user?.role === "member";
    const isApproved = !!status?.approved;
    const isDisabled = !!status?.disabled;
    const wasSelfDeleted = user?.selfDeleted === true;

    return { isAdmin, isMember, isApproved, isDisabled, wasSelfDeleted };
  }, [user, status]);

  const fullName = () => {
    if (user?.selfDeleted) return "Account eliminato";
    const ln = (user?.lastName ?? "").trim();
    const fn = (user?.firstName ?? "").trim();
    if (ln || fn) return `${ln}${ln && fn ? ", " : ""}${fn}`;
    return user?.displayName || user?.email || user?.uid || "Utente";
  };

  const toggleSection = (key: EnabledSectionKey) => {
    if (!canEditVisibility) return;
    setEnabledSectionsDraft((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const isVisibilityDirty = useMemo(() => {
    const current = new Set(baseVisibility);
    const draft = new Set(enabledSectionsDraft);
    if (current.size !== draft.size) return true;
    for (const key of current) {
      if (!draft.has(key)) return true;
    }
    return false;
  }, [baseVisibility, enabledSectionsDraft]);

  // ─────────────────────────────────────────
  // ACTION HANDLERS
  // ─────────────────────────────────────────
  const handleApprove = async () => {
    if (!user || !canApprove) return;
    Alert.alert("Conferma", "Approvare questo utente?", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Approva",
        onPress: async () => {
          try {
            setActionLoading("approve");
            await updateDoc(doc(db, "users", user.uid), { approved: true, disabled: false });
            await mergeUsersPublic(user.uid, { approved: true, disabled: false }, "UserDetail");
          } catch (e: any) {
            console.error("[UserDetail] approve error:", { uid: user.uid, error: e });
            Alert.alert("Errore", e?.message ?? "Impossibile approvare l'utente.");
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  const handleReject = () => {
    if (!user || !canReject) return;
    Alert.alert(
      "Conferma",
      "Rifiutare questa richiesta di accesso? L'utente verrà spostato tra i disattivati.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Rifiuta",
          style: "destructive",
          onPress: async () => {
            try {
              setActionLoading("reject");
              await updateDoc(doc(db, "users", user.uid), { approved: false, disabled: true });
              await mergeUsersPublic(user.uid, { approved: false, disabled: true }, "UserDetail.reject");
            } catch (e: any) {
              console.error("[UserDetail] reject error:", { uid: user.uid, error: e });
              Alert.alert("Errore", e?.message ?? "Impossibile rifiutare la richiesta.");
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleActivate = async () => {
    if (!user || !canActivate) return;
    Alert.alert("Conferma", "Attivare questo utente?", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Attiva",
        onPress: async () => {
          try {
            setActionLoading("activate");
            await updateDoc(doc(db, "users", user.uid), { disabled: false });
            await mergeUsersPublic(user.uid, { disabled: false }, "UserDetail");
          } catch (e: any) {
            console.error("[UserDetail] activate error:", { uid: user.uid, error: e });
            Alert.alert("Errore", e?.message ?? "Impossibile attivare l'utente.");
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
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
            console.error("[UserDetail] deactivate error:", { uid: user.uid, error: e });
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

    const fromWeight = ROLE_WEIGHTS[fromRole];
    const toWeight = ROLE_WEIGHTS[targetRole];
    const isDemotion = toWeight < fromWeight;

    Alert.alert(
      "Conferma",
      `Impostare il ruolo ${ROLE_LABELS[targetRole]} per questo utente?`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Conferma",
          style: isDemotion ? "destructive" : "default",
          onPress: async () => {
            try {
              setActionLoading(`role:${targetRole}`);
              await updateDoc(doc(db, "users", user.uid), { role: targetRole });
              await mergeUsersPublic(user.uid, { role: targetRole }, "UserDetail");
            } catch (e: any) {
              console.error("[UserDetail] role error:", { uid: user.uid, role: targetRole, error: e });
              Alert.alert("Errore", e?.message ?? "Impossibile aggiornare il ruolo.");
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
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

              try { (navigation as any)?.goBack?.(); } catch { }
            } catch (e: any) {
              console.error("[UserDetail] delete error:", { uid: user.uid, error: e });
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

  const saveVisibility = async () => {
    if (!user || !canEditVisibility || !isVisibilityDirty) return;
    try {
      setVisibilitySaving(true);
      const allowed = new Set(["ciclismo", "trekking", "bikeaut"]);
      const normalized = Array.from(new Set(enabledSectionsDraft))
        .filter((value) => allowed.has(value))
        .sort();
      await updateDoc(doc(db, "users", user.uid), {
        enabledSections: normalized,
      });
    } catch (e: any) {
      Alert.alert("Errore", e?.message ?? "Impossibile salvare la visibilità.");
    } finally {
      setVisibilitySaving(false);
    }
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
  // RENDER
  // ─────────────────────────────────────────
  const roleLabel = user?.role === "owner" ? "Owner" : state.isAdmin ? "Admin" : "Member";
  const statusKey = status?.statusKey ?? "pending";
  const statusLabel = isSelfDeleted ? "Eliminato" : status?.statusLabel ?? "In attesa";
  return (
    <Screen
      useNativeHeader={true}
      title={undefined}
      scroll={true}
      keyboardShouldPersistTaps="handled"
      backgroundColor="#FDFCF8"
    >
      {/* MANUAL HEADER BLOCK */}
      <View style={styles.headerBlock}>
        <View style={styles.headerRow}>
          {/* Back Btn - Icon Only */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ marginRight: 8, padding: 4 }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color="#1E293B" />
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          {/* Edit Action (if allowed) */}
          {canEditProfile && !editMode && (
            <TouchableOpacity
              onPress={startEdit}
              style={{ padding: 4 }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="pencil-sharp" size={22} color="#1E293B" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.profileHeader}>
        <Text style={styles.profileName}>{fullName()}</Text>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, user?.role === "owner" ? styles.badgeOwner : state.isAdmin ? styles.badgeAdmin : styles.badgeMember]}>
            <Text style={styles.badgeText}>{roleLabel}</Text>
          </View>
          <View
            style={[
              styles.badge,
              isSelfDeleted
                ? styles.badgeDanger
                : statusKey === "disabled"
                  ? styles.badgeMuted
                  : statusKey === "active"
                    ? styles.badgeSuccess
                    : styles.badgePending,
            ]}
          >
            <Text style={styles.badgeText}>{statusLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.container}>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dati profilo</Text>
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
        </View>

        {isCurrentOwner && !editMode && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Visibilità sezioni</Text>
            <View style={styles.card}>
              {(
                [
                  { key: "ciclismo", label: "Ciclismo" },
                  { key: "trekking", label: "Trekking" },
                  { key: "bikeaut", label: "Bike Aut" },
                ] as Array<{ key: EnabledSectionKey; label: string }>
              ).map((item) => {
                const enabled = enabledSectionsDraft.includes(item.key);
                const disabledToggle = !canEditVisibility || visibilitySaving;
                return (
                  <Pressable
                    key={item.key}
                    style={({ pressed }) => [
                      styles.settingRow,
                      pressed && styles.rowPressed,
                    ]}
                    onPress={() => toggleSection(item.key)}
                    disabled={disabledToggle}
                  >
                    <View style={styles.rowText}>
                      <Text style={styles.toggleLabel}>{item.label}</Text>
                    </View>
                    <View style={styles.switchWrapper} pointerEvents="none">
                      <Switch
                        value={enabled}
                        onValueChange={() => { }}
                        disabled={disabledToggle}
                        trackColor={{ false: "#E2E8F0", true: "#86EFAC" }}
                        thumbColor={enabled ? ACTION_GREEN : "#fff"}
                      />
                    </View>
                  </Pressable>
                );
              })}
              <View style={styles.visibilitySpacer} />
              <Button
                title={visibilitySaving ? "Salvataggio…" : "Salva visibilità"}
                onPress={saveVisibility}
                disabled={!isVisibilityDirty || visibilitySaving}
              />
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Azioni</Text>
          <View style={styles.card}>
            {editMode ? (
              <View style={styles.actionGroup}>
                <Button title={actionLoading === "edit" ? "Salvataggio…" : "Salva"} onPress={saveEdit} disabled={!!actionLoading} />
                <Button title="Annulla" onPress={cancelEdit} variant="secondary" />
              </View>
            ) : (
              <>
                {isSelfDeleted ? (
                  <Text style={styles.selfDeletedNote}>
                    Questo account è stato eliminato dall'utente. Puoi rimuoverlo definitivamente dall'archivio se necessario.
                  </Text>
                ) : isCurrentOwner ? (
                  <>
                    <View style={styles.actionGroup}>
                      {canApprove && (
                        <Button
                          title={actionLoading === "approve" ? "Approvazione…" : "Approva"}
                          onPress={handleApprove}
                          disabled={!!actionLoading}
                        />
                      )}
                      {canReject && (
                        <Button
                          title={actionLoading === "reject" ? "Rifiuto…" : "Rifiuta"}
                          onPress={handleReject}
                          disabled={!!actionLoading}
                          variant="secondary"
                          danger
                        />
                      )}
                      {canActivate && (
                        <Button
                          title={actionLoading === "activate" ? "Attivazione…" : "Attiva"}
                          onPress={handleActivate}
                          disabled={!!actionLoading}
                        />
                      )}
                      {canDeactivate && (
                        <Button
                          title={actionLoading === "deactivate" ? "Disattivazione…" : "Disattiva"}
                          onPress={handleDeactivate}
                          disabled={!!actionLoading}
                          danger
                        />
                      )}
                    </View>

                    {canChangeRole && (
                      <View style={styles.roleBlock}>
                        <Text style={styles.subSectionTitle}>Ruolo</Text>
                        <View style={styles.roleRow}>
                          {(["owner", "admin", "member"] as UserRole[]).map((role) => {
                            const isCurrent = role === currentRole;
                            const allowed = availableRoleTargets.includes(role);
                            const disabled = isCurrent || !allowed || !!actionLoading;
                            return (
                              <TouchableOpacity
                                key={`role-pill-${role}`}
                                onPress={() => handleChangeRole(role)}
                                disabled={disabled}
                                accessibilityRole="button"
                                style={[
                                  styles.rolePill,
                                  isCurrent && styles.rolePillActive,
                                  disabled && !isCurrent && styles.rolePillDisabled,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.rolePillText,
                                    isCurrent && styles.rolePillTextActive,
                                  ]}
                                >
                                  {ROLE_LABELS[role]}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {!canChangeRole && !canEditProfile && !canApprove && !canActivate && !canDeactivate && (
                      <Text style={styles.ownerOnlyNote}>
                        Nessuna azione disponibile per questo profilo.
                      </Text>
                    )}

                    {!editMode && canDelete && (
                      <>
                        <View style={styles.actionDivider} />
                        <Text style={styles.subSectionTitle}>Eliminazione</Text>
                        <Text style={styles.dangerNote}>Azione irreversibile.</Text>
                        <Button
                          title={actionLoading === "delete" ? "Eliminazione…" : "Elimina definitivamente"}
                          onPress={handleDelete}
                          disabled={!!actionLoading}
                          danger
                        />
                      </>
                    )}
                  </>
                ) : (
                  <Text style={styles.ownerOnlyNote}>
                    Solo un Owner può modificare o approvare altri utenti.
                  </Text>
                )}
              </>
            )}
          </View>
        </View>

      </View>
    </Screen >
  );
}

function Button({
  title,
  onPress,
  disabled = false,
  danger = false,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  variant?: "primary" | "secondary";
}) {
  const isSecondary = variant === "secondary";
  const resolvedBg = danger ? "#B91C1C" : isSecondary ? "#E2E8F0" : ACTION_GREEN;
  const resolvedText = danger ? "#fff" : isSecondary ? "#0f172a" : "#fff";
  return (
    <TouchableOpacity
      style={[
        styles.btn,
        {
          backgroundColor: resolvedBg,
          borderColor: isSecondary ? "#cbd5e1" : "transparent",
          borderWidth: isSecondary ? 1 : 0,
          opacity: disabled ? 0.6 : 1,
        },
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <Text style={[styles.btnText, { color: resolvedText }]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  headerBlock: {
    marginBottom: 0,
    marginTop: Platform.OS === 'ios' ? 24 : 8,
    gap: 16,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  profileHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
  },
  profileName: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.3,
    lineHeight: 30,
    marginBottom: 10,
  },
  container: {
    paddingHorizontal: 4,
    paddingBottom: 32,
    gap: 18,
  },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#64748b",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  actionGroup: { gap: 12 },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 8,
    alignSelf: "stretch",
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
    backgroundColor: ACTION_GREEN,
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
  toggleLabel: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: UI.spacing.sm,
    borderRadius: 10,
  },
  rowPressed: {
    backgroundColor: "#F8FAFC",
  },
  rowText: {
    flex: 1,
    paddingRight: 12,
  },
  switchWrapper: {
    justifyContent: "center",
    alignItems: "flex-end",
    paddingLeft: UI.spacing.md,
    flexShrink: 0,
    minWidth: 68,
    marginTop: -2,
  },
  visibilitySpacer: {
    height: UI.spacing.lg,
  },
  selfDeletedNote: { color: "#b91c1c", fontWeight: "600" },
  ownerOnlyNote: { color: "#64748b", fontWeight: "600" },
  subSectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 10,
  },
  roleBlock: {
    marginTop: 6,
    gap: 10,
  },
  roleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  rolePill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  rolePillActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  rolePillDisabled: {
    opacity: 0.5,
  },
  rolePillText: {
    fontWeight: "700",
    color: "#0f172a",
  },
  rolePillTextActive: {
    color: "#fff",
  },
  actionDivider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 12,
  },
  dangerCard: {
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff5f5",
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  dangerNote: { color: "#b91c1c", fontWeight: "700" },
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
