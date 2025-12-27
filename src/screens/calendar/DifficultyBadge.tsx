import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { getDifficultyMeta } from "../../utils/rideDifficulty";

type DifficultyBadgeProps = {
    level?: string | null;
};

export function DifficultyBadge({ level }: DifficultyBadgeProps) {
    const { label, color } = getDifficultyMeta(level);

    return (
        <View style={[styles.badge, { backgroundColor: color + "20", borderColor: color }]}>
            <Text style={[styles.text, { color: color }]}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    text: {
        fontSize: 12,
        fontWeight: "700",
        textTransform: "uppercase",
    },
});
