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
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Screen, UI } from "../../components/Screen";
import { ScreenHeader } from "../../components/ScreenHeader"; // Unified Header
import { auth, db } from "../../firebase";
import {
  collection,
  onSnapshot,
  DocumentData,
  updateDoc,
  doc,
  deleteDoc,
} from "firebase/firestore";
import { mergeUsersPublic, deleteUsersPublic } from "../../utils/usersPublicSync";
import { getUserStatus, normalizeBooleanFlag } from "../../utils/userStatus";
import { Ionicons } from "@expo/vector-icons";

const SELF_DELETED_SENTINEL = "__self_deleted__";
// Removed local ACTION_GREEN constant, using UI.colors.action

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
  const isPrimary = kind === "primary";
  const bg = isPrimary ? UI.colors.action : "#fee2e2";
  const text = isPrimary ? "#ffffff" : "#991b1b";

  const finalBg = kind === "warning" ? "#ef4444" : bg;
  const finalText = kind === "warning" ? "#ffffff" : text;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      hitSlop={8}
      style={[
        styles.smallBtn,
        { backgroundColor: finalBg, opacity: disabled ? 0.6 : 1 },
      ]}
    >
      <Text style={[styles.smallBtnText, { color: finalText }]}>{title}</Text>
    </TouchableOpacity>
  );
}

function UserAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{initials || "?"}</Text>
    </View>
  );
}

