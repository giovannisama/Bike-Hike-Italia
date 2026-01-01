import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Image, ActivityIndicator } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { LinearGradient } from "expo-linear-gradient";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen, UI } from "../components/Screen";
import useCurrentProfile from "../hooks/useCurrentProfile";
import useActiveSocialCount from "../hooks/useActiveSocialCount";
import { auth, db } from "../firebase";
import { loadBoardLastSeen } from "../utils/boardStorage";
import useMedicalCertificate from "../hooks/useMedicalCertificate";
import { getCertificateStatus } from "../utils/medicalCertificate";
import type { MainTabParamList } from "../navigation/types";
import { EVENT_CATEGORY_SUBTITLES } from "../constants/eventCategorySubtitles";
import { EventGridCard, EventSection } from "../components/EventGridCard";

const logo = require("../../assets/images/logo.jpg");

type BoardPreviewItem = {
  id: string;
  title: string;
  createdAt: Date | null;
  imageUrl?: string | null;
  imageBase64?: string | null;
};

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

function useBoardPreview(lastSeen: Date | null, enabled: boolean) {
  const [items, setItems] = useState<BoardPreviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    if (!enabled) {
      if (permissionDenied) setPermissionDenied(false);
      setItems([]);
      setLoading(false);
      setUnread(0);
      return;
    }
    if (permissionDenied) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const q = query(collection(db, "boardPosts"), orderBy("createdAt", "desc"), limit(50));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: BoardPreviewItem[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as any;
          if (data?.archived === true) return;
          next.push({
            id: docSnap.id,
            title: data?.title ?? "",
            createdAt: data?.createdAt?.toDate?.() ?? null,
            imageUrl: data?.imageUrl ?? null,
            imageBase64: data?.imageBase64 ?? null,
          });
        });
        setItems(next);
        setLoading(false);
        if (!lastSeen) {
          setUnread(next.length);
        } else {
          let count = 0;
          next.forEach((item) => {
            if (!item.createdAt) return;
            if (item.createdAt.getTime() > lastSeen.getTime()) count += 1;
          });
          setUnread(count);
        }
      },
      (err) => {
        const isPermissionError = (err?.code as string | undefined)?.toLowerCase() === "permission-denied";
        if (isPermissionError) {
          setPermissionDenied(true);
        } else if (__DEV__) {
          console.warn("[Home] board preview error:", err);
        }
        setItems([]);
        setLoading(false);
        setUnread(0);
      }
    );
    return () => {
      try {
        unsub();
      } catch { }
    };
  }, [lastSeen?.getTime(), enabled, permissionDenied]);

  const preview = useMemo(() => items.slice(0, 3), [items]);

  return { preview, loading, unreadCount: unread };
}

// EventRow component removed in favor of EventGridCard


