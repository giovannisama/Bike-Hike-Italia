import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, FlatList } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { collection, onSnapshot } from "firebase/firestore";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen, UI } from "../components/Screen";
import { db } from "../firebase";
import { LinearGradient } from "expo-linear-gradient";
import useCurrentProfile from "../hooks/useCurrentProfile";
import AccessDenied from "../components/AccessDenied";

// ------------------------------------------------------------------
// HOOK: useActiveRidesCount (Local)
// ------------------------------------------------------------------
function useActiveRidesCount() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "rides"),
      (snap) => {
        let c = 0;
        snap.forEach((docSnap) => {
          const d = docSnap.data() as any;
          const archived = d?.archived === true;
          const status = (d?.status ?? "active") as string;
          if (!archived && status !== "cancelled") c += 1;
        });
        setCount(c);
      },
      () => setCount(null)
    );
    return () => unsub();
  }, []);

  return count;
}

// ------------------------------------------------------------------
// COMPONENTS: Cards
// ------------------------------------------------------------------
type EventSection = {
  id: string;
  title: string;
  subtitle?: string; // For Hero
  caption: string;   // For Grid/List
  icon: any;         // MaterialCommunityIcons name
  badge?: number | null;
  enabled: boolean;
  permissionKey?: "ciclismo" | "trekking" | "bikeaut";
  onPress?: () => void;
};

// 1. HERO CARD (Used when only 1 section is enabled)
function HeroCard({ item }: { item: EventSection }) {
  return (
    <Pressable
      onPress={item.enabled ? item.onPress : undefined}
      style={({ pressed }) => [
        styles.heroCard,
        { borderTopColor: item.enabled ? item.iconColor : "#E2E8F0", borderTopWidth: 4 },
        pressed && item.enabled && { opacity: 0.95, transform: [{ scale: 0.99 }] },
      ]}
    >
      <View style={styles.heroContent}>
        <View style={styles.heroIconCircle}>
          <MaterialCommunityIcons
            name={item.icon}
            size={32}
            color={item.enabled ? item.iconColor ?? UI.colors.primary : "#94A3B8"}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>{item.title}</Text>
          <Text style={styles.heroSubtitle}>{item.subtitle || item.caption}</Text>
        </View>
        {typeof item.badge === "number" && (
          <View style={styles.badgeSoft}>
            <Text style={styles.badgeSoftText}>{item.badge}</Text>
          </View>
        )}
      </View>
      <View style={styles.heroFooter}>
        <Text style={styles.heroActionText}>Vai alla sezione</Text>
        <Ionicons name="arrow-forward" size={16} color={UI.colors.primary} />
      </View>
    </Pressable>
  );
}

// 2. GRID CARD (Used when 2+ sections are enabled)
function GridCard({ item, cardWidth }: { item: EventSection; cardWidth: number }) {
  return (
    <Pressable
      onPress={item.enabled ? item.onPress : undefined}
      style={({ pressed }) => [
        styles.gridCard,
        { width: cardWidth, borderTopColor: item.enabled ? item.iconColor : "#E2E8F0", borderTopWidth: 4 },
        !item.enabled && styles.gridCardDisabled,
        pressed && item.enabled && { opacity: 0.9, transform: [{ scale: 0.98 }] },
      ]}
    >
      <View style={styles.gridHeader}>
        <View style={[styles.gridIcon, !item.enabled && { backgroundColor: "#F1F5F9" }]}>
          <MaterialCommunityIcons
            name={item.icon}
            size={24}
            color={item.enabled ? item.iconColor ?? UI.colors.primary : "#94A3B8"}
          />
        </View>
        {typeof item.badge === "number" && item.enabled && (
          <View style={styles.badgeSoft}>
            <Text style={styles.badgeSoftText}>{item.badge}</Text>
          </View>
        )}
      </View>

      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Text style={[styles.gridTitle, !item.enabled && { color: "#94A3B8" }]}>
          {item.title}
        </Text>
        <Text style={[styles.gridCaption, !item.enabled && { color: "#CBD5E1" }]}>
          {item.caption}
        </Text>
      </View>
    </Pressable>
  );
}

