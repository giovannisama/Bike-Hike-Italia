import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Screen, UI } from "./Screen";



export default function AccessDenied({
  title = "Accesso non consentito",
  message = "Non hai i permessi per visualizzare questa sezione.",
  showBack = true,
}: {
  title?: string;
  message?: string;
  showBack?: boolean;
}) {
  const navigation = useNavigation<any>();
  return (
    <Screen useNativeHeader={true} scroll={false}>
      <View style={styles.center}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        {showBack && (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.btn}
            accessibilityRole="button"
          >
            <Text style={styles.btnText}>Torna indietro</Text>
          </TouchableOpacity>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: UI.spacing.lg,
    gap: UI.spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: UI.colors.text,
    textAlign: "center",
  },
  message: {
    color: UI.colors.muted,
    textAlign: "center",
  },
  btn: {
    marginTop: UI.spacing.sm,
    backgroundColor: UI.colors.action,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  btnText: { color: "#fff", fontWeight: "800" },
});