export default function HomeScreen({ navigation }: any) {
  const { profile, isAdmin, isOwner, canSeeCiclismo, canSeeTrekking } =
    useCurrentProfile();
  const activeCount = useActiveRidesCount();
  const socialActiveCount = useActiveSocialCount();
  const rootNav = navigation?.getParent?.() ?? navigation;

  const [boardLastSeen, setBoardLastSeen] = useState<Date | null>(null);
  const userUid = auth.currentUser?.uid ?? null;
  const boardPreviewAllowed =
    !!profile &&
    profile.approved === true &&
    profile.disabled !== true &&
    !!userUid;

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      (async () => {
        if (!userUid) {
          if (mounted) setBoardLastSeen(null);
          return;
        }
        const lastSeen = await loadBoardLastSeen(userUid);
        if (mounted) setBoardLastSeen(lastSeen);
      })();
      return () => {
        mounted = false;
      };
    }, [userUid])
  );

  const { preview: boardPreview, loading: boardLoading, unreadCount } = useBoardPreview(
    boardLastSeen,
    boardPreviewAllowed
  );

  const { certificate } = useMedicalCertificate();
  const certificateStatus = useMemo(() => getCertificateStatus(certificate), [certificate]);
  const showCertCard = certificateStatus.kind === "warning" || certificateStatus.kind === "expired";
  const certLabel =
    certificateStatus.kind === "expired" ? "Certificato scaduto" : "Certificato in scadenza";

  const firstName = (profile?.firstName ?? "").trim();
  const rawNickname = (profile?.nickname ?? "").trim();
  // Remove starting @ if present to satisfy requirement
  const nickname = rawNickname.replace(/^@/, "");

  const fallbackDisplay =
    auth.currentUser?.displayName?.trim() ||
    (auth.currentUser?.email ? auth.currentUser.email.split("@")[0] : "") ||
    "Utente";

  const greetingName = firstName || fallbackDisplay;

  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 16) + 32;

  // --- GRID LAYOUT LOGIC ---
  const [gridWidth, setGridWidth] = useState<number | null>(null);
  const gridGap = 12;
  const cardWidth = gridWidth ? Math.floor((gridWidth - gridGap) / 2) : 0;

  const iconMap: Record<string, { name: string; color: string }> = {
    bici: { name: "bike", color: UI.colors.eventCycling },
    trekking: { name: "hiking", color: UI.colors.eventTrekking },
    bikeaut: { name: "bike-fast", color: UI.colors.disabled },
    social: { name: "account-group-outline", color: UI.colors.eventSocial },
    viaggi: { name: "bag-checked", color: UI.colors.eventTravel },
  };

  const sections: EventSection[] = [
    {
      id: "bici",
      title: "Ciclismo",
      caption: EVENT_CATEGORY_SUBTITLES.ciclismo,
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
      caption: EVENT_CATEGORY_SUBTITLES.trekking,
      icon: iconMap.trekking.name,
      iconColor: iconMap.trekking.color,
      badge: 0,
      enabled: true,
      permissionKey: "trekking",
      onPress: () => rootNav.navigate("TrekkingPlaceholder"),
    },
    {
      id: "viaggi",
      title: "Viaggi",
      caption: "Scopri il mondo",
      icon: iconMap.viaggi.name,
      iconColor: iconMap.viaggi.color,
      badge: 0,
      enabled: true,
      onPress: () => rootNav.navigate("ViaggiPlaceholder"),
    },
    {
      id: "social",
      title: "Social",
      caption: EVENT_CATEGORY_SUBTITLES.social,
      icon: iconMap.social.name,
      iconColor: iconMap.social.color,
      badge: socialActiveCount ?? 0,
      enabled: true,
      onPress: () => rootNav.navigate("SocialList"),
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
      id: "spacer-1",
      title: "",
      caption: "",
      icon: "",
      enabled: true,
      invisible: true,
    },
  ];

  /* 
   * Filter logic similar to EventiHub but simpler since Home shows all options 
   * (even disabled ones are shown as disabled cards in Grid now, matching EventiHub visual).
   * Note: Original Home code showed ALL items in list.
   * If user wants "identical to EventiHub", they might mean showing valid ones?
   * "mantenere la stessa lista/ordine categorie attuale della Home" implies showing all.
   * So we render all 'sections'. 
   */


  // Header Gradient logic: subtle decoration
  return (
    <Screen useNativeHeader scroll keyboardShouldPersistTaps="handled" avoidKeyboard={false} backgroundColor="#FDFCF8">
      {/* Decorative Header Gradient Background */}
      <View style={styles.headerGradientContainer}>
        <LinearGradient
          colors={["rgba(20, 83, 45, 0.08)", "rgba(14, 165, 233, 0.08)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={[styles.page, { paddingBottom: bottomPadding }]}>

        {/* HEADER */}
        <View style={styles.headerSection}>
          <View style={styles.headerRow}>
            {/* Logo: clean, no borders */}
            <Image source={logo} style={styles.logoImage} />

            {/* Icon Info removed as requested */}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={styles.appTitle}>Bike and Hike Italia</Text>
            {isAdmin && (
              <View style={[styles.roleChip, isOwner ? styles.roleChipOwner : styles.roleChipAdmin]}>
                <Text style={styles.roleChipText}>{isOwner ? "OWNER" : "ADMIN"}</Text>
              </View>
            )}
          </View>

          <View style={styles.greetingContainer}>
            <Text style={styles.greetingTitle}>Bentornato, {greetingName}!</Text>
            {!!nickname && <Text style={styles.greetingSubtitle}>{nickname}</Text>}
          </View>
        </View>

        {showCertCard && (
          <Pressable
            onPress={() => rootNav.navigate("Profile")}
            style={({ pressed }) => [styles.unifiedCard, styles.certCard, pressed && { opacity: 0.95 }]}
          >
            <View style={styles.eventRow}>
              <View style={styles.certIconBox}>
                <MaterialCommunityIcons name="alert-circle" size={22} color="#92400E" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.certText}>{certLabel}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#92400E" />
            </View>
          </Pressable>
        )}

        {isOwner && (
          <Pressable
            onPress={() =>
              navigation.navigate("Amministrazione")
            }
            style={({ pressed }) => [styles.adminCard, pressed && { opacity: 0.95 }]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View style={styles.infoIconBox}>
                <Ionicons name="settings-outline" size={24} color="#0F172A" />
              </View>
              <View>
                <Text style={styles.adminText}>Amministrazione</Text>
                <Text style={styles.infoSubtitle} numberOfLines={1} ellipsizeMode="tail">
                  Gestione utenti e permessi
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#0F172A" />
          </Pressable>
        )}

        {/* INFO CARD (Visible to all) */}
        <Pressable
          onPress={() =>
            navigation.navigate("Info")
          }
          style={({ pressed }) => [styles.infoCard, pressed && { opacity: 0.95 }]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View style={styles.infoIconBox}>
              <Ionicons name="information" size={24} color="#0F766E" />
            </View>
            <View>
              <Text style={styles.infoTitle}>Informazioni</Text>
              <Text style={styles.infoSubtitle}>Dati e contatti dell’associazione</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </Pressable>

        {/* EVENTI SECTION - Unified container */}
        {/* EVENTS GRID SECTION */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Eventi</Text>
        </View>

        <View
          onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
        >
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
            {sections.map((item) => (
              <EventGridCard key={item.id} item={item} cardWidth={cardWidth} />
            ))}
          </View>
        </View>

        {/* BACHECA SECTION */}
        <View style={styles.sectionContainer}>
          <Pressable
            onPress={() => navigation.navigate("TabBacheca")}
            style={({ pressed }) => [styles.sectionHeaderRow, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.sectionTitle}>Bacheca</Text>
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreadCount}</Text>
            </View>
            <View style={{ flex: 1 }} />
            <Ionicons name="chevron-forward" size={18} color={UI.colors.text} />
          </Pressable>

          {boardLoading ? (
            <View style={styles.loaderRow}>
              <ActivityIndicator />
              <Text style={{ marginLeft: 8, color: UI.colors.muted }}>Caricamento…</Text>
            </View>
          ) : boardPreview.length === 0 ? (
            <Pressable onPress={() => navigation.navigate("TabBacheca")} style={({ pressed }) => [styles.emptyCard, pressed && { opacity: 0.92 }]}>
              <Text style={styles.emptyText}>Nessuna news disponibile.</Text>
            </Pressable>
          ) : (
            <View style={styles.unifiedCard}>
              {boardPreview.map((item, index) => {
                const isFirst = index === 0;
                return (
                  <View key={item.id}>
                    <Pressable
                      onPress={() => rootNav.navigate("BoardPostDetail", { postId: item.id, title: item.title })}
                      style={({ pressed }) => [
                        styles.newsRow,
                        pressed && { backgroundColor: "#F8FAFC" }
                      ]}
                    >
                      {/* Thumbnail Left */}
                      {item.imageUrl || item.imageBase64 ? (
                        <Image
                          source={{ uri: item.imageBase64 ? `data:image/jpeg;base64,${item.imageBase64}` : item.imageUrl as string }}
                          style={styles.newsThumb}
                        />
                      ) : (
                        <View style={styles.newsIconPlaceholder}>
                          <Ionicons name="newspaper-outline" size={20} color="#94A3B8" />
                        </View>
                      )}

                      <View style={{ flex: 1, paddingVertical: 4 }}>
                        <Text
                          numberOfLines={2}
                          ellipsizeMode="tail"
                          style={[styles.newsTitle, isFirst && styles.newsTitleHighlight]}
                        >
                          {item.title || "News"}
                        </Text>
                        {/* Optional date or simple text if needed, keeping it clean for now */}
                      </View>
                    </Pressable>
                    {index < boardPreview.length - 1 && <View style={styles.rowDivider} />}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </View>
    </Screen >
  );
}

const styles = StyleSheet.create({
  page: {
    gap: 24,
    // Background is handled by Screen style wrapper
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  headerGradientContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 240, // Fade out after header area
  },
  headerSection: {
    gap: 8,
    marginTop: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  logoImage: {
    width: 60,
    height: 60,
    resizeMode: "contain",
  },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  roleChipAdmin: {
    backgroundColor: "#FCE7F3", // Pink-100
  },
  roleChipOwner: {
    backgroundColor: "#DBEAFE", // Blue-100
  },
  roleChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F172A",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  appTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  greetingContainer: {
    gap: 2,
  },
  greetingTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1E293B", // Slate-800
    letterSpacing: -0.5,
  },
  greetingSubtitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#64748B", // Slate-500
  },

  // ADMIN CARD
  adminCard: {
    backgroundColor: "#EFF6FF", // Blue-50
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderLeftWidth: 4,
    borderLeftColor: "#0F766E", // Teal-700
    shadowColor: "#0F766E",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  adminText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
  },

  // CERT CARD
  certCard: {
    borderLeftWidth: 4,
    borderLeftColor: "#F59E0B",
  },
  certIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  certText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#92400E",
  },

  // SECTIONS
  sectionContainer: {
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#334155", // Slate-700
  },
  headerBadge: {
    marginLeft: 8,
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  headerBadgeText: {
    color: "#0369A1",
    fontSize: 12,
    fontWeight: "700",
  },

  // UNIFIED CARD CONTAINER
  unifiedCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#F1F5F9", // Slate-100
    paddingVertical: 4,
    shadowColor: "#64748B",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    overflow: "hidden", // for internal dividers
  },

  // EVENT ROW
  eventRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  eventRowDisabled: {
    // opacity handled by icons
  },
  rowDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginLeft: 76, // Align with text start
  },
  eventIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderWidth: 1,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
  },
  eventTitleDisabled: {
    color: "#94A3B8",
  },
  eventCaption: {
    marginTop: 1,
    color: "#64748B",
    fontSize: 13,
    fontWeight: "500",
  },
  eventRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#E0F2FE", // Sky-100
    alignItems: "center",
    justifyContent: "center",
  },
  badgeDisabled: {
    backgroundColor: "#F1F5F9",
  },
  badgeText: {
    color: "#0369A1", // Sky-700
    fontWeight: "700",
    fontSize: 13,
  },

  // NEWS / BOARD
  loaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 20,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
  },
  emptyText: {
    fontWeight: "600",
    color: "#64748B",
  },

  newsRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  newsThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#E2E8F0",
  },
  newsIconPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  newsTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#334155",
    lineHeight: 20,
  },
  newsTitleHighlight: {
    fontWeight: "700",
    color: "#1E293B",
    fontSize: 16,
  },

  // INFO CARD
  infoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    borderLeftWidth: 4,
    borderLeftColor: "#0F766E", // Teal-700 (Same as Admin)
    shadowColor: "#64748B", // Softer shadow than Admin
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  infoIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#CCFBF1", // Teal-100
    alignItems: "center",
    justifyContent: "center",
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
  },
  infoSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#64748B",
  },
});
