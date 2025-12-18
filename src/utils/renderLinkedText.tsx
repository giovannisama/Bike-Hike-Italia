import React from "react";
import { Text, Linking } from "react-native";

// Helper for clickable links
const URL_REGEX_GLOBAL = /(https?:\/\/[^\s]+)/g;

export const openUrl = (rawUrl: string) => {
    let url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
    }
    Linking.openURL(url).catch((err) => {
        console.warn("Impossibile aprire il link:", url, err);
    });
};

export const renderLinkedText = (text: string, style?: any) => {
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    URL_REGEX_GLOBAL.lastIndex = 0;

    while ((match = URL_REGEX_GLOBAL.exec(text)) !== null) {
        const url = match[0];
        const start = match.index;

        if (start > lastIndex) {
            nodes.push(text.slice(lastIndex, start));
        }

        nodes.push(
            <Text
                key={`link-${nodes.length}`}
                style={[{ color: "#0284C7", textDecorationLine: "underline" }, style]}
                onPress={() => openUrl(url)}
            >
                {url}
            </Text>
        );

        lastIndex = start + url.length;
    }

    if (lastIndex < text.length) {
        nodes.push(text.slice(lastIndex));
    }

    return nodes.length === 0 ? text : nodes;
};
