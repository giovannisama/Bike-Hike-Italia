// src/screens/HomeScreen.tsx
import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import useCurrentProfile from "../hooks/useCurrentProfile";
import { auth, db } from "../firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { Screen, UI } from "../components/Screen"; // ✔️ template condiviso

// ---- LOGO ----
const logo = require("../../assets/images/logo.jpg");

// ---- Spaziatore verticale (riuso semplice)
const VSpace = ({ size = "md" as keyof typeof UI.spacing }) => (
  <View style={{ height: UI.spacing[size] }} />
);

// ---- COMPONENTE: Tile (card/menu standard)
function Tile({
  title,
  subtitle,
  icon,
  onPress,
  badgeCount,
  danger = false,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  onPress: () => void;
  badgeCount?: number | null;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: "100%",
          backgroundColor: UI.colors.card,
          borderRadius: UI.radius.lg,
          padding: UI.spacing.md,
          flexDirection: "row",
          alignItems: "center",
          gap: UI.spacing.sm,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          shadowColor: UI.shadow.card.shadowColor,
          shadowOpacity: UI.shadow.card.shadowOpacity,
          shadowRadius: UI.shadow.card.shadowRadius,
          elevation: UI.shadow.card.elevation,
        },
      ]}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: UI.radius.md,
          backgroundColor: UI.colors.tint,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: danger ? UI.colors.danger : UI.colors.text }}>
            {title}
          </Text>
          {typeof badgeCount === "number" && (
            <View
              style={{
                minWidth: 22,
                height: 22,
                paddingHorizontal: 6,
                borderRadius: 11,
                backgroundColor: UI.colors.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12, lineHeight: 12 }}>
                {badgeCount}
              </Text>
            </View>
          )}
        </View>
        {!!subtitle && <Text style={{ marginTop: 2, color: UI.colors.muted }}>{subtitle}</Text>}
      </View>

      <Ionicons name="chevron-forward" size={22} />
    </Pressable>
  );
}

// -------------------------------------------------------------------------------------
// Hook locale: conta uscite attive (archived == false e status !== 'cancelled')
// -------------------------------------------------------------------------------------
function useActiveRidesCount() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "rides"),
      (snap) => {
        let c = 0;
        snap.forEach((docSnap) => {
          const d = docSnap.data() as any;
          const archived = d?.archived === true; // se manca -> false
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
// HOME SCREEN
// ------------------------------------------------------------------
export default function HomeScreen({ navigation }: any) {
  const user = auth.currentUser;
  const { profile, isAdmin, loading } = useCurrentProfile();
  const activeCount = useActiveRidesCount();

  const firstName = (profile?.firstName ?? "").trim();
  const lastName = (profile?.lastName ?? "").trim();
  const nickname = (profile?.nickname ?? "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

  const fallbackDisplay =
    user?.displayName?.trim() ||
    (user?.email ? user.email.split("@")[0] : "") ||
    "Ciclista";

  const saluto = fullName || fallbackDisplay;
  const nickPart = nickname ? ` (${nickname})` : "";
  const headerSubtitle = loading ? "Caricamento profilo..." : `Ciao, ${saluto}${nickPart}`;

  return (
    <Screen
      title="Bike & Hike Italia"
      subtitle={headerSubtitle}
      scroll={true}
      headerRight={
        isAdmin ? (
          <View
            style={{
              backgroundColor: "#FDE68A",
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: UI.radius.round,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "800", color: "#92400E" }}>ADMIN</Text>
          </View>
        ) : undefined
      }
    >
      {/* Hero compatto (logo + icona) */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: UI.spacing.md,
          backgroundColor: UI.colors.card,
          padding: UI.spacing.md,
          borderRadius: UI.radius.xl,
          shadowColor: UI.shadow.hero.shadowColor,
          shadowOpacity: UI.shadow.hero.shadowOpacity,
          shadowRadius: UI.shadow.hero.shadowRadius,
          elevation: UI.shadow.hero.elevation,
        }}
      >
        <Image
          source={logo}
          style={{
            width: 72,
            height: 72,
            borderRadius: UI.radius.md,
            resizeMode: "contain",
            backgroundColor: "#fff",
          }}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: "900", color: UI.colors.text }}>Benvenuto!</Text>
          <Text style={{ marginTop: 4, color: UI.colors.muted }}>Pronto per la prossima uscita?</Text>
        </View>
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: UI.radius.round,
            padding: 10,
            shadowColor: UI.shadow.card.shadowColor,
            shadowOpacity: UI.shadow.card.shadowOpacity,
            shadowRadius: UI.shadow.card.shadowRadius,
            elevation: UI.shadow.card.elevation,
          }}
        >
          <MaterialCommunityIcons name="bike-fast" size={28} color={UI.colors.primary} />
        </View>
      </View>

      <VSpace size="lg" />

      {/* Suggerimento profilo incompleto */}
      {!loading && !(firstName || lastName || nickname) && (
        <Pressable
          onPress={() => navigation.navigate("Profile")}
          style={({ pressed }) => [
            {
              padding: 12,
              borderRadius: UI.radius.md,
              backgroundColor: "#FFF7ED",
              borderWidth: 1,
              borderColor: "#FED7AA",
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

      <VSpace size="md" />

      {/* GRID MENU */}
      <View style={{ gap: UI.spacing.sm }}>
        <Tile
          title="Uscite"
          subtitle={isAdmin ? "Crea, gestisci e partecipa" : "Elenco uscite e prenotazioni"}
          badgeCount={activeCount ?? undefined}
          onPress={() => navigation.navigate("UsciteList")}
          icon={<Ionicons name="calendar-outline" size={28} color={UI.colors.primary} />}
        />

        {isAdmin && (
          <Tile
            title="Crea nuova uscita"
            subtitle="Solo per amministratori"
            onPress={() => navigation.navigate("CreateRide")}
            icon={<Ionicons name="add-circle-outline" size={28} color={UI.colors.primary} />}
          />
        )}

        <Tile
          title="Calendario"
          subtitle="Visualizza uscite per giorno"
          onPress={() => navigation.navigate("Calendar")}
          icon={<Ionicons name="calendar" size={28} color={UI.colors.primary} />}
        />

        <Tile
          title="Profilo"
          subtitle="Gestisci i tuoi dati"
          onPress={() => navigation.navigate("Profile")}
          icon={<Ionicons name="person-circle-outline" size={28} color={UI.colors.primary} />}
        />

        <Tile
          title="Esci"
          subtitle="Chiudi la sessione"
          onPress={() => navigation.navigate("Home") /* placeholder: gestito da App con signOut */}
          icon={<Ionicons name="exit-outline" size={28} color={UI.colors.danger} />}
          danger
        />
      </View>

      <VSpace size="xl" />
    </Screen>
  );
}

const styles = StyleSheet.create({});
