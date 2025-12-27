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
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
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
import { ScreenHeader } from "../components/ScreenHeader"; // Unified Header
import { StatusBadge } from "./calendar/StatusBadge";
import { DifficultyBadge } from "./calendar/DifficultyBadge"; // ADDED
import { getBikeCategoryLabel } from "./calendar/bikeType";
import { deriveGuideSummary } from "../utils/guideHelpers";
import { getDifficultyMeta } from "../utils/rideDifficulty";
import AccessDenied from "../components/AccessDenied";

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
  participantsCountSelf?: number;
  participantsCountTotal?: number;
  guidaName?: string | null;
  guidaNames?: string[];
  status?: "active" | "cancelled";
  difficulty?: string | null;
  archived?: boolean;
  manualParticipants?: any[];
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

// Removed local ACTION_GREEN -> using UI.colors.action

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

const matchesBikeFilter = (
  ride: Ride,
  filter: "Tutte" | "MTBGravel" | "BDC" | "Enduro"
): boolean => {
  if (filter === "Tutte") return true;
  const category = getBikeCategoryLabel(ride);
  if (filter === "Enduro") return category === "Enduro";
  if (filter === "MTBGravel") return category === "MTB/Gravel";
  if (filter === "BDC") return category === "Bici da Corsa";
  return false;
};

