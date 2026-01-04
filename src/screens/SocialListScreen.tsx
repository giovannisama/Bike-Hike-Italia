import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  TextInput,
  Keyboard,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { Screen, UI } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { db } from "../firebase";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import useCurrentProfile from "../hooks/useCurrentProfile";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { FirestoreTimestamp } from "../types/firestore";
import { toDateSafe, toMillisSafe } from "../utils/firestoreDate";
import { info } from "../utils/logger";
import { StatusBadge } from "./calendar/StatusBadge";

type SocialEvent = {
  id: string;
  title?: string;
  meetingPlaceText?: string | null;
  organizerName?: string | null;
  startAt?: FirestoreTimestamp | null;
  participantsCount?: number | null;
  status?: string;
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

function ParticipantsBadge({ count }: { count?: number }) {
  const safeCount = typeof count === "number" && !Number.isNaN(count) ? count : 0;
  // Social: Purple (#7C3AED) -> Bg Purple-100 (#F3E8FF)
  return (
    <View style={[styles.badge, { backgroundColor: "#F3E8FF" }]}>
      <Text style={[styles.badgeIcon, { color: UI.colors.eventSocial }]}>👥</Text>
      <Text style={[styles.badgeText, { color: UI.colors.eventSocial }]}>{String(safeCount)}</Text>
    </View>
  );
}

type SocialListItemProps = {
  item: SocialEvent;
  onPress: (eventId: string) => void;
};

const SocialListItem = React.memo(function SocialListItem({ item, onPress }: SocialListItemProps) {
  const dt = toDateSafe(item.startAt);
  const dateLabel = dt ? format(dt, "EEE d MMM • HH:mm", { locale: it }) : "Data da definire";
  const isCancelled = item.status === "cancelled";

  const handlePress = useCallback(() => {
    onPress(item.id);
  }, [item.id, onPress]);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [styles.cardInner, pressed && { opacity: 0.95 }]}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Text style={[styles.cardTitle, isCancelled && styles.titleCancelled, { flex: 1 }]}>
            {item.title || "Evento social"}
          </Text>
          {isCancelled && <StatusBadge status="cancelled" />}
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Ionicons name="calendar-outline" size={16} color="#64748B" />
            <Text style={styles.infoText}>{dateLabel}</Text>
          </View>
        </View>
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Ionicons name="location-outline" size={16} color="#64748B" />
            <Text style={styles.infoText} numberOfLines={1}>
              {item.meetingPlaceText || "Luogo da definire"}
            </Text>
          </View>
        </View>
        {!!item.organizerName && (
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Ionicons name="person-outline" size={16} color="#64748B" />
              <Text style={styles.infoText}>Organizzatore: {item.organizerName}</Text>
            </View>
          </View>
        )}

        <View style={styles.cardFooter}>
          <ParticipantsBadge count={item.participantsCount ?? 0} />
          <View style={styles.chevronBox}>
            <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
          </View>
        </View>
      </Pressable>
    </View>
  );
});

