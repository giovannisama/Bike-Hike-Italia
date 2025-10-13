// src/screens/UsciteList.tsx
import React, { useEffect, useState, useCallback, useLayoutEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Pressable,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { db } from "../firebase";
import useCurrentProfile from "../hooks/useCurrentProfile";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  Unsubscribe,
  getCountFromServer,
  DocumentData,
} from "firebase/firestore";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Screen, UI } from "../components/Screen";

// ---- Tipi ----
type Ride = {
  id: string;
  title: string;
  meetingPoint: string;
  description?: string | null;
  bikes?: string[];
  date?: Timestamp | null;
  dateTime?: Timestamp | null;
  maxParticipants?: number | null;
  participantsCount?: number; // server-side (se mai lo aggiornerai con CF)
  guidaName?: string | null;
  guidaNames?: string[];
  status?: "active" | "cancelled";
  difficulty?: string | null;
  archived?: boolean;
  manualCount?: number;
};

// ---- Badge partecipanti ----
function ParticipantsBadge({ count }: { count?: number }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeIcon}>👥</Text>
      <Text style={styles.badgeText}>{String(count ?? 0)}</Text>
    </View>
  );
}

// ---- Schermata lista uscite ----
export default function UsciteList() {
  const navigation = useNavigation<any>();
  const { isAdmin, profile, loading: profileLoading } = useCurrentProfile() as any;

  // Gate di accesso coerente con le rules: utente attivo = approved true e non disabled
  const approvedOk =
    !!profile &&
    ((profile.approved === true) ||
      (profile.approved === "true") ||
      (profile.approved === 1));
  const disabledOn =
    !!profile &&
    ((profile.disabled === true) ||
      (profile.disabled === "true") ||
      (profile.disabled === 1));
  const canReadRides = isAdmin || (approvedOk && !disabledOn);

  const [rides, setRides] = useState<Ride[]>([]);
  const ridesRef = useRef<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  // 🔢 mappa dinamica dei conteggi partecipanti per rideId (Aggregate)
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Pull-to-refresh
  const [refreshing, setRefreshing] = useState(false);

  // Helper: preleva il conteggio server-side dei partecipanti per una singola uscita
  const fetchCountForRide = useCallback(async (rideId: string) => {
    try {
      const colRef = collection(db, "rides", rideId, "participants");
      const snapshot = await getCountFromServer(query(colRef));
      const base = snapshot.data().count as number;
      const manual = ridesRef.current.find((r) => r.id === rideId)?.manualCount ?? 0;
      const cnt = base + manual;
      setCounts((prev) => {
        if (prev[rideId] === cnt) return prev;
        return { ...prev, [rideId]: cnt };
      });
    } catch (e) {
      // Se fallisce (permessi/altro), lasciamo il valore attuale
      // opzionalmente potremmo fare console.warn, ma evitiamo rumore
    }
  }, []);

  // Real-time counters for visible rows (avoid aggregation quota)
  const MAX_VISIBLE_SUBS = 8;
  const subsRef = useRef<Map<string, Unsubscribe>>(new Map());
  const visibleSetRef = useRef<Set<string>>(new Set());

  const subscribeFor = useCallback((rideId: string) => {
    if (!canReadRides) return;
    if (!rideId || subsRef.current.has(rideId)) return;
    if (subsRef.current.size >= MAX_VISIBLE_SUBS) return;
    const colRef = collection(db, "rides", rideId, "participants");
    // Prima di sottoscrivere, recupera un conteggio iniziale dal server (una volta)
    fetchCountForRide(rideId);
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const manual = ridesRef.current.find((r) => r.id === rideId)?.manualCount ?? 0;
        setCounts((prev) => {
          const nextValue = snap.size + manual;
          if (prev[rideId] === nextValue) return prev;
          return { ...prev, [rideId]: nextValue };
        });
      },
      (_err) => {
        // In caso di errore sul listener (permessi, ecc.), usa il fallback server-side
        fetchCountForRide(rideId);
      }
    );
    subsRef.current.set(rideId, unsub);
  }, [canReadRides, fetchCountForRide]);

  const unsubscribeFor = useCallback((rideId: string) => {
    const unsub = subsRef.current.get(rideId);
    if (unsub) {
      try { unsub(); } catch {}
      subsRef.current.delete(rideId);
    }
  }, []);

  // Clean up all subs on unmount
  useEffect(() => {
    return () => {
      subsRef.current.forEach((u) => { try { u(); } catch {} });
      subsRef.current.clear();
      visibleSetRef.current.clear();
    };
  }, []);

  // Nascondi header stack (usiamo header custom)
    useLayoutEffect(() => {
      navigation.setOptions({
        headerShown: true,
        headerTitle: "Uscite",
        headerTitleAlign: "center",
        headerBackTitle: "Home",
        headerBackTitleVisible: true,
      });
    }, [navigation]);

  // Caricamento rides ordinate per data più recente (dateTime DESC)
  // 👉 Nessun where() per evitare indice composito: filtro client-side su "archived"
  useEffect(() => {
    // Se il profilo è in caricamento non montiamo ancora i listener
    if (profileLoading) return;
    // Se l'utente non è attivo (o non admin), non apriamo il listener
    if (!canReadRides) {
      setRides([]);
      setLoading(false);
      return;
    }
    const base = collection(db, "rides");
    const q = query(base, orderBy("dateTime", "asc"));

    const unsub = onSnapshot(
      q,
      async (snap) => {
        const rows: Ride[] = [];
        const ids: string[] = [];

        snap.forEach((docSnap) => {
          const d = docSnap.data() as any;
          const archived = !!d?.archived;
          if (archived !== showArchived) return;
          const manualCount = Array.isArray(d?.manualParticipants) ? d.manualParticipants.length : 0;

          rows.push({
            id: docSnap.id,
            title: d?.title ?? "",
            meetingPoint: d?.meetingPoint ?? "",
            description: d?.description ?? null,
            bikes: d?.bikes ?? [],
            date: d?.date ?? null,
            dateTime: d?.dateTime ?? null,
            maxParticipants: d?.maxParticipants ?? null,
            participantsCount: d?.participantsCount ?? undefined,
            guidaName: d?.guidaName ?? null,
            guidaNames: Array.isArray(d?.guidaNames) ? d.guidaNames : undefined,
            status: d?.status ?? "active",
            difficulty: d?.difficulty ?? null,
            archived,
            manualCount,
          });
          ids.push(docSnap.id);
        });

        // Initialize counts from doc (fallback 0) so badges show a number immediately
        const initial: Record<string, number> = {};
        rows.forEach((r) => {
          const fallbackTotal =
            typeof r.participantsCount === "number"
              ? r.participantsCount!
              : r.manualCount ?? 0;
          initial[r.id] = fallbackTotal;
        });
        setCounts((prev) => ({ ...prev, ...initial }));

        ridesRef.current = rows;
        setRides(rows);

        // Pre-carica i conteggi (fallback) per i primi elementi
        const prefetchIds = rows.slice(0, MAX_VISIBLE_SUBS).map((r) => r.id);
        prefetchIds.forEach((id) => { fetchCountForRide(id); });

        setLoading(false);

        // Pre-subscribe the first N visible items (top of the list)
        const topIds = prefetchIds;
        topIds.forEach((id) => {
          visibleSetRef.current.add(id);
          subscribeFor(id);
        });
      },
      (err) => {
        console.error("Errore caricamento rides:", err);
        setLoading(false);
        try {
          Alert.alert("Uscite", String(err));
        } catch {}
      }
    );

    return () => {
      try { unsub(); } catch {}
      // Clear any per-ride participant subscriptions when switching archived filter
      subsRef.current.forEach((u) => { try { u(); } catch {} });
      subsRef.current.clear();
      visibleSetRef.current.clear();
    };
  }, [showArchived, profileLoading, canReadRides]);

  // 🔄 Utility: ricalcola i conteggi correnti (usata su focus + pull-to-refresh)
  const refreshCounts = useCallback(async () => {
    if (rides.length === 0) return;
    // no aggregation queue, just rely on subscriptions
  }, [rides]);

  // ✅ Al ritorno su questa schermata, aggiorna i contatori
  useFocusEffect(
    useCallback(() => {
      refreshCounts();
      return () => {};
    }, [refreshCounts])
  );

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item: Ride }> }) => {
    const newlyVisible = new Set(viewableItems.map((vi) => vi.item.id));
    // subscribe new
    newlyVisible.forEach((id) => {
      visibleSetRef.current.add(id);
      subscribeFor(id);
    });
    // unsubscribe those no longer visible
    Array.from(subsRef.current.keys()).forEach((id) => {
      if (!newlyVisible.has(id)) {
        unsubscribeFor(id);
        visibleSetRef.current.delete(id);
      }
    });
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    if (!canReadRides) { setRefreshing(false); return; }
    setRefreshing(true);
    try {
      // force refresh by briefly unsubscribing and resubscribing visible
      const ids = Array.from(subsRef.current.keys());
      ids.forEach((id) => unsubscribeFor(id));
      ids.forEach((id) => {
        // aggiorna subito con un conteggio server-side e poi riattacca il listener
        fetchCountForRide(id);
        subscribeFor(id);
      });
    } finally {
      setRefreshing(false);
    }
  }, [subscribeFor, unsubscribeFor, canReadRides, fetchCountForRide]);

  const renderItem = ({ item }: { item: Ride }) => {
    const guideText =
      (item.guidaName && item.guidaName.trim()) ||
      (item.guidaNames && item.guidaNames.length > 0
        ? item.guidaNames.join(", ")
        : "—");

    const when = (() => {
      const ts = item.dateTime || item.date;
      if (!ts) return "—";
      try {
        return format(ts.toDate(), "EEE d MMM yyyy '•' HH:mm", { locale: it });
      } catch {
        return "—";
      }
    })();

    const isCancelled = item.status === "cancelled";

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() =>
          navigation.navigate("RideDetails", {
            rideId: item.id,
            title: item.title,
          })
        }
      >
        <View style={{ flex: 1 }}>
          {/* Titolo + stato */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              style={[
                styles.title,
                isCancelled && {
                  textDecorationLine: "line-through",
                  color: "#991B1B",
                },
              ]}
              numberOfLines={1}
            >
              {item.title || "Uscita"}
            </Text>
            {isCancelled && (
              <View style={styles.cancelPill}>
                <Text style={styles.cancelPillText}>Annullata</Text>
              </View>
            )}
            {item.archived && (
              <View
                style={[
                  styles.cancelPill,
                  { backgroundColor: "#E5E7EB", borderColor: "#D1D5DB" },
                ]}
              >
                <Text style={[styles.cancelPillText, { color: "#374151" }]}>
                  Archiviata
                </Text>
              </View>
            )}
          </View>

          {/* Difficoltà */}
          <Text style={styles.row}>
            <Text style={styles.label}>Difficoltà: </Text>
            <Text style={styles.value} numberOfLines={1}>
              {item.difficulty || "—"}
            </Text>
          </Text>

          {/* Guide */}
          <Text style={styles.row}>
            <Text style={styles.label}>Guida: </Text>
            <Text style={styles.value} numberOfLines={1}>
              {guideText}
            </Text>
          </Text>

          {/* Data e ora */}
          <Text style={styles.row}>
            <Text style={styles.label}>Data e ora: </Text>
            <Text style={styles.value}>{when}</Text>
          </Text>

          {/* Ritrovo */}
          <Text style={styles.row}>
            <Text style={styles.label}>Ritrovo: </Text>
            <Text style={styles.value} numberOfLines={1}>
              {item.meetingPoint || "—"}
            </Text>
          </Text>
        </View>

        {/* Badge partecipanti (Aggregate → fallback a participantsCount del doc) */}
        <ParticipantsBadge
          count={counts[item.id] ?? (item.participantsCount ?? item.manualCount ?? 0)}
        />
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Carico le uscite…</Text>
      </View>
    );
  }

  return (
    <Screen useNativeHeader={true} scroll={false}>
      <View style={{ flex: 1 }}>
        {/* Hero grafico sotto l'header nativo */}
        <LinearGradient
          colors={[UI.colors.primary, UI.colors.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 20,
            paddingVertical: 16,
            paddingHorizontal: 16,
            marginBottom: 10,
          }}
        >
          <Text style={{ fontSize: 22, fontWeight: "900", color: "#fff" }}>Uscite</Text>
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#F0F9FF", marginTop: 4 }}>
            {isAdmin ? "Crea, gestisci e partecipa" : "Elenco uscite e prenotazioni"}
          </Text>
        </LinearGradient>
        {/* Toggle Attive / Archivio (pillole compatte, non invadono l’header) */}
        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => setShowArchived(false)}
            style={[styles.toggleBtn, !showArchived && styles.toggleBtnActive]}
          >
            <Text style={[styles.toggleText, !showArchived && styles.toggleTextActive]}>
              Attive
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setShowArchived(true)}
            style={[styles.toggleBtn, showArchived && styles.toggleBtnActive]}
          >
            <Text style={[styles.toggleText, showArchived && styles.toggleTextActive]}>
              Archivio
            </Text>
          </Pressable>
          <Text style={styles.toggleCount}>{rides.length}</Text>
        </View>

        {rides.length === 0 ? (
          <View style={[styles.center, { padding: 16 }]}>
            <Text style={{ marginBottom: 12 }}>
              {showArchived ? "Nessuna uscita archiviata." : "Nessuna uscita disponibile."}
            </Text>

            {isAdmin && !showArchived && (
              <>
                <TouchableOpacity
                  style={styles.fab}
                  onPress={() => navigation.navigate("CreateRide")}
                  accessibilityRole="button"
                  accessibilityLabel="Crea nuova uscita"
                >
                  <Text style={styles.fabPlus}>＋</Text>
                </TouchableOpacity>
                <Text style={{ marginTop: 8, color: "#666", fontSize: 12 }}>
                  Tocca il “+” per creare la prima uscita.
                </Text>
              </>
            )}
          </View>
        ) : (
          <FlatList
            data={rides}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            contentContainerStyle={{ padding: 12, paddingBottom: 90 }}
            refreshing={refreshing}
            onRefresh={onRefresh}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
          />
        )}

        {/* Floating Action Button “+” — solo Admin e solo quando si guardano le non archiviate */}
        {isAdmin && !showArchived && (
          <TouchableOpacity
            style={styles.fab}
            onPress={() => navigation.navigate("CreateRide")}
            accessibilityRole="button"
            accessibilityLabel="Crea nuova uscita"
          >
            <Text style={styles.fabPlus}>＋</Text>
          </TouchableOpacity>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  // Toggle pillole
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    backgroundColor: "#fff",
  },
  toggleBtnActive: {
    backgroundColor: "#111",
    borderColor: "#111",
  },
  toggleText: { color: "#111", fontWeight: "700" },
  toggleTextActive: { color: "#fff" },
  toggleCount: { marginLeft: 6, color: "#6b7280", fontWeight: "700" },

  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
  },
  title: { fontSize: 16, fontWeight: "700", marginBottom: 2, color: "#111" },
  row: { marginTop: 2 },
  label: { fontWeight: "700", color: "#222" },
  value: { color: "#333" },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#111",
    alignSelf: "flex-start",
  },
  badgeIcon: { color: "#fff", marginRight: 6, fontSize: 12 },
  badgeText: { color: "#fff", fontWeight: "700" },

  // Header button (solo Admin)
  headerBtn: {
    backgroundColor: "#111",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 6,
  },
  headerBtnText: { color: "#fff", fontWeight: "700" },

  // Floating Action Button (solo Admin)
  fab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  fabPlus: { color: "#fff", fontSize: 28, lineHeight: 28, marginTop: -2 },

  // Pill "Annullata" / "Archiviata"
  cancelPill: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  cancelPillText: { color: "#991B1B", fontWeight: "800", fontSize: 12 },
});
