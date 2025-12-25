// src/screens/admin/UserListScreen.tsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Pressable,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Screen, UI } from "../../components/Screen";
import { auth, db } from "../../firebase";
import {
  collection,
  onSnapshot,
  DocumentData,
  updateDoc,
  doc,
  deleteDoc,
  deleteField,
} from "firebase/firestore";
import { mergeUsersPublic, deleteUsersPublic } from "../../utils/usersPublicSync";
import { getUserStatus, normalizeBooleanFlag } from "../../utils/userStatus";
import { Ionicons } from "@expo/vector-icons";
import { StatusBadge } from "../calendar/StatusBadge";

const SELF_DELETED_SENTINEL = "__self_deleted__";
const ACTION_GREEN = "#22c55e";

type BooleanFirestoreValue =
  | boolean
  | string
  | number
  | null
  | undefined;

type UserRow = {
  uid: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  nickname?: string | null;
  role?: "member" | "admin" | "owner";
  approved?: BooleanFirestoreValue;
  disabled?: BooleanFirestoreValue;
  approvedFlag?: boolean;
  disabledFlag?: boolean;
  selfDeleted?: BooleanFirestoreValue;
  selfDeletedFlag?: boolean;
  statusKey?: "pending" | "active" | "disabled";
  statusLabel?: "In attesa" | "Attivo" | "Disattivo";
};

type FilterKey = "all" | "active" | "disabled" | "pending";

type QuickAction = "approve" | "activate" | "deactivate" | "reject" | null;
type BulkAction = "approve" | "activate" | "deactivate" | "delete";

const normalize = (value?: string | null) =>
  (value || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function getRoleWeight(role?: string | null): number {
  switch ((role || "").toLowerCase()) {
    case "owner":
      return 0;
    case "admin":
      return 1;
    case "member":
      return 2;
    default:
      return 3;
  }
}


// ─────────────────────────────────────────
// UI Helpers
// ─────────────────────────────────────────
function SmallBtn({
  title,
  onPress,
  disabled,
  kind = "primary",
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  kind?: "primary" | "warning";
}) {
  const resolvedBg = kind === "warning" ? UI.colors.danger : ACTION_GREEN;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[
        styles.smallBtn,
        { backgroundColor: resolvedBg, opacity: disabled ? 0.6 : 1 },
      ]}
    >
      <Text style={styles.smallBtnText}>{title}</Text>
    </TouchableOpacity>
  );
}

