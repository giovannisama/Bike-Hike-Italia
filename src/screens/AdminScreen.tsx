// src/screens/AdminScreen.tsx
// Schermata Amministrazione: accesso ai sottomenu (Gestione Utenti, ecc.)

import React, { useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Screen, Hero } from "../components/Screen";
import { Ionicons } from "@expo/vector-icons";
import useCurrentProfile from "../hooks/useCurrentProfile";

// Fallback theme (in caso l'UI del Screen non sia esportata)
const THEME = {
  colors: { primary: "#1D4ED8", tint: "#ECFEFF" },
} as const;

export default function AdminScreen() {
  const navigation = useNavigation<any>();
  const { isAdmin, isOwner } = useCurrentProfile();

  // Mostra header nativo coerente
  useEffect(() => {
    navigation.setOptions?.({
      headerShown: true,
      headerTitle: "Amministrazione",
      headerTitleAlign: "center",
    });
  }, [navigation]);

  const goUsers = () => navigation.navigate("UserList"); // <-- ROTTA verso la lista utenti
  const heroSubtitle = isOwner
    ? "Accesso completo (Owner)"
    : isAdmin
    ? "Accesso a funzioni amministrative"
    : "Permessi insufficienti";

  return (
    <Screen useNativeHeader={true} scroll={false}>
      <Hero
        title="Amministrazione"
        subtitle={heroSubtitle}
        rightSlot={
          isOwner ? (
            <View style={styles.badgeOwner}>
              <Text style={styles.badgeOwnerText}>OWNER</Text>
            </View>
          ) : isAdmin ? (
            <View style={styles.badgeAdmin}>
              <Text style={styles.badgeAdminText}>ADMIN</Text>
            </View>
          ) : undefined
        }
      />

      <View style={{ padding: 16, gap: 12 }}>
        {/* SOTTOMENU 1: Gestione Utenti */}
        <MenuTile
          title="Gestione Utenti"
          subtitle={
            isOwner
              ? "Approva, attiva/disattiva, ruoli (Admin/Member)"
              : "Riservata al ruolo Owner"
          }
          icon={<Ionicons name="people-outline" size={26} color={THEME.colors.primary} />}
          onPress={goUsers}
          disabled={!isOwner}
        />

        {/* Qui potrai aggiungere gli altri sottomenu in futuro:
            - Archivi
            - Calendario (admin)
            - Log/moderazione
            ecc.
        */}
      </View>
    </Screen>
  );
}

function MenuTile({
  title,
  subtitle,
  icon,
  onPress,
  disabled = false,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={disabled ? { disabled: true } : undefined}
      style={[
        styles.tile,
        styles.shadowCard,
        disabled ? styles.tileDisabled : undefined,
      ]}
      disabled={disabled}
    >
      <View style={[styles.tileIcon, { backgroundColor: THEME.colors.tint }]}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.tileTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.tileSub}>{subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={22} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badgeAdmin: {
    backgroundColor: "#FDE68A",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeAdminText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#92400E",
  },
  badgeOwner: {
    backgroundColor: "#1D4ED8",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeOwnerText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#EFF6FF",
  },
  tile: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tileTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
  tileSub: {
    marginTop: 2,
    color: "#64748b",
  },
  shadowCard: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  tileDisabled: {
    opacity: 0.55,
  },
});