// ---- Schermata lista uscite ----
export default function UsciteList() {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const { isAdmin, profile, loading: profileLoading, canSeeCiclismo } =
    useCurrentProfile() as any;

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

  // Width constants removed (using flex: 1)

  const listRef = useRef<FlatList<Ride> | null>(null);

  const normalizedSearch = useMemo(() => normalizeForSearch(searchText), [searchText]);

  const filteredRides = useMemo(() => {
    // 1. ACTIVE vs ARCHIVED
    let result = rides.filter(r => (filterType === "active" ? !r.archived : r.archived));

    // 2. Category
    if (activeCategory !== "Tutte") {
      result = result.filter((r) => matchesBikeFilter(r, activeCategory));
    }

    // 3. Search
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

  // Cache timestamp for fetches
  const lastFetchRef = useRef<Map<string, number>>(new Map());
  const CACHE_TTL = 30000; // 30 seconds

  const fetchCountForRide = useCallback(async (rideId: string, force = false) => {
    try {
      const now = Date.now();
      const last = lastFetchRef.current.get(rideId) ?? 0;
      if (!force && now - last < CACHE_TTL) return;

      const colRef = collection(db, "rides", rideId, "participants");
      const snapshot = await getCountFromServer(query(colRef));
      const selfCount = snapshot.data().count as number;

      lastFetchRef.current.set(rideId, now);

      setCounts((prev) => {
        if (prev[rideId] === selfCount) return prev;
        return { ...prev, [rideId]: selfCount };
      });
    } catch (e) {
      // Ignore
    }
  }, []);

  // Real-time counters
  const MAX_VISIBLE_SUBS = 8;
  const subsRef = useRef<Map<string, Unsubscribe>>(new Map());

  const subscribeFor = useCallback((rideId: string) => {
    if (!canReadRides) return;
    if (!rideId || subsRef.current.has(rideId)) return;
    if (subsRef.current.size >= MAX_VISIBLE_SUBS) return;

    fetchCountForRide(rideId);

    const colRef = collection(db, "rides", rideId, "participants");
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const selfCount = snap.size;
        setCounts((prev) => {
          if (prev[rideId] === selfCount) return prev;
          return { ...prev, [rideId]: selfCount };
        });
        lastFetchRef.current.set(rideId, Date.now());
      },
      (_err) => {
        fetchCountForRide(rideId, true);
      }
    );
    subsRef.current.set(rideId, unsub);
  }, [canReadRides, fetchCountForRide]);

  // Clean subs
  useEffect(() => {
    return () => {
      subsRef.current.forEach((u) => { try { u(); } catch { } });
      subsRef.current.clear();
    };
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    if (profileLoading) return;
    if (!canSeeCiclismo || !canReadRides) {
      setRides([]); setLoading(false); return;
    }
    const base = collection(db, "rides");
    const q = query(base, orderBy("dateTime", "asc"));

    const unsub = onSnapshot(
      q,
      async (snap) => {
        const rows: Ride[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data() as any;
          rows.push({
            id: docSnap.id,
            title: d?.title ?? "",
            meetingPoint: d?.meetingPoint ?? "",
            description: d?.description ?? null,
            bikes: d?.bikes ?? [],
            date: d?.date ?? null,
            dateTime: d?.dateTime ?? null,
            maxParticipants: d?.maxParticipants ?? null,
            participantsCount: typeof d?.participantsCount === "number" ? d.participantsCount : undefined,
            participantsCountSelf: typeof d?.participantsCountSelf === "number" ? d.participantsCountSelf : undefined,
            participantsCountTotal: typeof d?.participantsCountTotal === "number" ? d.participantsCountTotal : undefined,
            guidaName: d?.guidaName ?? null,
            guidaNames: Array.isArray(d?.guidaNames) ? d.guidaNames : null,
            status: d?.status ?? "active",
            difficulty: d?.difficulty ?? null,
            archived: !!d?.archived,
            manualParticipants: Array.isArray(d?.manualParticipants) ? d.manualParticipants : [],
          });
        });

        ridesRef.current = rows;
        setRides(rows);
        setLoading(false);
      },
      (err) => { console.error("Error fetching rides:", err); setLoading(false); }
    );
    return () => unsub();
  }, [profileLoading, canSeeCiclismo, canReadRides]);

  const renderItem = useCallback(({ item }: { item: Ride }) => {
    const isCancelled = item.status === "cancelled";
    const dateLabel = item.date
      ? format(item.date.toDate(), "EEE d MMMM", { locale: it })
      : "";
    const timeLabel = item.dateTime
      ? format(item.dateTime.toDate(), "HH:mm")
      : "";

    // Subscription logic for accurate count
    subscribeFor(item.id);

    const manualCount = item.manualParticipants?.length || 0;
    const realSelfCount = counts[item.id] ?? item.participantsCountSelf ?? 0;
    const displayCount = (item.participantsCountTotal ?? (realSelfCount + manualCount)) || 0;

    const guideSummary = deriveGuideSummary({ guidaNames: item.guidaNames, guidaName: item.guidaName });
    const guideLabel = guideSummary?.main ? String(guideSummary.main) : "";
    if (
      __DEV__ &&
      guideSummary &&
      typeof guideSummary === "object" &&
      "main" in guideSummary &&
      "all" in guideSummary
    ) {
      console.log("[UsciteList] guideSummary", {
        rideId: item.id,
        type: typeof guideSummary,
        value: guideSummary,
        filter: activeCategory,
      });
    }
    const categoryLabel = getBikeCategoryLabel(item);

    return (
      <View style={styles.card}>
        <Pressable
          onPress={() => navigation.navigate("RideDetails", { rideId: item.id, title: item.title })}
          style={({ pressed }) => [styles.cardInner, pressed && { opacity: 0.95 }]}
        >
          {/* Header Card: Category + Status */}
          <View style={styles.cardHeaderRow}>
            <View style={styles.categoryBadge}>
              <Ionicons name="bicycle" size={14} color="#0F172A" />
              <Text style={styles.categoryText}>{categoryLabel}</Text>
            </View>
            {isCancelled ? (
              <StatusBadge status="cancelled" />
            ) : (
              item.difficulty && (
                <DifficultyBadge level={item.difficulty} />
              )
            )}
          </View>

          {/* Title */}
          <Text style={[styles.cardTitle, isCancelled && styles.titleCancelled]}>
            {item.title}
          </Text>

          {/* Info Row: Date/Time + Location */}
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Ionicons name="calendar-outline" size={16} color="#64748B" />
              <Text style={styles.infoText}>{dateLabel} • {timeLabel}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Ionicons name="location-outline" size={16} color="#64748B" />
              <Text style={styles.infoText} numberOfLines={1}>{item.meetingPoint}</Text>
            </View>
          </View>

          {/* Guide row */}
          {guideLabel ? (
            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Ionicons name="person-outline" size={16} color="#64748B" />
                <Text style={styles.infoText}>Guide: {guideLabel}</Text>
              </View>
            </View>
          ) : null}

          {/* Footer: Participants */}
          <View style={styles.cardFooter}>
            <ParticipantsBadge count={displayCount} max={item.maxParticipants} />
            <View style={styles.chevronBox}>
              <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
            </View>
          </View>
        </Pressable>
      </View>
    );
  }, [counts, navigation, subscribeFor, activeCategory]);

  if (profileLoading) return <Screen useNativeHeader={true}><ActivityIndicator style={{ marginTop: 50 }} /></Screen>;
  if (!canSeeCiclismo) return <AccessDenied title="Sezione Riservata" message="Non hai i permessi per visualizzare il calendario bici." />;
  if (!canReadRides) return <AccessDenied title="Account in attesa" message="Il tuo account deve essere approvato." />;

  return (
    <Screen useNativeHeader={true} scroll={false} backgroundColor="#FDFCF8">
      {/* 
        Unified Header 
        Standard topPadding is fine here.
      */}
      <ScreenHeader
        title="ELENCO USCITE"
        subtitle="Calendario Condiviso"
        showBack={true}
        rightAction={
          isAdmin && (
            <TouchableOpacity
              onPress={() => navigation.navigate("CreateRide")}
              style={styles.addButton}
              accessibilityRole="button"
              accessibilityLabel="Crea nuova uscita"
            >
              <Ionicons name="add" size={24} color="#ffffff" />
            </TouchableOpacity>
          )
        }
      />

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
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              {/* Search Bar */}
              <View style={styles.searchRow}>
                <Ionicons name="search" size={18} color="#94a3b8" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Cerca uscita..."
                  placeholderTextColor="#9ca3af"
                  value={searchText}
                  onChangeText={setSearchText}
                />
                {searchText.length > 0 && (
                  <Pressable onPress={() => { setSearchText(""); Keyboard.dismiss(); }} style={styles.searchClear} hitSlop={10}>
                    <Ionicons name="close-circle" size={18} color="#94a3b8" />
                  </Pressable>
                )}
              </View>

              {/* Tabs (Active/Archived) */}
              <View style={styles.tabContainer}>
                <Pressable
                  style={[styles.tabBtn, filterType === "active" && styles.tabBtnActive]}
                  onPress={() => setFilterType("active")}
                >
                  <Text style={[styles.tabText, filterType === "active" && styles.tabTextActive]}>Attive</Text>
                </Pressable>
                <Pressable
                  style={[styles.tabBtn, filterType === "archived" && styles.tabBtnActive]}
                  onPress={() => setFilterType("archived")}
                >
                  <Text style={[styles.tabText, filterType === "archived" && styles.tabTextActive]}>Archiviate</Text>
                </Pressable>
              </View>

              {/* Category Filters */}
              <View style={styles.chipRow}>
                {(["MTBGravel", "BDC", "Enduro"] as const).map((cat) => {
                  const isActive = activeCategory === cat;
                  const label = cat === "MTBGravel" ? "MTB/Gravel" : cat === "BDC" ? "Bici da Corsa" : cat;
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => setActiveCategory(isActive ? "Tutte" : cat)}
                      style={[
                        styles.chip,
                        { flex: 1 },
                        isActive && styles.chipActive
                      ]}
                    >
                      <Text style={[styles.chipText, isActive && styles.chipTextActive]} numberOfLines={1} adjustsFontSizeToFit>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Results Meta */}
              <View style={styles.resultsMeta}>
                {activeCategory !== "Tutte" ? (
                  <TouchableOpacity onPress={() => setActiveCategory("Tutte")} hitSlop={10}>
                    <Text style={styles.resetLink}>Mostra tutte</Text>
                  </TouchableOpacity>
                ) : (
                  <View />
                )}
                <Text style={styles.resultsCount}>
                  {filteredRides.length} {filteredRides.length === 1 ? "uscita" : "uscite"}
                </Text>
              </View>


            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              {loading ? (
                <ActivityIndicator color={UI.colors.primary} />
              ) : (
                <Text style={{ color: "#64748B", fontWeight: "600" }}>Nessuna uscita trovata.</Text>
              )}
            </View>
          }
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Removed header styles (ScreenHeader used)

  addButton: {
    backgroundColor: UI.colors.action,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },

  headerBlock: {
    marginBottom: 16,
    gap: 12,
  },

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
    marginTop: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#0f172a",
    padding: 0,
    height: "100%",
  },
  searchClear: { padding: 4 },

  // Chips
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap", // allows wrapping to keep stability
    gap: 8,
  },
  chip: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: UI.colors.action,
    borderColor: UI.colors.action,
    borderWidth: 0,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  chipTextActive: {
    color: "#ffffff",
  },

  // Tabs
  tabContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: UI.colors.action,
    borderColor: UI.colors.action,
    borderWidth: 0,
  },
  tabText: { fontSize: 13, fontWeight: "600", color: "#64748B" },
  tabTextActive: { color: "#ffffff" },

  // Results Meta
  resultsMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  resultsCount: { fontSize: 13, fontWeight: "600", color: "#64748B" },
  resetLink: { fontSize: 13, fontWeight: "600", color: UI.colors.action },

  // Cards
  card: {
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: "#fff",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: "rgba(241, 245, 249, 1)",
  },
  cardInner: {
    padding: 16,
    gap: 12,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0F172A",
  },
  difficultyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: "transparent",
  },
  difficultyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  difficultyText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },

  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    lineHeight: 24,
  },
  titleCancelled: {
    textDecorationLine: "line-through",
    color: "#94A3B8",
  },

  infoRow: { flexDirection: "row", gap: 16 },
  infoItem: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  infoText: { fontSize: 14, color: "#64748B", fontWeight: "500" },

  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  chevronBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },

  // Badges
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ecfdf5", // green-50
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  badgeIcon: { fontSize: 12 },
  badgeText: { fontSize: 13, fontWeight: "700", color: "#059669" }, // green-700

  emptyBox: { alignItems: "center", marginTop: 40 },
});
