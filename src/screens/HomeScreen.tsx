import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Image, ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { signOut } from "firebase/auth";

import { Screen, UI } from "../components/Screen";
import useCurrentProfile from "../hooks/useCurrentProfile";
import { auth, db } from "../firebase";
import { loadBoardLastSeen } from "../utils/boardStorage";
import useMedicalCertificate from "../hooks/useMedicalCertificate";
import { getCertificateStatus } from "../utils/medicalCertificate";

const logo = require("../../assets/images/logo.jpg");

const VSpace = ({ size = "md" as keyof typeof UI.spacing }) => (
  <View style={{ height: UI.spacing[size] }} />
);

type ShortcutCardProps = {
  label: string;
  caption?: string;
  icon: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  badgeCount?: number | null;
  danger?: boolean;
  style?: ViewStyle;
  iconContainerStyle?: ViewStyle;
  statusBadge?: React.ReactNode;
};

function ShortcutCard({
  label,
  caption,
  icon,
  onPress,
  disabled = false,
  badgeCount,
  danger = false,
  style,
  iconContainerStyle,
  statusBadge,
}: ShortcutCardProps) {
  return (
    <Pressable
      onPress={() => {
        if (!disabled) onPress();
      }}
      style={({ pressed }) => [
        {
          width: "48%",
          backgroundColor: UI.colors.card,
          borderRadius: UI.radius.xl,
          paddingVertical: UI.spacing.md,
          paddingHorizontal: UI.spacing.sm,
          alignItems: "center",
          justifyContent: "center",
          gap: UI.spacing.sm,
          opacity: disabled ? 0.5 : 1,
          transform: [{ scale: pressed && !disabled ? 0.96 : 1 }],
          minHeight: 140,
        },
        style,
        UI.shadow.card,
      ]}
    >
      <View style={[styles.cardIconWrapper, iconContainerStyle]}>
        {icon}
        {statusBadge && <View style={styles.statusBadgeAnchor}>{statusBadge}</View>}
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        style={{
          width: "100%",
          fontSize: 16,
          fontWeight: "800",
          color: danger ? UI.colors.danger : UI.colors.text,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
      {!!caption && (
        <Text style={{ fontSize: 12, fontWeight: "600", color: UI.colors.muted, textAlign: "center" }}>
          {caption}
        </Text>
      )}
      {typeof badgeCount === "number" && (
        <View style={styles.cardBadgeCount}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12, textAlign: "center" }}>
            {badgeCount}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

type BoardPreviewItem = {
  id: string;
  title: string;
  imageUrl: string | null;
  createdAt: Date | null;
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

function useBoardPreview(lastSeen: Date | null) {
  const [items, setItems] = useState<BoardPreviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
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
            imageUrl: data?.imageUrl ?? null,
            createdAt: data?.createdAt?.toDate?.() ?? null,
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
        if (__DEV__) console.warn("[Home] board preview error:", err);
        setItems([]);
        setLoading(false);
        setUnread(0);
      }
    );
    return () => {
      try {
        unsub();
      } catch {}
    };
  }, [lastSeen?.getTime()]);

  const latest = useMemo(() => items[0] ?? null, [items]);

  return { latest, loading, unreadCount: unread };
}

const truncate = (value: string, max = 38) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

type CertificateBadgeTone = "warning" | "danger";

function CertificateStatusBadge({ tone }: { tone: CertificateBadgeTone }) {
  const label = tone === "warning" ? "Certificato medico in scadenza" : "Certificato medico scaduto";
  const toneStyle = tone === "warning" ? styles.certificateBadgeWarning : styles.certificateBadgeDanger;
  return (
    <View style={styles.certificateBadge} accessibilityRole="image" accessibilityLabel={label}>
      <View style={[styles.certificateBadgeDot, toneStyle]} />
    </View>
  );
}

export default function HomeScreen({ navigation }: any) {
  const user = auth.currentUser;
  const { profile, isAdmin, isOwner, loading } = useCurrentProfile();
  const activeCount = useActiveRidesCount();

  const [boardLastSeen, setBoardLastSeen] = useState<Date | null>(null);
  const userUid = user?.uid ?? null;

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

  const { latest: latestBoard, loading: boardLoading, unreadCount } = useBoardPreview(boardLastSeen);

  const { certificate } = useMedicalCertificate();
  const certificateStatus = useMemo(() => getCertificateStatus(certificate), [certificate]);
  const profileCaption =
    certificateStatus.kind === "warning"
      ? "Certificato medico in scadenza"
      : certificateStatus.kind === "expired"
      ? "Certificato medico scaduto"
      : "I tuoi dati";
  const profileBadge =
    certificateStatus.kind === "warning" ? (
      <CertificateStatusBadge tone="warning" />
    ) : certificateStatus.kind === "expired" ? (
      <CertificateStatusBadge tone="danger" />
    ) : null;

  const firstName = (profile?.firstName ?? "").trim();
  const lastName = (profile?.lastName ?? "").trim();
  const nickname = (profile?.nickname ?? "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

  const fallbackDisplay =
    user?.displayName?.trim() ||
    (user?.email ? user.email.split("@")[0] : "") ||
    "Ciclista";

  const formattedName = firstName && lastName ? `${lastName}, ${firstName}` : fullName || fallbackDisplay;
  const secondaryLine = nickname || user?.email || "";

  return (
    <Screen useNativeHeader scroll keyboardShouldPersistTaps="handled">
      <LinearGradient
        colors={[UI.colors.primary, "#146C43", UI.colors.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={{ gap: UI.spacing.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: UI.spacing.md }}>
            <View style={styles.heroLogoWrapper}>
              <Image source={logo} style={{ width: 48, height: 48, resizeMode: "contain" }} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 22, fontWeight: "900", color: "#fff" }}>Bike and Hike</Text>
              <Text
                style={{
                  fontSize: 14,
                  letterSpacing: 2,
                  fontWeight: "700",
                  color: UI.colors.accentWarm,
                }}
              >
                ITALIA
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 24, fontWeight: "900", color: "#fff" }}>{formattedName}</Text>
              {!!secondaryLine && (
                <Text
                  style={{
                    marginTop: 4,
                    fontSize: 16,
                    fontWeight: "600",
                    color: "#EAF7F0",
                  }}
                >
                  {secondaryLine}
                </Text>
              )}
            </View>
            {isAdmin && (
              <View
                style={{
                  backgroundColor: isOwner ? "#1D4ED8" : UI.colors.accent,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: UI.radius.round,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "800", color: "#fff" }}>
                  {isOwner ? "OWNER" : "ADMIN"}
                </Text>
              </View>
            )}
          </View>
        </View>
      </LinearGradient>

      {!loading && !(firstName || lastName || nickname) && (
        <Pressable
          onPress={() => navigation.navigate("Profile")}
          style={({ pressed }) => [
            {
              padding: 12,
              borderRadius: UI.radius.md,
              backgroundColor: UI.colors.warningBg,
              borderWidth: 1,
              borderColor: UI.colors.warningBorder,
              opacity: pressed ? 0.95 : 1,
            },
          ]}
        >
          <Text style={{ fontWeight: "700", color: "#7C2D12" }}>Completa il tuo profilo</Text>
          <Text style={{ color: "#7C2D12", marginTop: 4 }}>
            Aggiungi Nome, Cognome e (opzionale) Nickname per personalizzare il saluto.
          </Text>
        </Pressable>
      )}

      <VSpace size="lg" />

      <View style={styles.grid}>
        <ShortcutCard
          label="Uscite"
          caption="Calendario eventi"
          badgeCount={activeCount ?? undefined}
          icon={<MaterialCommunityIcons name="bike" size={32} color={UI.colors.primary} />}
          onPress={() => navigation.navigate("UsciteList")}
          iconContainerStyle={{ backgroundColor: "#E2F2E8" }}
          style={{ marginBottom: UI.spacing.md }}
        />

        <ShortcutCard
          label="Bacheca"
          caption={
            boardLoading ? "Caricamento…" : latestBoard ? truncate(latestBoard.title, 36) : "News e comunicazioni"
          }
          icon={
            <MaterialCommunityIcons
              name="newspaper-variant-outline"
              size={32}
              color={UI.colors.primary}
            />
          }
          onPress={() => navigation.navigate("Board")}
          iconContainerStyle={{ backgroundColor: "#E3F2FD" }}
          style={{ marginBottom: UI.spacing.md }}
          badgeCount={unreadCount > 0 ? unreadCount : undefined}
        />

        {isAdmin && (
          <ShortcutCard
            label="Nuova uscita"
            caption="Admin e Owner"
            icon={<MaterialCommunityIcons name="plus-circle-outline" size={32} color={UI.colors.accent} />}
            onPress={() => navigation.navigate("CreateRide")}
            iconContainerStyle={{ backgroundColor: "#FBE7F1" }}
            style={{ marginBottom: UI.spacing.md }}
          />
        )}

        <ShortcutCard
          label="Calendario"
          caption="Vista mensile"
          icon={<MaterialCommunityIcons name="calendar-month" size={32} color={UI.colors.accentWarm} />}
          onPress={() => navigation.navigate("Calendar")}
          iconContainerStyle={{ backgroundColor: "#FFF4DC" }}
          style={{ marginBottom: UI.spacing.md }}
        />

        {isOwner && (
          <ShortcutCard
            label="Amministrazione"
            caption="Solo Owner"
            icon={<MaterialCommunityIcons name="shield-lock-outline" size={32} color={UI.colors.accent} />}
            onPress={() => navigation.navigate("Amministrazione")}
            iconContainerStyle={{ backgroundColor: "#FBE7F1" }}
            style={{ marginBottom: UI.spacing.md }}
          />
        )}

        <ShortcutCard
          label="Profilo Utente"
          caption={profileCaption}
          icon={<MaterialCommunityIcons name="account" size={32} color={UI.colors.primary} />}
          onPress={() => navigation.navigate("Profile")}
          iconContainerStyle={{ backgroundColor: "#E6F0FA" }}
          style={{ marginBottom: UI.spacing.md }}
          statusBadge={profileBadge}
        />

        <ShortcutCard
          label="Esci"
          caption="Chiudi la sessione"
          icon={<MaterialCommunityIcons name="logout" size={32} color={UI.colors.danger} />}
          onPress={() => signOut(auth)}
          danger
          iconContainerStyle={{ backgroundColor: "#FDE8E8" }}
          style={{ marginBottom: UI.spacing.md }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: UI.radius.xl,
    padding: UI.spacing.lg,
    paddingBottom: UI.spacing.lg + 4,
    marginBottom: UI.spacing.lg,
  },
  heroLogoWrapper: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "rgba(0,0,0,0.25)",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  cardIconWrapper: {
    width: 62,
    height: 62,
    borderRadius: UI.radius.md,
    backgroundColor: UI.colors.tint,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  cardBadgeCount: {
    position: "absolute",
    top: 12,
    right: 16,
    minWidth: 24,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: UI.colors.accent,
  },
  statusBadgeAnchor: {
    position: "absolute",
    top: -6,
    right: -6,
    zIndex: 2,
    pointerEvents: "none",
  },
  certificateBadge: {
    backgroundColor: "#fff",
    borderRadius: UI.radius.round,
    padding: 3,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: UI.shadow.card.shadowColor,
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: UI.shadow.card.elevation,
  },
  certificateBadgeDot: {
    width: 16,
    height: 16,
    borderRadius: UI.radius.round,
  },
  certificateBadgeWarning: {
    backgroundColor: "#F97316",
  },
  certificateBadgeDanger: {
    backgroundColor: "#DC2626",
  },
});