function Row({
  user,
  onPress,
  actions,
  selected,
  onToggleSelect,
  showSelection,
  selectDisabled,
}: {
  user: UserRow;
  onPress: (uid: string) => void;
  actions?: React.ReactNode;
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

  const displayName = isSelfDeleted
    ? "Account eliminato"
    : cognome || nome
      ? `${cognome} ${nome}`
      : user.displayName || user.email || "Utente";

  const handleToggleSelect = useCallback(() => {
    if (onToggleSelect && !selectDisabled) onToggleSelect(user.uid);
  }, [onToggleSelect, user.uid, selectDisabled]);

  return (
    <TouchableOpacity
      onPress={() => onPress(user.uid)}
      style={[styles.row, selected && styles.rowSelected]}
      activeOpacity={0.7}
      accessibilityRole="button"
    >
      <View style={styles.rowMain}>
        <View style={styles.rowTop}>
          {showSelection && (
            <Pressable
              onPress={handleToggleSelect}
              hitSlop={12}
              style={[
                styles.selectDot,
                selected && styles.selectDotActive,
                selectDisabled && styles.selectDotDisabled,
              ]}
            >
              {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
            </Pressable>
          )}

          <UserAvatar name={displayName} />

          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{displayName}</Text>

            <Text style={styles.rowEmail} numberOfLines={1}>
              {user.email || "Nessuna email"}
            </Text>

            <View style={styles.badgeRow}>
              <View style={[styles.miniBadge,
              ruolo === "Owner" ? styles.bgBlack :
                ruolo === "Admin" ? styles.bgSlate200 : styles.bgSlate50
              ]}>
                <Text style={[styles.miniBadgeText,
                ruolo === "Owner" ? styles.textWhite :
                  ruolo === "Admin" ? styles.textSlate800 : styles.textSlate500
                ]}>{ruolo}</Text>
              </View>
              <View style={[
                styles.miniBadge,
                stato === "Attivo" ? styles.bgGreen :
                  stato === "Disattivo" ? styles.bgMuted :
                    styles.bgOrange
              ]}>
                <Text style={[styles.miniBadgeText,
                stato === "Attivo" ? styles.textGreen :
                  stato === "Disattivo" ? styles.textSlate600 :
                    styles.textOrange
                ]}>
                  {stato}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {actions && (
          <View style={styles.rowFooter}>
            {actions}
          </View>
        )}
      </View>
    </TouchableOpacity >
  );
}

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

  useEffect(() => {
    if (!currentUid) {
      setMeRole(null);
      setMeRoleLoaded(true);
      return;
    }
    setMeRoleLoaded(false);
    const unsubMe = onSnapshot(doc(db, "users", currentUid),
      (ds) => {
        const r = ds.exists() ? (ds.data() as any)?.role : null;
        setMeRole(typeof r === "string" ? r : null);
        setMeRoleLoaded(true);
      },
      () => { setMeRole(null); setMeRoleLoaded(true); }
    );
    return () => { try { unsubMe(); } catch { } };
  }, [currentUid]);

  React.useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    setLoading(true);
    const unsubPublic = onSnapshot(collection(db, "users_public"),
      (snap) => {
        const next: Record<string, DocumentData> = {};
        snap.forEach((docSnap) => next[docSnap.id] = docSnap.data() as DocumentData);
        setPublicData(next);
        setPublicLoaded(true);
      },
      (err) => { console.error(err); setPublicData({}); setPublicLoaded(true); }
    );
    const unsubPrivate = onSnapshot(collection(db, "users"),
      (snap) => {
        const next: Record<string, DocumentData> = {};
        snap.forEach((docSnap) => next[docSnap.id] = docSnap.data() as DocumentData);
        setPrivateData(next);
        setPrivateLoaded(true);
      },
      (err) => { console.error(err); setPrivateData({}); setPrivateLoaded(true); }
    );
    return () => { try { unsubPublic(); } catch { } try { unsubPrivate(); } catch { } };
  }, []);

  useEffect(() => {
    if (!publicLoaded || !privateLoaded) { setLoading(true); return; }

    const allIds = new Set([...Object.keys(publicData), ...Object.keys(privateData)]);
    const rows: UserRow[] = [];

    allIds.forEach((uid) => {
      const pub = publicData[uid] || {};
      const priv = privateData[uid] || {};

      const selfDeletedCandidates = [(priv as any)?.selfDeleted, (pub as any)?.selfDeleted];
      const displayNameCandidates = [(priv as any)?.displayName, (pub as any)?.displayName];
      const sentinelHit = displayNameCandidates.some((v) => v === SELF_DELETED_SENTINEL);
      if (sentinelHit) selfDeletedCandidates.push(true);
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
      return 0;
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

    let filtered = addFlags.filter((r) => r.selfDeletedFlag !== true);

    if (filter === "active") filtered = filtered.filter((r) => r.statusKey === "active");
    else if (filter === "pending") filtered = filtered.filter((r) => r.statusKey === "pending");
    else if (filter === "disabled") filtered = filtered.filter((r) => r.statusKey === "disabled");

    if (searchNormalized) {
      filtered = filtered.filter((r) => {
        const haystack = [r.firstName, r.lastName, r.displayName, r.email]
          .map((v) => normalize(v)).join(" ");
        return haystack.includes(searchNormalized);
      });
    }

    const filteredIds = new Set(filtered.map((r) => r.uid));
    setSelected((prev) => {
      const next = new Set(Array.from(prev).filter((id) => filteredIds.has(id)));
      return next.size === prev.size ? prev : next;
    });

    setItems(filtered);
    setLoading(false);
  }, [filter, publicData, privateData, publicLoaded, privateLoaded, searchNormalized]);

  const openDetail = useCallback((uid: string) => {
    navigation.navigate("UserDetail", { uid, meRole });
  }, [navigation, meRole]);

  const requireOwner = useCallback(() => {
    if (meRole !== "owner") {
      Alert.alert("Permessi insufficienti", "Solo il ruolo Owner può eseguire questa azione.");
      return false;
    }
    return true;
  }, [meRole]);

  const doApprove = useCallback(async (uid: string) => {
    if (!requireOwner()) return;
    try {
      setActionUid(uid); setActionType("approve");
      await updateDoc(doc(db, "users", uid), { approved: true });
      await mergeUsersPublic(uid, { approved: true }, "UserList");
    } catch (e: any) { Alert.alert("Errore", e?.message); }
    finally { setActionUid(null); setActionType(null); }
  }, [requireOwner]);

  const doReject = useCallback((uid: string) => {
    if (!requireOwner()) return;
    Alert.alert("Conferma", "Rifiutare richiesta?", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Rifiuta", style: "destructive", onPress: async () => {
          try {
            setActionUid(uid); setActionType("reject");
            await updateDoc(doc(db, "users", uid), { approved: false, disabled: true });
            await mergeUsersPublic(uid, { approved: false, disabled: true }, "UserList.reject");
          } catch (e: any) { Alert.alert("Errore", e?.message); }
          finally { setActionUid(null); setActionType(null); }
        }
      }
    ]);
  }, [requireOwner]);

  const doActivate = useCallback(async (uid: string) => {
    if (!requireOwner()) return;
    try {
      setActionUid(uid); setActionType("activate");
      await updateDoc(doc(db, "users", uid), { disabled: false });
      await mergeUsersPublic(uid, { disabled: false }, "UserList");
    } catch (e: any) { Alert.alert("Errore", e?.message); }
    finally { setActionUid(null); setActionType(null); }
  }, [requireOwner]);

  const toggleSelect = useCallback((uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const isCurrentOwner = meRole === "owner";

  const selectedUsersDetailed = useMemo(() => items.filter((item) => selected.has(item.uid)), [items, selected]);
  const selectedCount = selectedUsersDetailed.length;

  const bulkButtons = useMemo(() => {
    const statuses = selectedUsersDetailed.map((u) => u.statusKey ?? getUserStatus(u).statusKey);
    const canApprove = selectedCount > 0 && statuses.every((s) => s === "pending");
    const canActivate = selectedCount > 0 && statuses.every((s) => s === "disabled");
    const canDeactivate = selectedCount > 0 && statuses.every((s) => s === "active");
    const canDelete = selectedCount > 0 && statuses.every((s) => s === "pending" || s === "disabled");

    return [
      canApprove ? { type: "approve", label: "Approva", color: UI.colors.secondary, textColor: UI.colors.text } : null,
      canActivate ? { type: "activate", label: "Attiva", color: UI.colors.primary, textColor: "#fff" } : null,
      canDeactivate ? { type: "deactivate", label: "Disattiva", color: UI.colors.danger, textColor: "#fff" } : null,
      canDelete ? { type: "delete", label: "Elimina", color: "#111827", textColor: "#fff" } : null,
    ].filter(Boolean) as any[];
  }, [selectedUsersDetailed, selectedCount]);

  const runBulk = useCallback(async (users: UserRow[], exec: any, msg: string) => {
    setBulkLoading(true);
    try { for (const u of users) await exec(u); if (msg) Alert.alert("Fatto", msg); }
    catch (e: any) { Alert.alert("Errore", e?.message); }
    finally { setBulkLoading(false); clearSelection(); }
  }, [clearSelection]);

  const handleBulk = useCallback((type: BulkAction) => {
    if (!requireOwner() || selectedCount === 0) return;
    const label = type === "approve" ? "Approva" : type === "activate" ? "Attiva" : type === "deactivate" ? "Disattiva" : "Elimina";
    Alert.alert("Conferma", `${label} ${selectedCount} utenti?`, [
      { text: "Annulla", style: "cancel" },
      {
        text: label, style: "destructive", onPress: () => {
          if (type === "approve") runBulk(selectedUsersDetailed, async (u: UserRow) => {
            await updateDoc(doc(db, "users", u.uid), { approved: true, disabled: false });
            await mergeUsersPublic(u.uid, { approved: true, disabled: false }, "Bulk");
          }, "Utenti approvati");
          else if (type === "activate") runBulk(selectedUsersDetailed, async (u: UserRow) => {
            await updateDoc(doc(db, "users", u.uid), { disabled: false });
            await mergeUsersPublic(u.uid, { disabled: false }, "Bulk");
          }, "Utenti attivati");
          else if (type === "deactivate") runBulk(selectedUsersDetailed, async (u: UserRow) => {
            await updateDoc(doc(db, "users", u.uid), { disabled: true });
            await mergeUsersPublic(u.uid, { disabled: true }, "Bulk");
          }, "Utenti disattivati");
          else if (type === "delete") runBulk(selectedUsersDetailed, async (u: UserRow) => {
            const userRef = doc(db, "users", u.uid);
            await deleteDoc(userRef);
            await deleteUsersPublic(u.uid, "Bulk");
          }, "Utenti eliminati");
        }
      }
    ]);
  }, [requireOwner, selectedCount, runBulk, selectedUsersDetailed]);

  const renderItem = useCallback(({ item }: { item: UserRow }) => {
    const isSelf = currentUid === item.uid;
    const isOwner = item.role === "owner";
    const statusKey = item.statusKey ?? getUserStatus(item).statusKey;
    const isPending = statusKey === "pending";
    const isDisabled = statusKey === "disabled";
    const busy = actionUid === item.uid && !!actionType;

    let actions: React.ReactNode = null;
    if (isCurrentOwner && !isSelf && !isOwner) {
      if (isPending) actions = (
        <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
          <View style={{ flex: 1 }}><SmallBtn title={busy ? "…" : "Approva"} onPress={() => doApprove(item.uid)} disabled={busy} /></View>
          <View style={{ flex: 1 }}><SmallBtn title="Rifiuta" onPress={() => doReject(item.uid)} kind="warning" disabled={busy} /></View>
        </View>
      );
      else if (isDisabled) actions = (
        <View style={{ alignSelf: 'flex-start' }}>
          <SmallBtn title="Attiva" onPress={() => doActivate(item.uid)} disabled={busy} />
        </View>
      );
    }

    return (
      <Row
        user={item}
        onPress={openDetail}
        actions={actions}
        selected={selected.has(item.uid)}
        onToggleSelect={toggleSelect}
        showSelection={isCurrentOwner}
        selectDisabled={!(!isSelf && !isOwner)}
      />
    );
  }, [openDetail, currentUid, actionUid, actionType, doApprove, doReject, doActivate, isCurrentOwner, selected, toggleSelect]);

  if (!meRoleLoaded || loading) return <Screen useNativeHeader={true}><View style={styles.center}><ActivityIndicator /></View></Screen>;

  return (
    <Screen useNativeHeader={true} scroll={false} backgroundColor="#FDFCF8">
      {/* 
        Unified Header
        No need to set topPadding as it defaults to standard height
      */}
      <ScreenHeader
        title="GESTIONE UTENTI"
        subtitle="Amministrazione Team"
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined}
      >
        <FlatList
          data={items}
          keyExtractor={(item) => item.uid}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 16, paddingTop: 8 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListHeaderComponent={
            <View style={styles.headerBlock}>

              {/* Search Bar - Fixed Flex Layout */}
              <View style={styles.searchRow}>
                <Ionicons name="search" size={18} color="#94a3b8" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Cerca per nome o email"
                  placeholderTextColor="#9ca3af"
                  value={searchText}
                  onChangeText={setSearchText}
                  autoCapitalize="none"
                />
                {searchText.length > 0 && (
                  <Pressable onPress={() => { setSearchText(""); Keyboard.dismiss(); }} style={styles.searchClear} hitSlop={10}>
                    <Ionicons name="close-circle" size={18} color="#94a3b8" />
                  </Pressable>
                )}
              </View>

              {/* Filters as Rectangular Tabs */}
              {isCurrentOwner && (
                <View style={styles.filterSection}>
                  <View style={styles.segmented}>
                    {(["active", "disabled", "pending"] as const).map((k) => {
                      const isActive = filter === k;
                      const label = k === "active" ? "Attivi" : k === "disabled" ? "Disattivi" : "In attesa";
                      return (
                        <Pressable
                          key={k}
                          onPress={() => setFilter(k)}
                          style={[
                            styles.segmentedTab,
                            isActive && styles.segmentedTabActive,
                          ]}
                        >
                          <Text style={[styles.segmentedText, isActive && styles.segmentedTextActive]}>
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Results Meta */}
                  <View style={styles.resultsMeta}>
                    {filter !== "all" ? (
                      <TouchableOpacity onPress={() => setFilter("all")} hitSlop={10}>
                        <Text style={styles.resetLink}>Mostra tutti</Text>
                      </TouchableOpacity>
                    ) : (
                      <View />
                    )}
                    <Text style={styles.resultsCount}>
                      {items.length} {items.length === 1 ? "utente trovato" : "utenti trovati"}
                    </Text>
                  </View>
                </View>
              )}

              {/* Bulk Actions Bar */}
              {selectedCount > 0 && (
                <View style={styles.bulkRow}>
                  <Text style={styles.bulkLabel}>Selezionati: {selectedCount}</Text>
                  <View style={styles.bulkBtnRow}>
                    {bulkButtons.map((btn) => (
                      <TouchableOpacity
                        key={btn.type}
                        style={[styles.bulkBtn, { backgroundColor: btn.color }]}
                        onPress={() => handleBulk(btn.type as any)}
                        disabled={bulkLoading}
                      >
                        <Text style={[styles.bulkBtnText, { color: btn.textColor }]}>{btn.label}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity onPress={clearSelection} disabled={bulkLoading}>
                      <Text style={styles.clearSelectionText}>Annulla</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={{ fontWeight: "600", color: UI.colors.muted }}>Nessun utente trovato.</Text>
            </View>
          }
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  // Header styles removed as we use ScreenHeader

  headerBlock: { marginBottom: 16, gap: 16 },

  // Search
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#0f172a",
    padding: 0,
    height: "100%",
  },
  searchClear: {
    padding: 4,
  },

  // Segmented Tabs (Profile standard)
  filterSection: { gap: 12 },
  segmented: {
    flexDirection: "row",
    backgroundColor: UI.colors.card,
    borderRadius: 999,
    padding: 4,
  },
  segmentedTab: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
  },
  segmentedTabActive: {
    backgroundColor: UI.colors.action,
  },
  segmentedText: { fontSize: 13, fontWeight: "600", color: UI.colors.muted },
  segmentedTextActive: { color: "#fff" },

  // Results Meta
  resultsMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  resultsCount: { fontSize: 13, fontWeight: "600", color: "#64748B" },
  resetLink: { fontSize: 13, fontWeight: "600", color: UI.colors.action },

  // User Card refined
  row: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    marginBottom: 0,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: "rgba(241, 245, 249, 1)",
  },
  rowSelected: {
    borderColor: UI.colors.action,
    backgroundColor: "#f0fdf4",
  },
  rowMain: {
    gap: 12,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowFooter: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 12,
  },

  // Avatar
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#64748b",
  },

  // Inner Typo
  rowTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  rowEmail: { fontSize: 13, color: "#64748b", marginTop: 2 },

  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  miniBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "transparent",
  },
  miniBadgeText: { fontSize: 12, fontWeight: "700" },

  // Colors for badges
  bgBlack: { backgroundColor: "#1c1917" },
  bgGray: { backgroundColor: "#f3f4f6" }, // Keep for legacy or fallback

  // Role Specific
  bgSlate50: { backgroundColor: "#f8fafc" },
  bgSlate200: { backgroundColor: "#e2e8f0" },

  // Status Specific
  bgGreen: { backgroundColor: "#dcfce7" },
  bgOrange: { backgroundColor: "#ffedd5" },
  bgRed: { backgroundColor: "#fee2e2" },
  bgMuted: { backgroundColor: "#f1f5f9" },

  textWhite: { color: "#ffffff" },
  textGreen: { color: "#166534" },
  textOrange: { color: "#c2410c" }, // Orange-700
  textSlate800: { color: "#1e293b" },
  textSlate600: { color: "#475569" },
  textSlate500: { color: "#64748b" },

  // Selection
  selectDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#cbd5e1",
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectDotActive: {
    backgroundColor: UI.colors.action,
    borderColor: UI.colors.action,
  },
  selectDotDisabled: { opacity: 0.5 },

  // Bulk
  bulkRow: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
  },
  bulkLabel: { fontWeight: "700", color: "#0f172a" },
  bulkBtnRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: 'center' },
  bulkBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  bulkBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  clearSelectionText: { color: "#64748b", fontWeight: "600", fontSize: 13, marginLeft: 4 },

  emptyBox: { marginTop: 40, alignItems: "center", paddingHorizontal: 32 },

  // Legacy button used inside card
  smallBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  smallBtnText: { fontSize: 12, fontWeight: "700" },
});
