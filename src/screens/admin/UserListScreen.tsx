// src/screens/admin/UserListScreen.tsx
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Screen } from "../../components/Screen";
import { auth, db } from "../../firebase";
import { collection, onSnapshot, DocumentData, updateDoc, doc } from "firebase/firestore";
import { mergeUsersPublic } from "../../utils/usersPublicSync";

// Tema locale (evita dipendenza da UI globale)
const THEME = {
  colors: { primary: "#1D4ED8", text: "#0f172a" },
} as const;

type BooleanFirestoreValue =
  | boolean
  | string
  | number
  | null
  | undefined
  | {
      valueOf?: () => any;
      booleanValue?: boolean;
      stringValue?: string;
      integerValue?: string;
      doubleValue?: number;
    };

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
  approvedFlag?: boolean | null;
  disabledFlag?: boolean | null;
};

type FilterKey = "all" | "active" | "disabled" | "pending";

type QuickAction = "approve" | "activate" | "deactivate" | null;

function normalizeBooleanFlag(value: BooleanFirestoreValue): boolean | null {
  if (value === null || value === undefined) return null;
  let v: any = value;

  if (typeof v === "object") {
    if (typeof v.valueOf === "function" && v.valueOf() !== v) {
      v = v.valueOf();
    } else {
      const candidate =
        (v as any).booleanValue ??
        (v as any).stringValue ??
        (v as any).integerValue ??
        (v as any).doubleValue ??
        (typeof (v as any).valueOf === "function" ? (v as any).valueOf() : undefined);
      if (candidate !== undefined && candidate !== v) {
        v = candidate;
      }
    }
  }

  if (typeof v === "string") {
    const lower = v.trim().toLowerCase();
    if (lower === "true" || lower === "1" || lower === "yes") return true;
    if (lower === "false" || lower === "0" || lower === "no") return false;
    return null;
  }
  if (typeof v === "number") return v === 1;
  if (typeof v === "boolean") return v;
  return null;
}


