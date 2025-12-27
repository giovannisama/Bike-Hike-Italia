import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { getDifficultyMeta } from "../../utils/rideDifficulty";

type DifficultyBadgeProps = {
    level?: string | null;
};

export function DifficultyBadge({ level }: DifficultyBadgeProps) {
    const { label, color } = getDifficultyMeta(level);

    return (
        <View style={styles.container}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={styles.text}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    text: {
        fontSize: 12,
        fontWeight: "600",
        color: "#64748B",
    },
});
