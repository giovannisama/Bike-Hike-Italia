// src/screens/UsciteList.tsx
import React, { useEffect, useState, useCallback, useLayoutEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  useWindowDimensions,
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
} from "firebase/firestore";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Screen, UI } from "../components/Screen";
import { StatusBadge } from "./calendar/StatusBadge";
import { deriveGuideSummary } from "../utils/guideHelpers";

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
  participantsCount?: number;
  guidaName?: string | null;
  guidaNames?: string[];
  status?: "active" | "cancelled";
  difficulty?: string | null;
  archived?: boolean;
  manualCount?: number;
};

const normalizeForSearch = (value?: string) =>
  (value || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// ---- Badge partecipanti ----
function ParticipantsBadge({ count, max }: { count?: number; max?: number | null }) {
  const display = max != null ? `${count ?? 0}/${max}` : String(count ?? 0);
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeIcon}>👥</Text>
      <Text style={styles.badgeText}>{display}</Text>
    </View>
  );
}

// -- Bike type filter helpers (UI-only) --
const normalizeBikeTypes = (value: any): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter((v) => v.length > 0);
  }
  if (typeof value === "string") {
    // Robustness: split by comma if mixed string, though unlikely based on type
    return value
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }
  return [];
};

const matchesBikeFilter = (
  ride: Ride,
  filter: "Tutte" | "MTBGravel" | "BDC" | "Enduro"
): boolean => {
  if (filter === "Tutte") return true;

  const typeList = normalizeBikeTypes(ride.bikes);
  // Case-insensitive check helper
  const hasType = (t: string) =>
    typeList.some((x) => x.toLowerCase() === t.toLowerCase());

  if (filter === "Enduro") {
    // Rule: Contains "Enduro" AND only allowed extras are ["eBike"]
    // "Enduro" -> OK
    // "Enduro, eBike" -> OK
    // "Enduro, MTB" -> NO
    const allowedExtras = ["enduro", "ebike"];
    const isStrictlyEnduro = typeList.every((t) =>
      allowedExtras.includes(t.toLowerCase())
    );
    return hasType("Enduro") && isStrictlyEnduro;
  }

  if (filter === "MTBGravel") {
    // Rule: Contains "MTB" OR "Gravel" (mixed with Enduro ok)
    // NOTE: An output with ["MTB", "Enduro"] will appear in BOTH Enduro and MTBGravel filters.
    return hasType("MTB") || hasType("Gravel");
  }

  if (filter === "BDC") {
    // Rule: EXACTLY and ONLY "BDC"
    return typeList.length === 1 && hasType("BDC");
  }

  return true;
};

