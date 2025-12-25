// src/screens/AdminScreen.tsx
// Schermata Amministrazione: accesso ai sottomenu (Gestione Utenti, ecc.)

import React, { useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Screen, UI } from "../components/Screen";
import { Ionicons } from "@expo/vector-icons";
import useCurrentProfile from "../hooks/useCurrentProfile";

// Fallback theme (in caso l'UI del Screen non sia esportata)
const ACTION_GREEN = "#22c55e";

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
      <View style={styles.headerWrap}>
        <Text style={styles.title}>Amministrazione</Text>
        <Text style={styles.subtitle}>{heroSubtitle}</Text>
        {(isOwner || isAdmin) && (
          <View style={[styles.rolePill, isOwner ? styles.rolePillOwner : styles.rolePillAdmin]}>
            <Text style={styles.rolePillText}>{isOwner ? "OWNER" : "ADMIN"}</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Sezioni</Text>
        {/* SOTTOMENU 1: Gestione Utenti */}
        <MenuTile
          title="Gestione Utenti"
          subtitle={
            isOwner
              ? "Approva e gestisci ruoli. Altre sezioni in arrivo."
              : "Riservata al ruolo Owner"
          }
          icon={<Ionicons name="people-outline" size={26} color={ACTION_GREEN} />}
          onPress={goUsers}
          disabled={!isOwner}
        />
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
      <View style={styles.tileIcon}>
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
  headerWrap: {
    paddingBottom: UI.spacing.md,
    gap: 6,
  },
  title: { fontSize: 28, fontWeight: "900", color: UI.colors.text },
  subtitle: { marginTop: 6, color: UI.colors.muted, fontWeight: "600" },
  rolePill: {
    alignSelf: "flex-start",
    marginTop: UI.spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  rolePillOwner: { backgroundColor: "#0f172a" },
  rolePillAdmin: { backgroundColor: "#111827" },
  rolePillText: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },

  section: {
    paddingTop: UI.spacing.sm,
    gap: UI.spacing.sm,
  },
  sectionLabel: {
    color: UI.colors.muted,
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  tile: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  tileIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(34, 197, 94, 0.12)",
  },
  tileTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
  },
  tileSub: {
    marginTop: 4,
    color: "#64748b",
  },
  shadowCard: {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  tileDisabled: {
    opacity: 0.55,
  },
});
