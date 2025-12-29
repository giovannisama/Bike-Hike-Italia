// src/screens/AdminScreen.tsx
// Schermata Amministrazione: accesso ai sottomenu (Gestione Utenti, ecc.)

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Screen, UI } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { Ionicons } from "@expo/vector-icons";
import useCurrentProfile from "../hooks/useCurrentProfile";

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
      {/* 
        NOTE: For AdminScreen, the user requested NO back button and Extra Top Padding 
        to balance the layout since it's a root tab screen.
      */}
      <ScreenHeader
        title="AMMINISTRAZIONE"
        subtitle="Pannello di controllo"
        showBack={true}
        topPadding={60} // Matches the custom 60px padding we approved earlier
      />

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>SEZIONI</Text>

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
        {/* Use UI.colors.action instead of local constant */}
        <Ionicons name={icon} size={24} color={UI.colors.action} />
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
  // header styles removed (now handled by ScreenHeader)

  section: {
    paddingHorizontal: 16,
    gap: 12,
    marginTop: 20,
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
    backgroundColor: "#dcfce7",
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