// ─────────────────────────────────────────
// UI Helpers
// ─────────────────────────────────────────
function Badge({ color, text }: { color: string; text: string }) {
  return (
    <View
      style={{
        backgroundColor: color,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>{text}</Text>
    </View>
  );
}

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
  const bg = kind === "warning" ? "#B91C1C" : THEME.colors.primary;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[
        styles.smallBtn,
        { backgroundColor: bg, opacity: disabled ? 0.6 : 1 },
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
}: {
  user: UserRow;
  onPress: (uid: string) => void;
  right?: React.ReactNode;
}) {
  const cognome = (user.lastName || "").trim();
  const nome = (user.firstName || "").trim();
  const ruolo = user.role === "admin" || user.role === "owner" ? "Admin" : "Member";

  const approvedFlag = user.approvedFlag ?? normalizeBooleanFlag(user.approved);
  const disabledFlag = user.disabledFlag ?? normalizeBooleanFlag(user.disabled);

  const stato =
    disabledFlag === true
      ? ("Disattivo" as const)
      : approvedFlag === true
      ? ("Attivo" as const)
      : ("In attesa" as const);

  const badgeColor =
    stato === "Attivo" ? "#16A34A" : stato === "Disattivo" ? "#6B7280" : "#D97706";

  return (
    <TouchableOpacity
      onPress={() => onPress(user.uid)}
      style={styles.row}
      accessibilityRole="button"
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>
          {cognome || nome
            ? `${cognome}${cognome && nome ? ", " : ""}${nome}`
            : user.displayName || user.email || "Utente"}
        </Text>
        <Text style={styles.rowSub}>
          Ruolo: <Text style={{ fontWeight: "700" }}>{ruolo}</Text>
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <Badge color={badgeColor} text={stato} />
        {right}
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

  // Ruolo dell'utente corrente (per debug/UX)
  const [meRole, setMeRole] = useState<string | null>(null);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setMeRole(null); return; }
    const unsubMe = onSnapshot(doc(db, "users", uid), (ds) => {
      const r = ds.exists() ? (ds.data() as any)?.role : null;
      setMeRole(typeof r === "string" ? r : null);
    });
    return () => unsubMe();
  }, []);

  const currentUid = auth.currentUser?.uid || null;

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
      });
    });

    rows.sort((a, b) => {
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

    const addFlags = rows.map((r) => ({
      ...r,
      approvedFlag: normalizeBooleanFlag(r.approved),
      disabledFlag: normalizeBooleanFlag(r.disabled),
    }));

    let filtered = addFlags;
    if (filter === "active") {
      filtered = addFlags.filter(
        (r) => r.approvedFlag !== false && r.disabledFlag !== true
      );
    } else if (filter === "pending") {
      filtered = addFlags.filter(
        (r) => r.approvedFlag === false && r.disabledFlag !== true
      );
    } else if (filter === "disabled") {
      filtered = addFlags.filter((r) => r.disabledFlag === true);
    }

    setItems(filtered);
    setLoading(false);
  }, [filter, publicData, privateData, publicLoaded, privateLoaded]);

  const openDetail = useCallback(
    (uid: string) => {
      navigation.navigate("UserDetail", { uid });
    },
    [navigation]
  );

  // Azioni rapide
  const doApprove = useCallback(async (uid: string) => {
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
  }, []);

  const doActivate = useCallback(async (uid: string) => {
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
  }, []);

  const doDeactivate = useCallback((uid: string) => {
    Alert.alert("Conferma", "Disattivare questo utente?", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Disattiva",
        style: "destructive",
        onPress: async () => {
          try {
            setActionUid(uid);
            setActionType("deactivate");
            await updateDoc(doc(db, "users", uid), { disabled: true });
            await mergeUsersPublic(uid, { disabled: true }, "UserList");
          } catch (e: any) {
            Alert.alert("Errore", e?.message ?? "Impossibile disattivare l'utente.");
          } finally {
            setActionUid(null);
            setActionType(null);
          }
        },
      },
    ]);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: UserRow }) => {
      // decide azione rapida e label
      let actionNode: React.ReactNode = null;

      const isSelf = currentUid === item.uid;
      const isOwner = item.role === "owner";

      const approvedFlag = item.approvedFlag ?? normalizeBooleanFlag(item.approved);
      const disabledFlag = item.disabledFlag ?? normalizeBooleanFlag(item.disabled);

      const isPending = approvedFlag !== true && disabledFlag !== true;
      const isActive = approvedFlag === true && disabledFlag !== true;
      const isDisabled = disabledFlag === true;

      const busy = actionUid === item.uid && !!actionType;

      if (!isSelf && !isOwner) {
        if (isPending) {
          actionNode = (
            <SmallBtn
              title={busy && actionType === "approve" ? "…" : "Approva"}
              onPress={() => doApprove(item.uid)}
              disabled={busy}
            />
          );
        } else if (isActive) {
          actionNode = (
            <SmallBtn
              title={busy && actionType === "deactivate" ? "…" : "Disattiva"}
              onPress={() => doDeactivate(item.uid)}
              disabled={busy}
              kind="warning"
            />
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

      return <Row user={item} onPress={openDetail} right={actionNode} />;
    },
    [openDetail, currentUid, actionUid, actionType, doApprove, doActivate, doDeactivate]
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
      return (
        <TouchableOpacity
          onPress={() => setFilter(k)}
          style={[
            styles.tabBtn,
            { backgroundColor: active ? THEME.colors.primary : "#fff" },
          ]}
        >
          <Text
            style={[
              styles.tabBtnText,
              { color: active ? "#fff" : THEME.colors.text },
            ]}
          >
            {label}
          </Text>
        </TouchableOpacity>
      );
    };

    return (
      <View style={styles.tabWrap}>
        <Tab k="all" label="Tutti" />
        <Tab k="active" label="Attivi" />
        <Tab k="disabled" label="Disattivi" />
        <Tab k="pending" label="In attesa" />
      </View>
    );
  };

  return (
    <Screen useNativeHeader={true} scroll={false}>
      <View style={{ padding: 16, flex: 1 }}>
        <FilterTab />
        <Text style={{ color: "#64748b", marginTop: 6 }}>
          Ruolo corrente: {meRole || "(sconosciuto)"}
        </Text>

        {loading ? (
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
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            contentContainerStyle={{ paddingTop: 10, paddingBottom: 20 }}
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
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#eee",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  rowSub: { color: "#374151", marginTop: 2 },

  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  smallBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  tabWrap: {
    flexDirection: "row",
    gap: 8,
  },
  tabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  tabBtnText: {
    fontWeight: "800",
  },
});
