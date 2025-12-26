// src/screens/AdminScreen.tsx
// Schermata Amministrazione: accesso ai sottomenu (Gestione Utenti, ecc.)

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Screen, UI } from "../components/Screen";
import { LinearGradient } from "expo-linear-gradient"; // Import Gradient
import { Ionicons } from "@expo/vector-icons";
import useCurrentProfile from "../hooks/useCurrentProfile";

const ACTION_GREEN = "#22c55e"; // Global Action Green

export default function AdminScreen() {
  const navigation = useNavigation<any>();
  const { isAdmin, isOwner } = useCurrentProfile();

  // Hide Native Header
  React.useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const goUsers = () => navigation.navigate("UserList");

  return (
    <Screen useNativeHeader={true} scroll={false} backgroundColor="#FDFCF8">
      {/* HEADER GRADIENT */}
      <View style={styles.headerGradientContainer}>
        <LinearGradient
          colors={["rgba(20, 83, 45, 0.08)", "rgba(14, 165, 233, 0.08)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* MANUAL HEADER */}
      <View style={styles.headerBlock}>
        {/* Back button removed as per request (Root Tab screen) */}
        <Text style={styles.headerTitle}>AMMINISTRAZIONE</Text>
        <Text style={styles.headerSubtitle}>Pannello di controllo</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>SEZIONI</Text>

        {/* SOTTOMENU 1: Gestione Utenti */}
        <MenuTile
          title="Gestione Utenti"
          subtitle={
            isOwner
              ? "Approva e gestisci ruoli."
              : "Riservata al ruolo Owner"
          }
          icon="people-outline"
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
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      style={[
        styles.tile,
        disabled ? styles.tileDisabled : undefined,
      ]}
      activeOpacity={0.7}
      disabled={disabled}
    >
      <View style={styles.tileIcon}>
        <Ionicons name={icon} size={24} color={ACTION_GREEN} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.tileTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.tileSub}>{subtitle}</Text>}
      </View>

      <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  headerGradientContainer: { position: 'absolute', top: 0, left: 0, right: 0, height: 200 },

  headerBlock: {
    paddingHorizontal: 16,
    paddingTop: 60, // Increased top padding since back button is gone
    paddingBottom: 24
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1E293B",
    letterSpacing: -0.5,
    textTransform: 'uppercase'
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#64748B",
    marginTop: 4
  },

  section: {
    paddingHorizontal: 16,
    gap: 12,
    marginTop: 20, // Push content down below header logic
  },
  sectionLabel: {
    color: "#94a3b8",
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 4,
  },

  // Modern Tile
  tile: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    // Soft Shadow
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: "rgba(241, 245, 249, 1)",
  },
  tileDisabled: {
    opacity: 0.6,
  },
  tileIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#dcfce7", // Light Green bg
  },
  tileTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f172a",
  },
  tileSub: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 13,
    lineHeight: 18,
  },
});