// ---- Schermata lista uscite ----
export default function UsciteList() {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions(); // Used for deterministic chip width
  const { isAdmin, profile, loading: profileLoading } = useCurrentProfile() as any;

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

  // 🗂️ FILTRI CATEGORIA
  const [activeCategory, setActiveCategory] = useState<"Tutte" | "MTBGravel" | "BDC" | "Enduro">("Tutte");
  // 🗂️ FILTRO STATO (Attive/Archiviate)
  const [filterType, setFilterType] = useState<"active" | "archived">("active");

  const [searchText, setSearchText] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Pull-to-refresh
  const [refreshing, setRefreshing] = useState(false);

  const listRef = useRef<FlatList<Ride> | null>(null);

  const normalizedSearch = useMemo(() => normalizeForSearch(searchText), [searchText]);

  const filteredRides = useMemo(() => {
    // 1. Base filter: ACTIVE vs ARCHIVED
    let result = rides.filter(r => (filterType === "active" ? !r.archived : r.archived));

    // 2. Category Filter
    if (activeCategory !== "Tutte") {
      result = result.filter((r) => matchesBikeFilter(r, activeCategory));
    }

    // 3. Search Filter
    if (normalizedSearch) {
      result = result.filter((ride) => {
        const bikesLabel = Array.isArray(ride.bikes) ? ride.bikes.join(" ") : ride.bikes ?? "";
        const haystackSource = [
          ride.title,
          ride.meetingPoint,
          bikesLabel,
          ride.difficulty ?? "",
        ].join(" ");
        const haystack = normalizeForSearch(haystackSource);
        return haystack.includes(normalizedSearch);
      });
    }

    return result;
  }, [rides, normalizedSearch, activeCategory, filterType]);

  const clearFilters = useCallback(() => {
    setSearchText("");
    setActiveCategory("Tutte");
  }, []);

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
      // Ignore
    }
  }, []);

  // Real-time counters for visible rows
  const MAX_VISIBLE_SUBS = 8;
  const subsRef = useRef<Map<string, Unsubscribe>>(new Map());
  const visibleSetRef = useRef<Set<string>>(new Set());

  const subscribeFor = useCallback((rideId: string) => {
    if (!canReadRides) return;
    if (!rideId || subsRef.current.has(rideId)) return;
    if (subsRef.current.size >= MAX_VISIBLE_SUBS) return;
    const colRef = collection(db, "rides", rideId, "participants");
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
        fetchCountForRide(rideId);
      }
    );
    subsRef.current.set(rideId, unsub);
  }, [canReadRides, fetchCountForRide]);

  const unsubscribeFor = useCallback((rideId: string) => {
    const unsub = subsRef.current.get(rideId);
    if (unsub) {
      try { unsub(); } catch { }
      subsRef.current.delete(rideId);
    }
  }, []);

  // Clean up all subs on unmount
  useEffect(() => {
    return () => {
      subsRef.current.forEach((u) => { try { u(); } catch { } });
      subsRef.current.clear();
      visibleSetRef.current.clear();
    };
  }, []);

  // Hide native stack header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  // Caricamento rides
  useEffect(() => {
    if (profileLoading) return;
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
        snap.forEach((docSnap) => {
          const d = docSnap.data() as any;
          const archived = !!d?.archived;
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
        });

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
        setLoading(false);
      },
      (err) => {
        console.error("Errore caricamento rides:", err);
        setLoading(false);
      }
    );

    return () => {
      try { unsub(); } catch { }
      subsRef.current.forEach((u) => { try { u(); } catch { } });
      subsRef.current.clear();
      visibleSetRef.current.clear();
    };
  }, [profileLoading, canReadRides]);

  // Utility: refresh counts
  const refreshCounts = useCallback(async () => {
    if (rides.length === 0) return;
  }, [rides]);

  useFocusEffect(
    useCallback(() => {
      refreshCounts();
      return () => { };
    }, [refreshCounts])
  );

  // Reset scroll on filter change
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    subsRef.current.forEach((unsub) => { try { unsub(); } catch { } });
    subsRef.current.clear();
    visibleSetRef.current.clear();
  }, [normalizedSearch, activeCategory, filterType]);

  // Subscription management for filtered list
  useEffect(() => {
    const topIds = filteredRides.slice(0, MAX_VISIBLE_SUBS).map((ride) => ride.id);
    topIds.forEach((id) => {
      fetchCountForRide(id);
      subscribeFor(id);
      visibleSetRef.current.add(id);
    });
  }, [filteredRides, fetchCountForRide, subscribeFor]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item: Ride }> }) => {
    const newlyVisible = new Set(viewableItems.map((vi) => vi.item.id));
    newlyVisible.forEach((id) => {
      visibleSetRef.current.add(id);
      subscribeFor(id);
    });
    Array.from(subsRef.current.keys()).forEach((id) => {
      if (!newlyVisible.has(id)) {
        unsubscribeFor(id);
        visibleSetRef.current.delete(id);
      }
    });
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const onRefresh = useCallback(async () => {
    if (!canReadRides) { setRefreshing(false); return; }
    setRefreshing(true);
    try {
      const ids = Array.from(subsRef.current.keys());
      ids.forEach((id) => unsubscribeFor(id));
      ids.forEach((id) => {
        fetchCountForRide(id);
        subscribeFor(id);
      });
    } finally {
      setRefreshing(false);
    }
  }, [subscribeFor, unsubscribeFor, canReadRides, fetchCountForRide]);

  // Render item
  const renderItem = ({ item }: { item: Ride }) => {
    const { main: mainGuide } = deriveGuideSummary({
      guidaName: item.guidaName,
      guidaNames: item.guidaNames,
    });
    const guideText = mainGuide || "—";

    const when = (() => {
      const ts = item.dateTime || item.date;
      if (!ts) return "—";
      try {
        return format(ts.toDate(), "dd MMM yyyy '•' HH:mm", { locale: it });
      } catch {
        return "—";
      }
    })();

    const bikeLabel =
      Array.isArray(item.bikes) && item.bikes.length > 0
        ? item.bikes.join(", ")
        : "—";

    const isCancelled = item.status === "cancelled";
    const isArchived = !!item.archived;
    const participantTotal = counts[item.id] ?? (item.participantsCount ?? item.manualCount ?? 0);

    const statusBadge = isArchived ? (
      <StatusBadge text="Archiviata" icon="📦" bg="#E5E7EB" fg="#374151" />
    ) : isCancelled ? (
      <StatusBadge text="Annullata" icon="✖" bg="#FEE2E2" fg="#991B1B" />
    ) : (
      <StatusBadge text="Attiva" icon="✓" bg="#111" fg="#fff" />
    );

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
          <View style={styles.cardHeaderRow}>
            <Text style={styles.dateLine} numberOfLines={1}>
              {when}
            </Text>
            <ParticipantsBadge count={participantTotal} max={item.maxParticipants ?? null} />
          </View>

          <Text
            style={[
              styles.cardTitle,
              isCancelled && { textDecorationLine: "line-through", color: "#991B1B" },
            ]}
            numberOfLines={2}
          >
            {item.title || "Uscita"}
          </Text>

          <View style={{ marginTop: 4, alignSelf: 'flex-start' }}>{statusBadge}</View>

          <View style={styles.detailsBlock}>
            <View style={styles.row}>
              <Text style={styles.label}>Guida: </Text>
              <Text style={styles.value} numberOfLines={1}>{guideText}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Tipo bici: </Text>
              <Text style={styles.value} numberOfLines={1}>{bikeLabel}</Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.label, { width: undefined, marginRight: 8, flexShrink: 0 }]}>Difficoltà:</Text>
              <Text style={[styles.value, { flexShrink: 1 }]} numberOfLines={1}>{item.difficulty || "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Ritrovo: </Text>
              <Text style={styles.value} numberOfLines={1}>{item.meetingPoint || "—"}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const categories: Array<"Tutte" | "MTBGravel" | "BDC" | "Enduro"> = [
    "MTBGravel",
    "BDC",
    "Enduro",
    // "Tutte" is handled separately in the first row
  ] as const;

  const categoryLabels: Record<string, string> = {
    "MTBGravel": "MTB/Gravel",
    "BDC": "Bici da Corsa",
    "Enduro": "Enduro",
    "Tutte": "Tutte",
  };

  // --- CALCULATION OF CHIP WIDTH (DETERMINISTIC) ---
  const H_PADDING = 16;
  const GAP = 10;
  // Reduced by SAFETY (24) to ensure they always fit without overflow from rounding or borders
  const SAFETY = 24;
  // Width available for 3 chips
  const containerWidth = width - (H_PADDING * 2) - SAFETY;
  // Remove gaps (2 gaps between 3 items) and divide by 3
  const chipWidth = Math.floor((containerWidth - (GAP * 2)) / 3);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Carico le uscite…</Text>
      </View>
    );
  }

  return (
    <Screen useNativeHeader={true} scroll={false} backgroundColor="#FDFCF8">
      {/* Decorative Header Gradient */}
      <View style={styles.headerGradientContainer}>
        <LinearGradient
          colors={["rgba(20, 83, 45, 0.08)", "rgba(14, 165, 233, 0.08)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined}
      >
        <FlatList
          ref={listRef}
          data={filteredRides}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 16, paddingTop: 8 }}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              {/* Header: Back - Title - ADD BUTTON */}
              <View style={styles.headerRow}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 8, marginTop: 4 }}>
                  <Ionicons name="arrow-back" size={24} color="#1E293B" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={styles.headerTitle}>CICLISMO</Text>
                  <Text style={styles.headerSubtitle}>Esplora le uscite</Text>
                </View>
                {isAdmin && (
                  <TouchableOpacity
                    style={styles.headerAddBtn}
                    onPress={() => navigation.navigate("CreateRide")}
                    accessibilityRole="button"
                    accessibilityLabel="Crea nuova uscita"
                  >
                    <Ionicons name="add" size={24} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Search Bar */}
              <View style={styles.searchRow}>
                <Ionicons name="search" size={18} color="#94a3b8" style={{ marginRight: 8 }} />
                <View style={{ flex: 1, position: 'relative' }}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Cerca per titolo, luogo, bici..."
                    placeholderTextColor="#9ca3af"
                    value={searchText}
                    onChangeText={setSearchText}
                    returnKeyType="search"
                  />
                  {searchText.trim().length > 0 && (
                    <Pressable
                      onPress={() => {
                        setSearchText("");
                        Keyboard.dismiss();
                      }}
                      hitSlop={10}
                      style={styles.searchClear}
                    >
                      <Ionicons name="close-circle" size={18} color="#94a3b8" />
                    </Pressable>
                  )}
                </View>
              </View>

              {/* Tabs Attive / Archiviate e Contatore */}
              <View style={styles.tabsRow}>
                <View style={styles.tabsContainer}>
                  <Pressable
                    onPress={() => setFilterType("active")}
                    style={[styles.tabBtn, filterType === "active" && styles.tabBtnActive]}
                  >
                    <Text style={[styles.tabText, filterType === "active" && styles.tabTextActive]}>
                      Attive
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setFilterType("archived")}
                    style={[styles.tabBtn, filterType === "archived" && styles.tabBtnActive]}
                  >
                    <Text style={[styles.tabText, filterType === "archived" && styles.tabTextActive]}>
                      Archiviate
                    </Text>
                  </Pressable>
                </View>
                <Text style={styles.countText}>
                  {filteredRides.length} {filteredRides.length === 1 ? "evento" : "eventi"}
                </Text>
              </View>

              {/* Filtri Categoria a due righe: Tutte / Others */}
              <View style={styles.filterSection}>
                {/* Riga 1: Tutte */}
                <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                  <Pressable
                    onPress={() => setActiveCategory("Tutte")}
                    style={[styles.catBtn, activeCategory === "Tutte" && styles.catBtnActive]}
                  >
                    <Text style={[styles.catText, activeCategory === "Tutte" && styles.catTextActive]}>
                      Tutte
                    </Text>
                  </Pressable>
                </View>

                {/* Riga 2: Altre categorie (Exactly 3, deterministic width) */}
                <View style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  flexWrap: 'nowrap',
                  overflow: 'hidden',
                  width: '100%'
                }}>
                  {categories.map((cat) => (
                    <Pressable
                      key={cat}
                      onPress={() => setActiveCategory(cat)}
                      style={[
                        styles.catBtn,
                        activeCategory === cat && styles.catBtnActive,
                        {
                          width: chipWidth,
                          maxWidth: chipWidth,
                          minWidth: chipWidth,
                          alignItems: 'center',
                          justifyContent: 'center'
                        }
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        allowFontScaling={false}
                        style={[styles.catText, activeCategory === cat && styles.catTextActive]}
                      >
                        {categoryLabels[cat]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={{ fontWeight: "700", color: UI.colors.muted, textAlign: 'center' }}>
                {normalizedSearch
                  ? "Nessuna uscita corrisponde ai filtri."
                  : filterType === "archived"
                    ? "Nessuna uscita archiviata."
                    : "Nessuna uscita disponibile."}
              </Text>
              {isAdmin && filteredRides.length === 0 && !normalizedSearch && activeCategory === "Tutte" && filterType === "active" && (
                <Text style={{ marginTop: 8, color: "#666", fontSize: 12, textAlign: 'center' }}>
                  Tocca il “+” in alto per creare la prima uscita.
                </Text>
              )}
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerGradientContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  headerBlock: {
    marginBottom: 16,
    marginTop: 8,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1E293B",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#64748B",
    marginTop: 2,
  },
  // ACTION BUTTON NEL HEADER FIX
  headerAddBtn: {
    backgroundColor: "#166534", // Green-800
    width: 44,
    height: 44,
    borderRadius: 22, // Circle
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
    marginTop: 2,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#64748B",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  searchClear: {
    position: "absolute",
    right: 4,
    top: "50%",
    transform: [{ translateY: -9 }],
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#0F172A",
  },
  // STILE TABS RECTANGULAR
  tabsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  tabsContainer: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    padding: 4,
    borderRadius: 12, // Rectangular-ish with small radius
  },
  tabBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 8, // Rectangular-ish
  },
  tabBtnActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  tabTextActive: {
    color: "#0F172A",
    fontWeight: "800",
  },
  countText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  // FILTRI CATEGORIA
  filterSection: {
    gap: 0,
    marginTop: 8,
  },
  catBtn: {
    paddingVertical: 8, // slightly taller
    paddingHorizontal: 4, // reduced horiz padding to fit text if needed
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  catBtnActive: {
    backgroundColor: "#F0FDF4", // Light green
    borderColor: "#166534", // Dark green border
  },
  catText: {
    fontSize: 13, // Fixed font size
    fontWeight: "600",
    color: "#64748B",
    textAlign: 'center',
  },
  catTextActive: {
    color: "#166534",
    fontWeight: "700",
    // No fontSize change allowed
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    shadowColor: "#000",
    shadowOpacity: 0.02,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  dateLine: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "600",
    textTransform: "uppercase",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1E293B",
    lineHeight: 24,
    marginBottom: 6,
  },
  detailsBlock: {
    marginTop: 12,
    gap: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
    width: 80,
  },
  value: {
    fontSize: 14,
    color: "#1E293B",
    flex: 1,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#F1F5F9",
  },
  badgeIcon: { fontSize: 12 },
  badgeText: { color: "#475569", fontWeight: "600", fontSize: 12 },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
});
