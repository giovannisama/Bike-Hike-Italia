import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, Linking } from "react-native";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Screen, UI } from "../components/Screen";
import { Ionicons } from "@expo/vector-icons";

// Helper for clickable links (Same as used in BoardScreen)
const URL_REGEX_GLOBAL = /(https?:\/\/[^\s]+)/g;

const renderLinkedText = (text: string, onPressLink: (url: string) => void) => {
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
                style={{ color: "#0284C7", textDecorationLine: "underline" }}
                onPress={() => onPressLink(url)}
                selectable={false} // Avoid selection interference
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

const handlePressLink = (rawUrl: string) => {
    let url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
    }
    Linking.openURL(url).catch((err) => {
        console.warn("Impossibile aprire il link:", url, err);
    });
};


export default function BoardPostDetailScreen({ route }: any) {
    const { postId, title } = route.params || {};
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!postId) {
            setLoading(false);
            return;
        }
        const fetchPost = async () => {
            try {
                const snap = await getDoc(doc(db, "boardPosts", postId));
                if (snap.exists()) {
                    setData({ id: snap.id, ...snap.data() });
                }
            } catch (err) {
                console.warn("Error fetching post", err);
            } finally {
                setLoading(false);
            }
        };
        fetchPost();
    }, [postId]);

    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={UI.colors.primary} />
            </View>
        );
    }

    if (!data) {
        return (
            <Screen title="Post non trovato" scroll={false}>
                <View style={styles.centerContainer}>
                    <Ionicons name="alert-circle-outline" size={48} color={UI.colors.muted} />
                    <Text style={styles.errorText}>Il post richiesto non è disponibile.</Text>
                </View>
            </Screen>
        );
    }

    const dateLabel = data.createdAt?.toDate
        ? data.createdAt.toDate().toLocaleDateString("it-IT", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        })
        : "";

    const imageUri = data.imageBase64
        ? `data:image/jpeg;base64,${data.imageBase64}`
        : data.imageUrl;

    return (
        <Screen title="Dettaglio News" scroll backgroundColor="#FDFCF8">
            <View style={styles.container}>
                {/* Header / Date */}
                <Text style={styles.date}>{dateLabel}</Text>

                {/* Title */}
                <Text style={styles.title}>{data.title || "News senza titolo"}</Text>

                {/* Image */}
                {imageUri && (
                    <View style={styles.imageContainer}>
                        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
                    </View>
                )}

                {/* Description */}
                {data.description ? (
                    <View style={styles.bodyContainer}>
                        <Text style={styles.bodyText}>
                            {renderLinkedText(data.description, handlePressLink)}
                        </Text>
                    </View>
                ) : null}
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    centerContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FDFCF8",
        gap: 12
    },
    errorText: {
        fontSize: 16,
        color: "#64748B"
    },
    container: {
        paddingBottom: 40
    },
    date: {
        fontSize: 13,
        fontWeight: "600",
        color: "#64748B",
        marginBottom: 8,
        textTransform: "uppercase",
        letterSpacing: 0.5
    },
    title: {
        fontSize: 24,
        fontWeight: "800",
        color: "#1E293B",
        marginBottom: 16,
        lineHeight: 32
    },
    imageContainer: {
        width: "100%",
        height: 220,
        borderRadius: 16,
        overflow: "hidden",
        marginBottom: 20,
        backgroundColor: "#E2E8F0"
    },
    image: {
        width: "100%",
        height: "100%"
    },
    bodyContainer: {
        backgroundColor: "#fff",
        padding: 20,
        borderRadius: 16,
        shadowColor: "#64748B",
        shadowOpacity: 0.05,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
        borderWidth: 1,
        borderColor: "#F1F5F9"
    },
    bodyText: {
        fontSize: 16,
        lineHeight: 26,
        color: "#334155"
    }
});