// ------------------------------------------------------------------
// MAIN SCREEN
// ------------------------------------------------------------------
export default function EventiHubScreen({ navigation }: any) {
  const {
    enabledSectionsNormalized,
    canSeeCiclismo,
    canSeeTrekking,
    canSeeBikeAut,
    loading: profileLoading,
  } = useCurrentProfile();
  const activeCount = useActiveRidesCount();
  const rootNav = navigation?.getParent?.() ?? navigation;
  const insets = useSafeAreaInsets();
  const [gridWidth, setGridWidth] = useState<number | null>(null);
  const gridGap = 12;
  const cardWidth =
    gridWidth
      ? Math.floor((gridWidth - gridGap) / 2)
      : undefined;

  const iconMap: Record<string, { name: string; color: string }> = {
    bici: { name: "bike", color: "#16a34a" }, // Green Action
    trekking: { name: "hiking", color: "#e11d48" }, // Rose
    bikeaut: { name: "bike-fast", color: "#4f46e5" }, // Indigo
    viaggi: { name: "bag-checked", color: "#d97706" }, // Amber
  };

  const hasOverrides = enabledSectionsNormalized !== null;
  const anyAllowed = canSeeCiclismo || canSeeTrekking || canSeeBikeAut;
  if (!profileLoading && hasOverrides && !anyAllowed) {
    return (
      <AccessDenied message="Non hai sezioni eventi abilitate per questo profilo." showBack={false} />
    );
  }

  // Sections Data
  const sections: EventSection[] = [
    {
      id: "bici",
      title: "Ciclismo",
      subtitle: "Gestisci o partecipa alle uscite in Mtb ed E-Bike.",
      caption: "Uscite attive",
      icon: iconMap.bici.name,
      iconColor: iconMap.bici.color,
      badge: activeCount ?? 0,
      enabled: true,
      permissionKey: "ciclismo",
      onPress: () => rootNav.navigate("UsciteList"),
    },
    {
      id: "trekking",
      title: "Trekking",
      subtitle: "Escursioni a piedi nella natura.",
      caption: "In arrivo",
      icon: iconMap.trekking.name,
      iconColor: iconMap.trekking.color,
      badge: 0,
      enabled: true, // As per prompt requirement to keep original behavior (it was enabled)
      permissionKey: "trekking",
      onPress: () => rootNav.navigate("TrekkingPlaceholder"),
    },
    {
      id: "bikeaut",
      title: "Bike Aut",
      caption: "COMING SOON",
      icon: iconMap.bikeaut.name,
      iconColor: iconMap.bikeaut.color,
      badge: null,
      enabled: false,
      permissionKey: "bikeaut",
    },
    {
      id: "viaggi",
      title: "Viaggi",
      caption: "COMING SOON",
      icon: iconMap.viaggi.name,
      iconColor: iconMap.viaggi.color,
      badge: null,
      enabled: false,
    },
  ];

  const permissionMap = {
    ciclismo: canSeeCiclismo,
    trekking: canSeeTrekking,
    bikeaut: canSeeBikeAut,
  } as const;

  const visibleSections = hasOverrides
    ? sections.filter((section) => {
      const key = section.permissionKey as keyof typeof permissionMap | undefined;
      if (!key) return true;
      return permissionMap[key];
    })
    : sections;

  const enabledSections = visibleSections.filter(s => s.enabled);
  const disabledSections = visibleSections.filter(s => !s.enabled);
  const renderGridItem = ({ item }: { item: EventSection }) => (
    <GridCard item={item} cardWidth={cardWidth} />
  );

  return (
    <Screen
      useNativeHeader
      scroll
      style={{ backgroundColor: "#FDFCF8" }}
      backgroundColor="#FDFCF8"
    >
      <View style={styles.headerGradientContainer}>
        <LinearGradient
          colors={["rgba(20, 83, 45, 0.08)", "rgba(14, 165, 233, 0.08)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={styles.pageContent}>
        {/* 1. STANDARD HEADER */}
        <View style={[styles.headerContainer, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.pageTitle}>Eventi</Text>
          <Text style={styles.pageSubtitle}>Scegli una categoria</Text>
        </View>

        <View style={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}>

          {/* 2. ADAPTIVE LAYOUT */}
          {enabledSections.length === 1 ? (
            // HERO LAYOUT
            <View style={styles.heroContainer}>
              {enabledSections.map(item => <HeroCard key={item.id} item={item} />)}
            </View>
          ) : (
            // GRID LAYOUT
            <View
              style={styles.gridWrapper}
              onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
            >
              <FlatList
                data={enabledSections}
                renderItem={renderGridItem}
                keyExtractor={(item) => item.id}
                numColumns={2}
                columnWrapperStyle={styles.gridRow}
                contentContainerStyle={styles.enabledGridContent}
                scrollEnabled={false}
                extraData={cardWidth}
              />
            </View>
          )}

          {/* 3. DISABLED SECTIONS (Always Grid style or List style? Grid looks better) */}
          {disabledSections.length > 0 && (
            <>
              <View style={styles.divider} />
              <Text style={styles.sectionLabel}>In arrivo</Text>
              <View style={styles.gridWrapper}>
                <FlatList
                  data={disabledSections}
                  renderItem={renderGridItem}
                  keyExtractor={(item) => item.id}
                  numColumns={2}
                  columnWrapperStyle={styles.gridRow}
                  scrollEnabled={false}
                  extraData={cardWidth}
                />
              </View>
            </>
          )}

        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // HEADER
  headerContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    marginTop: 8,
    // Removed white wrapper: rely on header background/gradient only
  },
  pageContent: {
    gap: 16,
  },
  headerGradientContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  // BODY
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 0,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: UI.colors.text,
    letterSpacing: -1,
  },
  pageSubtitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#64748B",
    marginTop: 4,
  },

  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 24,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 16,
  },

  // HERO CARD
  heroContainer: {
    gap: 16,
    marginTop: 32,
  },
  heroCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    // Shadow
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  heroContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 20,
  },
  heroIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#F0F9FF", // sky-50
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: UI.colors.text,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: "#64748B",
    lineHeight: 20,
  },
  heroFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  heroActionText: {
    fontSize: 14,
    fontWeight: "700",
    color: UI.colors.primary,
  },

  // GRID CARD
  gridWrapper: {
    width: "100%",
  },
  enabledGridContent: {
    paddingTop: 32,
  },
  gridRow: {
    justifyContent: "space-between",
    marginBottom: 12,
  },
  gridCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    minHeight: 140, // consistent height
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 12, // vertical spacing
  },
  gridCardDisabled: {
    backgroundColor: "#FDFCF8", // lighter, slightly diff
    borderColor: "#F1F5F9",
    shadowOpacity: 0,
    elevation: 0,
  },
  gridHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  gridIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#F0F9FF",
    alignItems: "center",
    justifyContent: "center",
  },
  gridTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: UI.colors.text,
    marginBottom: 4,
  },
  gridCaption: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },

  // BADGE SOFT
  badgeSoft: {
    backgroundColor: "#E0F2FE", // Sky-100
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#BAE6FD",
    alignSelf: "flex-start",
  },
  badgeSoftText: {
    color: "#0284C7", // Sky-700
    fontSize: 12,
    fontWeight: "700",
  },
});
