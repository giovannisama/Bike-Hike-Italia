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
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  DocumentData,
  updateDoc,
  doc,
} from "firebase/firestore";

// Tema locale (evita dipendenza da UI globale)
const THEME = {
  colors: { primary: "#1D4ED8", text: "#0f172a" },
} as const;

type UserRow = {
  uid: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  nickname?: string | null;
  role?: "member" | "admin" | "owner";
  approved?: boolean;
  disabled?: boolean;
};

type FilterKey = "active" | "disabled" | "pending";

type QuickAction = "approve" | "activate" | "deactivate" | null;


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
  const ruolo =
    user.role === "admin" || user.role === "owner" ? "Admin" : "Member";

  const stato = user.disabled
    ? ("Disattivo" as const)
    : user.approved
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
  const [filter, setFilter] = useState<FilterKey>("active");
  const [items, setItems] = useState<UserRow[]>([]);
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

  // Sorgente Firestore con filtro (realtime)
  useEffect(() => {
    setLoading(true);

    const ref = collection(db, "users");

    // Costruiamo la query base solo con ordinamenti; i filtri che dipendono da assenza di campo li faremo client-side
    let q = query(ref, orderBy("lastName"), orderBy("firstName"));

    if (filter === "disabled") {
      // Qui il campo deve esistere ed essere true → possiamo filtrare lato server
      q = query(ref, where("disabled", "==", true), orderBy("lastName"), orderBy("firstName"));
    } else if (filter === "pending") {
      // Utenti esplicitamente non approvati; escluderemo lato client i disattivati
      q = query(ref, where("approved", "==", false), orderBy("lastName"), orderBy("firstName"));
    }

    const unsub = onSnapshot(
      q,
      (snap) => {
        console.log("[UserList] snapshot size:", snap.size);
        const ids: string[] = [];
        snap.forEach(d => ids.push(d.id));
        console.log("[UserList] doc ids:", ids);
        const rows: UserRow[] = [];
        snap.forEach((d) => {
          const x = d.data() as DocumentData;
          rows.push({
            uid: d.id,
            email: x?.email ?? null,
            firstName: x?.firstName ?? null,
            lastName: x?.lastName ?? null,
            displayName: x?.displayName ?? null,
            nickname: x?.nickname ?? null,
            role: x?.role,
            approved: x?.approved,
            disabled: x?.disabled,
          });
        });
        let filtered = rows;
        if (filter === "active") {
          // Considera attivi anche i legacy senza campo approved
          filtered = rows.filter(r => (r.approved !== false) && (r.disabled !== true));
        } else if (filter === "pending") {
          filtered = rows.filter(r => r.approved === false && r.disabled !== true);
        } else if (filter === "disabled") {
          filtered = rows.filter(r => r.disabled === true);
        }
        setItems(filtered);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [filter]);

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

      const isPending = item.approved !== true && item.disabled !== true;
      const isActive = item.approved === true && item.disabled !== true;
      const isDisabled = item.disabled === true;

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
