import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { collection, onSnapshot } from "firebase/firestore";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen, UI } from "../components/Screen";
import { db } from "../firebase";

type EventRowProps = {
  title: string;
  caption?: string;
  badge?: number | null;
  onPress?: () => void;
  disabled?: boolean;
};

function EventRow({ title, caption, badge, onPress, disabled }: EventRowProps) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.eventRow,
        disabled && styles.eventRowDisabled,
        pressed && !disabled && { opacity: 0.9, transform: [{ translateY: 1 }] },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.eventTitle, disabled && styles.eventTitleDisabled]}>{title}</Text>
        {!!caption && <Text style={styles.eventCaption}>{caption}</Text>}
      </View>
      <View style={styles.eventRight}>
        {typeof badge === "number" && (
          <View style={[styles.badge, disabled && styles.badgeDisabled]}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={20} color={disabled ? "#9CA3AF" : UI.colors.text} />
      </View>
    </Pressable>
  );
}

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

export default function EventiHubScreen({ navigation }: any) {
  const activeCount = useActiveRidesCount();
  const rootNav = navigation?.getParent?.() ?? navigation;
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 16) + 24;

  return (
    <Screen useNativeHeader scroll keyboardShouldPersistTaps="handled" avoidKeyboard={false}>
      <View style={[styles.container, { paddingBottom: bottomPadding }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Eventi</Text>
            <Text style={styles.subtitle}>Seleziona una sezione</Text>
          </View>
          <MaterialCommunityIcons name="calendar-month" size={26} color={UI.colors.text} />
        </View>

        <View style={{ gap: 10 }}>
          <EventRow
            title="Calendario Bici"
            caption="Uscite attive"
            badge={activeCount ?? 0}
            onPress={() => rootNav.navigate("UsciteList")}
          />
          <EventRow
            title="Calendario Trekking"
            caption="In arrivo"
            badge={0}
            onPress={() => rootNav.navigate("TrekkingPlaceholder")}
          />
          <EventRow
            title="Bike Aut"
            caption="COMING SOON"
            disabled
            badge={null}
          />
          <EventRow
            title="Viaggi"
            caption="COMING SOON"
            disabled
            badge={null}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: UI.colors.text,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  eventRow: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  eventRowDisabled: {
    backgroundColor: "#F8FAFC",
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: UI.colors.text,
  },
  eventTitleDisabled: {
    color: "#9CA3AF",
  },
  eventCaption: {
    marginTop: 2,
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "600",
  },
  eventRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  badge: {
    minWidth: 28,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: UI.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeDisabled: {
    backgroundColor: "#E5E7EB",
  },
  badgeText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
});