export default function SocialListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isAdmin, isOwner } = useCurrentProfile();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<SocialEvent[]>([]);
  const [searchText, setSearchText] = useState("");
  const [filterType, setFilterType] = useState<"active" | "archived">("active");

  useEffect(() => {
    // Determine statuses to fetch. Active tab shows 'active' AND 'cancelled'.
    // Archived tab shows 'archived'.
    const targetStatuses = filterType === "active" ? ["active", "cancelled"] : ["archived"];

    const fetchFallback = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "social_events"), where("status", "in", targetStatuses))
        );
        console.warn("[social_events] list fallback (no index)", snap.size);
        const next: SocialEvent[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as any;
          next.push({
            id: docSnap.id,
            title: data?.title ?? "Evento social",
            meetingPlaceText: data?.meetingPlaceText ?? null,
            organizerName: data?.organizerName ?? null,
            startAt: data?.startAt ?? null,
            participantsCount: data?.participantsCount ?? null,
            status: data?.status,
          });
        });
        next.sort((a, b) => {
          const diff = (toMillisSafe(a.startAt) ?? 0) - (toMillisSafe(b.startAt) ?? 0);
          return filterType === "archived" ? -diff : diff;
        });
        setItems(next);
      } catch (err: any) {
        console.error("[social_events] fallback failed", err);
        Alert.alert("Errore", err?.message ?? "Impossibile caricare gli eventi.");
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    const q = query(
      collection(db, "social_events"),
      where("status", "in", targetStatuses),
      orderBy("startAt", filterType === "archived" ? "desc" : "asc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (__DEV__ && snap.empty) info("social_events empty snapshot", { filterType });
        const next: SocialEvent[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as any;
          next.push({
            id: docSnap.id,
            title: data?.title ?? "Evento social",
            meetingPlaceText: data?.meetingPlaceText ?? null,
            organizerName: data?.organizerName ?? null,
            startAt: data?.startAt ?? null,
            participantsCount: data?.participantsCount ?? null,
            status: data?.status,
          });
        });
        setItems(next);
        setLoading(false);
      },
      (err) => {
        console.error("[social_events] list failed", err);
        if (err?.message?.includes("requires an index")) {
          // If index missing, use fallback client-side sort
          void fetchFallback();
          return;
        }
        Alert.alert("Errore", err?.message ?? "Impossibile caricare gli eventi.");
        setItems([]);
        setLoading(false);
      }
    );
    return () => {
      try {
        unsub();
      } catch { }
    };
  }, [filterType]);

  const canCreate = isAdmin || isOwner;

  const filteredItems = useMemo(() => {
    if (!searchText.trim()) return items;
    const needle = normalizeForSearch(searchText);
    return items.filter((item) => {
      const title = normalizeForSearch(item.title);
      const meeting = normalizeForSearch(item.meetingPlaceText || "");
      const organizer = normalizeForSearch(item.organizerName || "");
      return title.includes(needle) || meeting.includes(needle) || organizer.includes(needle);
    });
  }, [items, searchText]);

  const handleOpenDetail = useCallback((eventId: string) => {
    navigation.navigate("SocialDetail", { eventId });
  }, [navigation]);

  const renderItem = useCallback(({ item }: { item: SocialEvent }) => (
    <SocialListItem item={item} onPress={handleOpenDetail} />
  ), [handleOpenDetail]);

  const empty = useMemo(() => (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyText}>Nessun evento social disponibile.</Text>
    </View>
  ), []);

  const listHeader = useMemo(() => (
    <View style={styles.headerBlock}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color="#94a3b8" />
        <TextInput
          style={styles.searchInput}
          placeholder="Cerca evento..."
          placeholderTextColor="#9ca3af"
          value={searchText}
          onChangeText={setSearchText}
        />
        {searchText.length > 0 && (
          <Pressable
            onPress={() => {
              setSearchText("");
              Keyboard.dismiss();
            }}
            style={styles.searchClear}
            hitSlop={10}
          >
            <Ionicons name="close-circle" size={18} color="#94a3b8" />
          </Pressable>
        )}
      </View>

      <View style={styles.segmented}>
        <Pressable
          style={[styles.segmentedTab, filterType === "active" && styles.segmentedTabActive]}
          onPress={() => setFilterType("active")}
        >
          <Text style={[styles.segmentedText, filterType === "active" && styles.segmentedTextActive]}>
            Attivi
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segmentedTab, filterType === "archived" && styles.segmentedTabActive]}
          onPress={() => setFilterType("archived")}
        >
          <Text style={[styles.segmentedText, filterType === "archived" && styles.segmentedTextActive]}>
            Archiviati
          </Text>
        </Pressable>
      </View>

      <View style={styles.resultsMeta}>
        <View />
        <Text style={styles.resultsCount}>
          {filteredItems.length} {filteredItems.length === 1 ? "evento" : "eventi"}
        </Text>
      </View>
    </View>
  ), [filterType, filteredItems.length, searchText]);

  return (
    <Screen useNativeHeader scroll={false} backgroundColor="#FDFCF8">
      <ScreenHeader
        title="SOCIAL"
        subtitle="Meetup e eventi"
        showBack
        backIconColor={UI.colors.eventSocial}
        headerIcon="account-group-outline"
        headerIconColor={UI.colors.eventSocial}
        rightAction={
          canCreate ? (
            <Pressable
              onPress={() => navigation.navigate("SocialEdit", { mode: "create" })}
              style={[styles.addButton, { backgroundColor: UI.colors.eventSocial }]}
              accessibilityRole="button"
              accessibilityLabel="Crea nuovo evento social"
            >
              <Ionicons name="add" size={22} color="#fff" />
            </Pressable>
          ) : null
        }
      />
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyBox}>
              <ActivityIndicator color={UI.colors.primary} />
            </View>
          ) : (
            empty
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  listContent: { paddingBottom: 100, paddingHorizontal: 16, paddingTop: 8 },
  headerBlock: {
    marginBottom: 16,
    gap: 12,
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
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#0f172a",
    marginLeft: 8,
  },
  searchClear: {
    padding: 4,
  },
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
  resultsMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 4 },
  resultsCount: { fontSize: 13, fontWeight: "600", color: "#64748B" },
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
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  badgeIcon: { fontSize: 12 },
  badgeText: { fontSize: 13, fontWeight: "700", color: "#059669" },
  emptyBox: { padding: 40, alignItems: "center", justifyContent: "center" },
  emptyText: { fontWeight: "600", color: UI.colors.muted },
});