function Row({
  user,
  onPress,
  right,
  selected,
  onToggleSelect,
  showSelection,
  selectDisabled,
}: {
  user: UserRow;
  onPress: (uid: string) => void;
  right?: React.ReactNode;
  selected?: boolean;
  onToggleSelect?: (uid: string) => void;
  showSelection?: boolean;
  selectDisabled?: boolean;
}) {
  const cognome = (user.lastName || "").trim();
  const nome = (user.firstName || "").trim();
  const ruolo =
    user.role === "owner" ? "Owner" : user.role === "admin" ? "Admin" : "Member";

  const selfDeletedFlag =
    user.selfDeletedFlag ?? normalizeBooleanFlag(user.selfDeleted);

  const isSelfDeleted = selfDeletedFlag === true;

  const stato = isSelfDeleted
    ? ("Eliminato" as const)
    : (user.statusLabel ?? getUserStatus(user).statusLabel);

  const title = isSelfDeleted
    ? "Account eliminato"
    : cognome || nome
    ? `${cognome}${cognome && nome ? ", " : ""}${nome}`
    : user.displayName || user.email || "Utente";

  const roleBadge = (
    <StatusBadge
      text={ruolo}
      icon={ruolo === "Owner" ? "⭐" : ruolo === "Admin" ? "🛠" : "👤"}
      bg={ruolo === "Owner" ? "#1c1917" : ruolo === "Admin" ? "#1f2937" : "#6b7280"}
      fg="#fff"
      accessibilityLabel={`Ruolo: ${ruolo}`}
    />
  );

  const statusPalette =
    stato === "Attivo"
      ? { bg: ACTION_GREEN, fg: "#0f172a" }
    : stato === "Disattivo"
      ? { bg: UI.colors.muted, fg: "#fff" }
    : stato === "Eliminato"
      ? { bg: UI.colors.danger, fg: "#fff" }
    : { bg: UI.colors.accentWarm, fg: UI.colors.text };

  const statusBadge = (
    <StatusBadge
      text={stato}
      icon={stato === "Attivo" ? "✓" : stato === "Disattivo" ? "⏸" : "⌛"}
      bg={statusPalette.bg}
      fg={statusPalette.fg}
      accessibilityLabel={`Stato: ${stato}`}
    />
  );

  const handleToggleSelect = useCallback(() => {
    if (onToggleSelect && !selectDisabled) onToggleSelect(user.uid);
  }, [onToggleSelect, user.uid, selectDisabled]);

  return (
    <TouchableOpacity
      onPress={() => onPress(user.uid)}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`Apri dettagli utente ${title}`}
    >
      {showSelection ? (
        <Pressable
          onPress={handleToggleSelect}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: !!selected, disabled: selectDisabled }}
          accessibilityLabel={`${selected ? "Deseleziona" : "Seleziona"} utente ${title}`}
          style={[styles.selectDot, selected && styles.selectDotActive, selectDisabled && styles.selectDotDisabled]}
        />
      ) : null}

      <View style={{ flex: 1, gap: 8, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={2} ellipsizeMode="tail">
          {title}
        </Text>
        <Text style={styles.rowEmail} numberOfLines={1} ellipsizeMode="tail">
          {user.email || "—"}
        </Text>
        <View style={styles.badgeRow}>
          {roleBadge}
          {statusBadge}
        </View>
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        {right ? <View>{right}</View> : null}
      </View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────
// Schermata
// ─────────────────────────────────────────
export default function UserListScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [items, setItems] = useState<UserRow[]>([]);
  const [publicData, setPublicData] = useState<Record<string, DocumentData>>({});
  const [privateData, setPrivateData] = useState<Record<string, DocumentData>>({});
  const [publicLoaded, setPublicLoaded] = useState(false);
  const [privateLoaded, setPrivateLoaded] = useState(false);
  const [actionUid, setActionUid] = useState<string | null>(null);
  const [actionType, setActionType] = useState<QuickAction>(null);
  const [meRole, setMeRole] = useState<string | null>(null);
  const [meRoleLoaded, setMeRoleLoaded] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const searchNormalized = useMemo(() => normalize(searchText), [searchText]);

  const currentUid = auth.currentUser?.uid || null;

  // Ruolo dell'utente corrente (per debug/UX)
  useEffect(() => {
    if (!currentUid) {
      setMeRole(null);
      setMeRoleLoaded(true);
      return;
    }
    setMeRoleLoaded(false);
    const unsubMe = onSnapshot(
      doc(db, "users", currentUid),
      (ds) => {
        const r = ds.exists() ? (ds.data() as any)?.role : null;
        setMeRole(typeof r === "string" ? r : null);
        setMeRoleLoaded(true);
      },
      () => {
        setMeRole(null);
        setMeRoleLoaded(true);
      }
    );
    return () => {
      try { unsubMe(); } catch {}
    };
  }, [currentUid]);

  // Header nativo
  useEffect(() => {
    navigation.setOptions?.({
      headerShown: true,
      headerTitle: "Gestione Utenti",
      headerTitleAlign: "center",
    });
  }, [navigation]);

  // Sorgenti Firestore (pubblico + privato)
  useEffect(() => {
    setLoading(true);
    const unsubPublic = onSnapshot(
      collection(db, "users_public"),
      (snap) => {
        const next: Record<string, DocumentData> = {};
        snap.forEach((docSnap) => {
          next[docSnap.id] = docSnap.data() as DocumentData;
        });
        setPublicData(next);
        setPublicLoaded(true);
      },
      (err) => {
        console.error("[UserList] users_public error:", err);
        setPublicData({});
        setPublicLoaded(true);
      }
    );

    const unsubPrivate = onSnapshot(
      collection(db, "users"),
      (snap) => {
        const next: Record<string, DocumentData> = {};
        snap.forEach((docSnap) => {
          next[docSnap.id] = docSnap.data() as DocumentData;
        });
        setPrivateData(next);
        setPrivateLoaded(true);
      },
      (err) => {
        console.error("[UserList] users error:", err);
        setPrivateData({});
        setPrivateLoaded(true);
      }
    );

    return () => {
      try { unsubPublic(); } catch {}
      try { unsubPrivate(); } catch {}
    };
  }, []);

  // Aggiorna elementi mostrati quando cambiano i dati o il filtro
  // TODO: logica di merge pubblico/privato + filtri/ricerca potrebbe essere estratta in hook useUserListData.
  useEffect(() => {
    if (!publicLoaded || !privateLoaded) {
      setLoading(true);
      return;
    }

    const allIds = new Set([
      ...Object.keys(publicData),
      ...Object.keys(privateData),
    ]);

    const rows: UserRow[] = [];
    allIds.forEach((uid) => {
      const pub = publicData[uid] || {};
      const priv = privateData[uid] || {};

      const selfDeletedCandidates = [
        (priv as any)?.selfDeleted,
        (pub as any)?.selfDeleted,
      ];
      const displayNameCandidates = [
        (priv as any)?.displayName,
        (pub as any)?.displayName,
      ];
      const sentinelHit = displayNameCandidates.some((v) => v === SELF_DELETED_SENTINEL);
      if (sentinelHit) {
        selfDeletedCandidates.push(true);
      }
      const selfDeleted = selfDeletedCandidates.find((v) => v !== undefined);

      rows.push({
        uid,
        email: (priv as any)?.email ?? (pub as any)?.email ?? null,
        firstName: (priv as any)?.firstName ?? (pub as any)?.firstName ?? null,
        lastName: (priv as any)?.lastName ?? (pub as any)?.lastName ?? null,
        displayName: (priv as any)?.displayName ?? (pub as any)?.displayName ?? null,
        nickname: (priv as any)?.nickname ?? (pub as any)?.nickname ?? null,
        role: (priv as any)?.role ?? (pub as any)?.role ?? "member",
        approved: (priv as any)?.approved ?? (pub as any)?.approved ?? null,
        disabled: (priv as any)?.disabled ?? (pub as any)?.disabled ?? null,
        selfDeleted,
      });
    });

    rows.sort((a, b) => {
      const roleDiff = getRoleWeight(a.role) - getRoleWeight(b.role);
      if (roleDiff !== 0) return roleDiff;

      const lnA = (a.lastName || "").toLowerCase();
      const lnB = (b.lastName || "").toLowerCase();
      if (lnA !== lnB) return lnA.localeCompare(lnB);

      const fnA = (a.firstName || "").toLowerCase();
      const fnB = (b.firstName || "").toLowerCase();
      if (fnA !== fnB) return fnA.localeCompare(fnB);

      const dnA = (a.displayName || "").toLowerCase();
      const dnB = (b.displayName || "").toLowerCase();
      return dnA.localeCompare(dnB);
    });

    const addFlags = rows.map((r) => {
      const selfDeletedFlag = normalizeBooleanFlag(r.selfDeleted);
      const status = getUserStatus(r);

      return {
        ...r,
        selfDeletedFlag,
        disabledFlag: status.disabled,
        approvedFlag: status.approved,
        statusKey: status.statusKey,
        statusLabel: status.statusLabel,
      };
    });

    const withoutSelfDeleted = addFlags.filter((r) => r.selfDeletedFlag !== true);

    let filtered = withoutSelfDeleted;
    if (filter === "active") {
      filtered = withoutSelfDeleted.filter((r) => r.statusKey === "active");
    } else if (filter === "pending") {
      filtered = withoutSelfDeleted.filter((r) => r.statusKey === "pending");
    } else if (filter === "disabled") {
      filtered = withoutSelfDeleted.filter((r) => r.statusKey === "disabled");
    }

    if (searchNormalized) {
      filtered = filtered.filter((r) => {
        const haystack = [r.firstName, r.lastName, r.displayName, r.email]
          .map((value) => normalize(value))
          .join(" ");
        return haystack.includes(searchNormalized);
      });
    }

    const filteredIds = new Set(filtered.map((r) => r.uid));
    setSelected((prev) => {
      const next = new Set(Array.from(prev).filter((id) => filteredIds.has(id)));
      if (next.size === prev.size) return prev;
      return next;
    });

    setItems(filtered);
    setLoading(false);
  }, [filter, publicData, privateData, publicLoaded, privateLoaded, searchNormalized]);

  const openDetail = useCallback(
    (uid: string) => {
      navigation.navigate("UserDetail", { uid, meRole });
    },
    [navigation, meRole]
  );

  const requireOwner = useCallback(() => {
    if (meRole !== "owner") {
      Alert.alert(
        "Permessi insufficienti",
        "Solo il ruolo Owner può eseguire questa azione."
      );
      return false;
    }
    return true;
  }, [meRole]);

  // TODO: azioni approve/activate/deactivate potrebbero essere centralizzate in un piccolo service/helper per ridurre duplicazioni.
  // Azioni rapide
  const doApprove = useCallback(async (uid: string) => {
    if (!requireOwner()) return;
    try {
      setActionUid(uid);
      setActionType("approve");
      await updateDoc(doc(db, "users", uid), { approved: true });
      await mergeUsersPublic(uid, { approved: true }, "UserList");
    } catch (e: any) {
      Alert.alert("Errore", e?.message ?? "Impossibile approvare l'utente.");
    } finally {
      setActionUid(null);
      setActionType(null);
    }
  }, [requireOwner]);

  const doReject = useCallback(
    (uid: string) => {
      if (!requireOwner()) return;
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
                setActionUid(uid);
                setActionType("reject");
                await updateDoc(doc(db, "users", uid), { approved: false, disabled: true });
                await mergeUsersPublic(uid, { approved: false, disabled: true }, "UserList.reject");
              } catch (e: any) {
                Alert.alert("Errore", e?.message ?? "Impossibile rifiutare la richiesta.");
              } finally {
                setActionUid(null);
                setActionType(null);
              }
            },
          },
        ]
      );
    },
    [requireOwner]
  );

  const doActivate = useCallback(async (uid: string) => {
    if (!requireOwner()) return;
    try {
      setActionUid(uid);
      setActionType("activate");
      await updateDoc(doc(db, "users", uid), { disabled: false });
      await mergeUsersPublic(uid, { disabled: false }, "UserList");
    } catch (e: any) {
      Alert.alert("Errore", e?.message ?? "Impossibile attivare l'utente.");
    } finally {
      setActionUid(null);
      setActionType(null);
    }
  }, [requireOwner]);

  const isCurrentOwner = meRole === "owner";
  
  const toggleSelect = useCallback((uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const selectedUsersDetailed = useMemo(
    () => items.filter((item) => selected.has(item.uid)),
    [items, selected]
  );
  const selectedIds = useMemo(
    () => selectedUsersDetailed.map((user) => user.uid),
    [selectedUsersDetailed]
  );
  const selectedCount = selectedUsersDetailed.length;
  const selectedStatuses = useMemo(
    () =>
      selectedUsersDetailed.map(
        (user) => user.statusKey ?? getUserStatus(user).statusKey
      ),
    [selectedUsersDetailed]
  );
  const canApproveBulk =
    selectedCount > 0 && selectedStatuses.every((status) => status === "pending");
  const canActivateBulk =
    selectedCount > 0 && selectedStatuses.every((status) => status === "disabled");
  const canDeactivateBulk =
    selectedCount > 0 && selectedStatuses.every((status) => status === "active");
  const canDeleteBulk =
    selectedCount > 0 &&
    selectedStatuses.every((status) => status === "pending" || status === "disabled");
  const bulkButtons = useMemo(
    () =>
      [
        canApproveBulk
          ? {
              type: "approve" as BulkAction,
              label: "Approva",
              color: UI.colors.secondary,
              textColor: UI.colors.text,
            }
          : null,
        canActivateBulk
          ? {
              type: "activate" as BulkAction,
              label: "Attiva",
              color: UI.colors.primary,
              textColor: "#fff",
            }
          : null,
        canDeactivateBulk
          ? {
              type: "deactivate" as BulkAction,
              label: "Disattiva",
              color: UI.colors.danger,
              textColor: "#fff",
            }
          : null,
        canDeleteBulk
          ? {
              type: "delete" as BulkAction,
              label: "Elimina",
              color: "#111827",
              textColor: "#fff",
            }
          : null,
      ].filter(Boolean) as Array<{
        type: BulkAction;
        label: string;
        color: string;
        textColor: string;
      }>,
    [canApproveBulk, canActivateBulk, canDeactivateBulk, canDeleteBulk]
  );
  const hasBulkActions = bulkButtons.length > 0;

  const runBulk = useCallback(
    async (
      usersToProcess: UserRow[],
      executor: (user: UserRow) => Promise<void>,
      successMessage?: string
    ) => {
      setBulkLoading(true);
      try {
        for (const user of usersToProcess) {
          await executor(user);
        }
        if (successMessage) {
          Alert.alert("Completato", successMessage);
        }
      } catch (e: any) {
        Alert.alert("Errore", e?.message ?? "Operazione non riuscita.");
      } finally {
        setBulkLoading(false);
        clearSelection();
      }
    },
    [clearSelection]
  );

  const handleBulk = useCallback(
    (type: BulkAction) => {
      if (!requireOwner()) return;
      if (selectedCount === 0) return;

      const ids = selectedIds;
      const label =
        type === "approve"
          ? "Approva"
          : type === "activate"
          ? "Attiva"
          : type === "deactivate"
          ? "Disattiva"
          : "Elimina";
      const confirmBody =
        type === "delete"
          ? `Eliminare definitivamente ${ids.length} utente${ids.length === 1 ? "" : "i"} selezionati?`
          : `${label} ${ids.length} utente${ids.length === 1 ? "" : "i"}?`;
      Alert.alert(
        "Conferma",
        confirmBody,
        [
          { text: "Annulla", style: "cancel" },
          {
            text: label,
            style: type === "deactivate" || type === "delete" ? "destructive" : "default",
            onPress: () => {
              if (type === "approve") {
                runBulk(
                  selectedUsersDetailed,
                  async (user) => {
                    await updateDoc(doc(db, "users", user.uid), {
                      approved: true,
                      disabled: false,
                    });
                    await mergeUsersPublic(
                      user.uid,
                      { approved: true, disabled: false },
                      "UserListBulk.approve"
                    );
                  },
                  ids.length === 1
                    ? "Utente approvato."
                    : `${ids.length} utenti approvati.`
                );
              } else if (type === "activate") {
                runBulk(
                  selectedUsersDetailed,
                  async (user) => {
                    await updateDoc(doc(db, "users", user.uid), { disabled: false });
                    await mergeUsersPublic(
                      user.uid,
                      { disabled: false },
                      "UserListBulk.activate"
                    );
                  },
                  ids.length === 1
                    ? "Utente attivato."
                    : `${ids.length} utenti attivati.`
                );
              } else if (type === "deactivate") {
                runBulk(
                  selectedUsersDetailed,
                  async (user) => {
                    await updateDoc(doc(db, "users", user.uid), { disabled: true });
                    await mergeUsersPublic(
                      user.uid,
                      { disabled: true },
                      "UserListBulk.deactivate"
                    );
                  },
                  ids.length === 1
                    ? "Utente disattivato."
                    : `${ids.length} utenti disattivati.`
                );
              } else if (type === "delete") {
                runBulk(
                  selectedUsersDetailed,
                  async (user) => {
                    const userRef = doc(db, "users", user.uid);
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
                            throw new Error(
                              "Permessi insufficienti per eliminare uno degli utenti selezionati."
                            );
                          }
                          throw fallbackErr;
                        }
                      } else if (fireErr?.code === "not-found") {
                        removed = true;
                      } else {
                        throw fireErr;
                      }
                    }

                    const publicRemoved = await deleteUsersPublic(
                      user.uid,
                      "UserListBulk.delete"
                    );
                    if (!publicRemoved) {
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
                        "UserListBulk.deleteFallback"
                      );
                    }

                    if (!removed) {
                      throw new Error(
                        "Operazione completata solo parzialmente: impossibile eliminare un profilo."
                      );
                    }
                  },
                  ids.length === 1
                    ? "Utente eliminato."
                    : `${ids.length} utenti eliminati.`
                );
              }
            },
          },
        ]
      );
    },
    [requireOwner, runBulk, selectedCount, selectedIds, selectedUsersDetailed]
  );

  const renderItem = useCallback(
    ({ item }: { item: UserRow }) => {
      // decide azione rapida e label
      let actionNode: React.ReactNode = null;

      const isSelf = currentUid === item.uid;
      const isOwner = item.role === "owner";

      const selfDeletedFlag =
        item.selfDeletedFlag ?? normalizeBooleanFlag(item.selfDeleted);
      const statusKey = item.statusKey ?? getUserStatus(item).statusKey;

      const isSelfDeleted = selfDeletedFlag === true;
      const isPending = !isSelfDeleted && statusKey === "pending";
      const isActive = !isSelfDeleted && statusKey === "active";
      const isDisabled = !isSelfDeleted && statusKey === "disabled";

      const busy = actionUid === item.uid && !!actionType;

      if (isCurrentOwner && !isSelf && !isOwner && !isSelfDeleted) {
        if (isPending) {
          actionNode = (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <SmallBtn
                title={busy && actionType === "approve" ? "…" : "Approva"}
                onPress={() => doApprove(item.uid)}
                disabled={busy}
              />
              <SmallBtn
                title={busy && actionType === "reject" ? "…" : "Rifiuta"}
                onPress={() => doReject(item.uid)}
                disabled={busy}
                kind="warning"
              />
            </View>
          );
        } else if (isDisabled) {
          actionNode = (
            <SmallBtn
              title={busy && actionType === "activate" ? "…" : "Attiva"}
              onPress={() => doActivate(item.uid)}
              disabled={busy}
            />
          );
        }
      }

      const selectionAllowed = isCurrentOwner && !isSelf && !isOwner && !isSelfDeleted;
      const isSelected = selected.has(item.uid);

      return (
        <Row
          user={item}
          onPress={openDetail}
          right={actionNode}
          selected={isSelected}
          onToggleSelect={toggleSelect}
          showSelection={isCurrentOwner}
          selectDisabled={!selectionAllowed}
        />
      );
    },
    [
      openDetail,
      currentUid,
      actionUid,
      actionType,
      doApprove,
      doReject,
      doActivate,
      isCurrentOwner,
      selected,
      toggleSelect,
    ]
  );

  // Tab filtro
  const FilterTab = () => {
    const Tab = ({
      k,
      label,
    }: {
      k: FilterKey;
      label: string;
    }) => {
      const active = filter === k;
      const isAll = k === "all";
      return (
        <TouchableOpacity
          onPress={() => setFilter(k)}
          style={[
            styles.tabBtn,
            isAll ? styles.tabBtnWide : styles.tabBtnCompact,
            { backgroundColor: active ? UI.colors.primary : UI.colors.card },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.tabBtnText,
              { color: active ? "#fff" : UI.colors.text },
            ]}
          >
            {label}
          </Text>
        </TouchableOpacity>
      );
    };

    return (
      <View style={styles.tabContainer}>
        <View style={styles.tabRow}>
          <Tab k="all" label="Tutti" />
        </View>
        <View style={[styles.tabRow, styles.tabRowMulti]}>
          <Tab k="active" label="Attivi" />
          <Tab k="disabled" label="Disattivi" />
          <Tab k="pending" label="In attesa" />
        </View>
      </View>
    );
  };

  const meRoleLabel =
    meRole === "owner"
      ? "Owner"
      : meRole === "admin"
      ? "Admin"
      : meRole === "member"
      ? "Member"
      : "(sconosciuto)";

  return (
    <Screen useNativeHeader={true} scroll={false}>
      <View style={{ padding: UI.spacing.lg, flex: 1, gap: UI.spacing.md }}>
        {meRoleLoaded && isCurrentOwner && <FilterTab />}
        <Text style={{ color: UI.colors.muted }}>
          Ruolo corrente: {meRoleLabel}
        </Text>

        {isCurrentOwner && (
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color="#6b7280" />
            <TextInput
              style={styles.searchInput}
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Cerca per nome o email"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchText.trim().length > 0 ? (
              <TouchableOpacity onPress={() => setSearchText("")} accessibilityLabel="Pulisci ricerca">
                <Ionicons name="close-circle" size={18} color="#9ca3af" />
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {selectedCount > 0 && (
          <View style={styles.bulkRow}>
            <Text style={styles.bulkLabel}>Selezionati: {selectedCount}</Text>
            <View style={styles.bulkBtnRow}>
              {bulkButtons.map((btn) => (
                <TouchableOpacity
                  key={btn.type}
                  style={[styles.bulkBtn, { backgroundColor: btn.color }]}
                  onPress={() => handleBulk(btn.type)}
                  disabled={bulkLoading}
                  accessibilityRole="button"
                  accessibilityLabel={`${btn.label} utenti selezionati`}
                >
                  <Text style={[styles.bulkBtnText, { color: btn.textColor }]}>
                    {bulkLoading ? "…" : btn.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={clearSelection} disabled={bulkLoading}>
                <Text style={styles.clearSelectionText}>Annulla</Text>
              </TouchableOpacity>
            </View>
            {!hasBulkActions && (
              <Text style={styles.bulkHelp}>
                Nessuna azione disponibile per la selezione corrente.
              </Text>
            )}
          </View>
        )}

        {!meRoleLoaded ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={{ marginTop: 8 }}>Verifico permessi…</Text>
          </View>
        ) : !isCurrentOwner ? (
          <View style={styles.center}>
            <Text style={{ textAlign: "center", color: "#666" }}>
              Solo il ruolo Owner può accedere alla gestione utenti.
            </Text>
          </View>
        ) : loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={{ marginTop: 8 }}>Carico utenti…</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.center}>
            <Text style={{ color: "#666" }}>Nessun utente trovato per questo filtro.</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.uid}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={{ height: UI.spacing.sm }} />}
            contentContainerStyle={{ paddingTop: UI.spacing.sm, paddingBottom: UI.spacing.lg }}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  row: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: UI.spacing.md,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
    gap: UI.spacing.md,
  },
  selectDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#cbd5f5",
    marginRight: UI.spacing.sm,
    backgroundColor: "#fff",
  },
  selectDotActive: {
    borderColor: ACTION_GREEN,
    backgroundColor: ACTION_GREEN,
  },
  selectDotDisabled: {
    opacity: 0.4,
  },
  rowTitle: { fontSize: 16, fontWeight: "800", color: UI.colors.text },
  rowSub: { color: UI.colors.muted, marginTop: 2 },
  rowEmail: {
    color: UI.colors.muted,
    marginTop: 2,
    fontSize: 13,
  },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },

  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  smallBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  tabContainer: {
    gap: UI.spacing.xs,
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: UI.spacing.xs,
  },
  tabRowMulti: {
    flexWrap: "nowrap",
    justifyContent: "space-between",
  },
  tabBtn: {
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: UI.spacing.sm,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  tabBtnWide: {
    flexBasis: "100%",
  },
  tabBtnCompact: {
    flexBasis: "32%",
    maxWidth: "32%",
    flexGrow: 0,
    flexShrink: 0,
  },
  tabBtnText: {
    fontWeight: "800",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: UI.spacing.sm,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: UI.radius.lg,
    paddingHorizontal: UI.spacing.sm,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: UI.colors.text,
  },
  bulkRow: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    borderRadius: UI.radius.lg,
    padding: UI.spacing.sm,
    gap: UI.spacing.xs,
  },
  bulkLabel: { fontWeight: "700", color: UI.colors.text },
  bulkBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: UI.spacing.sm,
    flexWrap: "wrap",
  },
  bulkBtn: {
    paddingHorizontal: UI.spacing.md,
    paddingVertical: 8,
    borderRadius: UI.radius.md,
  },
  bulkBtnText: { color: "#fff", fontWeight: "700" },
  clearSelectionText: { color: ACTION_GREEN, fontWeight: "700" },
  bulkHelp: {
    marginTop: UI.spacing.xs,
    color: UI.colors.muted,
    fontSize: 12,
  },
});
