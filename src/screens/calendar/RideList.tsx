import React from "react";
import {
  FlatList,
  View,
  TouchableOpacity,
  Text,
  StyleProp,
  ViewStyle,
  Pressable,
  StyleSheet,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons"; // ADDED
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Ride } from "./types";
import { UI } from "../../components/Screen";
import { getBikeCategoryLabel } from "./bikeType";
import { getDifficultyMeta } from "../../utils/rideDifficulty";
import { deriveGuideSummary } from "../../utils/guideHelpers";
import { StatusBadge } from "./StatusBadge";
import { DifficultyBadge } from "./DifficultyBadge"; // ADDED

// Helper to render the circle icon matching Home Screen style
const CategoryIcon = ({ name, color }: { name: any; color: string }) => (
  <View
    style={{
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      borderColor: color,
      borderWidth: 1,
      marginRight: 0,
    }}
  >
    <MaterialCommunityIcons name={name} size={20} color={color} />
  </View>
);



const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  badgeWrap: {
    flexShrink: 0,
    alignSelf: "flex-start",
    maxWidth: 140,
    overflow: "hidden",
  },
  title: {
    fontWeight: "700",
    color: "#111",
    fontSize: 16,
    lineHeight: 22,
  },
  metaLabel: {
    color: "#6B7280",
    fontSize: 12,
  },
  metaBlock: {
    marginTop: 8,
  },
  metaValue: {
    color: "#111827",
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  difficultyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  chipsTop: {
    marginTop: 0,
    marginBottom: 8,
  },
  chip: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#F1F5F9",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipText: {
    color: "#0F172A",
    fontWeight: "600",
    fontSize: 12,
  },
  centerRow: { padding: 12, alignItems: "center", justifyContent: "center" },
});

export type RideListProps = {
  data: Ride[];
  onSelect: (ride: Ride) => void;
  contentContainerStyle: StyleProp<ViewStyle>;
  indicatorInsets: { bottom: number };
  listRef?: React.RefObject<FlatList<Ride> | null>;
  emptyMessage?: string;
  onClearFilters?: () => void;
  showDate?: boolean;
  listFooterComponent?: React.ReactElement | null;
  scrollEnabled?: boolean;
};

export function RideList({
  data,
  onSelect,
  contentContainerStyle,
  indicatorInsets,
  listRef,
  emptyMessage,
  onClearFilters,
  showDate,
  listFooterComponent,
  scrollEnabled = true,
}: RideListProps) {
  return (
    <FlatList
      ref={listRef}
      style={{ flex: 1 }}
      scrollEnabled={scrollEnabled}
      data={data}
      keyExtractor={(item) => item.id}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      renderItem={({ item }) => {
        const isArchived = !!item.archived;
        const guideSummary = deriveGuideSummary({
          guidaName: item.guidaName ?? null,
          guidaNames: item.guidaNames ?? undefined,
        });
        const guidaLabel = guideSummary.all.length > 0 ? guideSummary.all.join("; ") : "—";
        const difficultyMeta = getDifficultyMeta(item.difficulty);

        // Handle Trek vs Ride
        const isTrek = item.kind === "trek";
        const bikeCategoryRaw = !isTrek ? getBikeCategoryLabel(item) : "";
        const bikeCategory = bikeCategoryRaw === "Altro" ? "MTB/Gravel" : bikeCategoryRaw;

        // FIX: Chip should say "Trekking", NOT difficulty
        const categoryLabel = isTrek ? "Trekking" : bikeCategory;
        const categoryIcon = isTrek ? "walk" : "bicycle";

        // FIX: Resolve difficulty from trek object if missing on root
        const displayDifficulty = item.difficulty ?? item.trek?.difficulty;

        const statusBadge = isArchived || item.status === "archived" ? (
          <StatusBadge status="archived" />
        ) : (
          <StatusBadge status={item.status === "cancelled" ? "cancelled" : "active"} />
        );

        let dateLabel = null;
        if (showDate) {
          const d = item.dateTime?.toDate?.() ?? item.date?.toDate?.();
          if (d) {
            // Formato IT: "10 gennaio 2026"
            dateLabel = format(d, "d MMMM yyyy", { locale: it });
          }
        }

        // Icon Logic for Card Header (Left)
        const displayIconName = isTrek ? "hiking" : "bike";
        const displayIconColor = isTrek ? UI.colors.eventTrekking : UI.colors.eventCycling;

        return (
          <TouchableOpacity style={styles.card} onPress={() => onSelect(item)}>
            {/* LEFT ICON */}
            <CategoryIcon name={displayIconName} color={displayIconColor} />

            <View style={{ flex: 1 }}>
              <View style={[styles.chipsRow, styles.chipsTop]}>
                {!isTrek && (
                  <View style={styles.chip}>
                    <Ionicons name={categoryIcon} size={14} color="#0F172A" />
                    <Text style={styles.chipText}>{categoryLabel}</Text>
                  </View>
                )}
                {statusBadge}
              </View>
              <View style={styles.headerRow}>
                <View style={styles.titleWrap}>
                  <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
                    {item.title || "Uscita"}
                  </Text>
                  {dateLabel && (
                    <Text style={{ fontSize: 13, color: "#64748B", marginTop: 2, fontWeight: "500" }}>
                      {dateLabel}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.metaBlock}>
                <Text style={styles.metaLabel} numberOfLines={1}>
                  Guida: <Text style={styles.metaValue}>{guidaLabel}</Text>
                </Text>
              </View>

              {/* Shared Difficulty Row (Cycling + Trekking) with Badge */}
              {displayDifficulty && (
                <View style={styles.metaBlock}>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Difficoltà:</Text>
                    <DifficultyBadge level={displayDifficulty} />
                  </View>
                </View>
              )}
            </View>
          </TouchableOpacity>
        );
      }}
      ListFooterComponent={listFooterComponent}
      ListEmptyComponent={
        <View style={[styles.centerRow, { paddingVertical: 40 }]}>
          <View style={{ alignItems: "center", gap: 12, paddingHorizontal: 24 }}>
            <Text style={{ color: "#64748B", textAlign: "center" }}>
              {emptyMessage || "Nessuna uscita disponibile."}
            </Text>
            {onClearFilters ? (
              <Pressable
                onPress={onClearFilters}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: "#111",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Rimuovi filtri</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      }
      initialNumToRender={10}
      windowSize={10}
      maxToRenderPerBatch={10}
      removeClippedSubviews={false}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator
      scrollIndicatorInsets={indicatorInsets}
    />
  );
}
