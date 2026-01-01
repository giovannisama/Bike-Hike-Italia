import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Screen, UI } from "../components/Screen";
import useCurrentProfile from "../hooks/useCurrentProfile";
import AccessDenied from "../components/AccessDenied";

export default function ViaggiPlaceholderScreen() {
    const { loading } = useCurrentProfile();

    if (loading) {
        return (
            <Screen useNativeHeader scroll={false}>
                <View style={styles.container}>
                    <Text>Caricamento…</Text>
                </View>
            </Screen>
        );
    }

    return (
        <Screen useNativeHeader scroll={false}>
            <View style={styles.container}>
                <Text style={styles.title}>Viaggi</Text>
                <Text style={styles.subtitle}>In arrivo presto.</Text>
                <Text style={styles.body}>Stiamo preparando il calendario Viaggi.</Text>
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: UI.spacing.lg,
        gap: 8,
    },
    title: {
        fontSize: 22,
        fontWeight: "900",
        color: UI.colors.text,
    },
    subtitle: {
        fontSize: 16,
        fontWeight: "700",
        color: "#6B7280",
    },
    body: {
        fontSize: 14,
        color: "#6B7280",
        textAlign: "center",
    },
});
