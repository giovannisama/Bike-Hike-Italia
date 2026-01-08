import React, { useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View, ActivityIndicator, Modal, TouchableWithoutFeedback, Linking, Platform, TextInput, Switch } from "react-native";
import { deleteDoc, doc, getDoc, updateDoc, serverTimestamp, deleteField } from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { db, storage } from "../firebase";
import { UI } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { Ionicons } from "@expo/vector-icons";
import { ZoomableImageModal } from "../components/ZoomableImageModal";
import useCurrentProfile from "../hooks/useCurrentProfile";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const URL_REGEX_GLOBAL = /(https?:\/\/[^\s]+)/g;

const renderLinkedText = (text: string, onPressLink: (url: string) => void) => {
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    // ... (omitting lengthy unneeded parts, focusing on top and render)
    // Actually I need to split this into two replaces or use multi_replace for far apart sections.
    // I will use multi_replace.
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
                suppressHighlighting
                selectable={false}
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

export default function BoardPostDetailScreen({ navigation, route }: any) {
    const { postId } = route.params || {};
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [zoomVisible, setZoomVisible] = useState(false);
    const [actionSheetVisible, setActionSheetVisible] = useState(false);
    const [pinUpdating, setPinUpdating] = useState(false);

    const { isAdmin, isOwner } = useCurrentProfile();
    const canEdit = isAdmin || isOwner;
    const insets = useSafeAreaInsets();

    useEffect(() => {
        if (!postId) {
            setLoading(false);
            return;
        }
        const fetchPost = async () => {
            try {
                const snap = await getDoc(doc(db, "boardPosts", postId));
                if (snap.exists()) {
                    const snapData = snap.data();
                    setData({ ...snapData, id: snap.id });
                }
            } catch (err) {
                console.warn("Error fetching post", err);
            } finally {
                setLoading(false);
            }
        };
        fetchPost();
    }, [postId]);

    const handleAction = (type: "edit" | "archive" | "delete") => {
        setActionSheetVisible(false);
        setTimeout(() => { // ensure modal closes before alert/nav
            if (type === "edit") handleEdit();
            if (type === "archive") confirmArchive();
            if (type === "delete") confirmDelete();
        }, 100);
    };

    const handleEdit = () => {
        navigation.navigate("Home", {
            screen: "TabBacheca",
            params: { editPostId: data.id },
        });
    };

    const confirmArchive = async () => {
        if (!data) return;
        const isArchived = data.archived === true;
        const action = isArchived ? "Riattiva" : "Archivia";
        Alert.alert(
            `${action} news?`,
            `Vuoi davvero ${isArchived ? "riattivare" : "archiviare"} questa news?`,
            [
                { text: "Annulla", style: "cancel" },
                {
                    text: action,
                    style: isArchived ? "default" : "destructive",
                    onPress: async () => {
                        try {
                            await updateDoc(doc(db, "boardPosts", data.id), {
                                archived: !isArchived,
                                archivedAt: isArchived ? deleteField() : serverTimestamp(),
                            });
                            setData((prev: any) => ({ ...prev, archived: !isArchived }));
                            navigation.goBack();
                        } catch (err) {
                            Alert.alert("Errore", "Impossibile aggiornare lo stato.");
                        }
                    },
                },
            ]
        );
    };

    const handleTogglePinned = async () => {
        if (!data || pinUpdating || !data.id) return;
        const nextPinned = !data.pinned;
        try {
            setPinUpdating(true);
            await updateDoc(doc(db, "boardPosts", data.id), {
                pinned: nextPinned,
                pinnedAt: nextPinned ? serverTimestamp() : null,
            });
            setData((prev: any) =>
                prev
                    ? {
                        ...prev,
                        pinned: nextPinned,
                        pinnedAt: nextPinned ? (prev.pinnedAt ?? null) : null,
                    }
                    : prev
            );
        } catch (err) {
            console.error("Errore aggiornamento pin", err);
            Alert.alert("Errore", "Impossibile aggiornare il pin.");
        } finally {
            setPinUpdating(false);
        }
    };

    const confirmDelete = async () => {
        if (!data) return;
        Alert.alert(
            "Elimina definitivamente",
            "Questa operazione è irreversibile. Confermi?",
            [
                { text: "Annulla", style: "cancel" },
                {
                    text: "Elimina",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await deleteDoc(doc(db, "boardPosts", data.id));
                            if (data.imageStoragePath) {
                                try {
                                    await deleteObject(ref(storage, data.imageStoragePath));
                                } catch { }
                            }
                            navigation.goBack();
                        } catch (err) {
                            Alert.alert("Errore", "Impossibile eliminare il post.");
                        }
                    },
                },
            ]
        );
    };



    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={UI.colors.primary} />
            </View>
        );
    }

    if (!data) {
        return (
            <View style={styles.centerContainer}>
                <Ionicons name="alert-circle-outline" size={48} color={UI.colors.muted} />
                <Text style={styles.errorText}>Il post richiesto non è disponibile.</Text>
            </View>
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
        <View style={{ flex: 1, backgroundColor: "#FDFCF8" }}>
            <ScreenHeader
                title="Dettaglio News"
                rightAction={
                    canEdit ? (
                        <Pressable
                            onPress={() => setActionSheetVisible(true)}
                            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
                        >
                            <Ionicons name="pencil" size={20} color="#1E293B" />
                        </Pressable>
                    ) : undefined
                }
            />
            <ScrollView contentContainerStyle={styles.container}>

                <View style={{ paddingHorizontal: 20 }}>
                    {/* Meta Data */}
                    {dateLabel ? <Text style={styles.date}>{dateLabel}</Text> : null}

                    {/* Title */}
                    <Text style={styles.title}>{data.title || "News senza titolo"}</Text>

                    {/* Image */}
                    {imageUri && (
                        <>
                            <Pressable onPress={() => setZoomVisible(true)} style={({ pressed }) => pressed && { opacity: 0.9 }}>
                                <View style={styles.imageContainer}>
                                    <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
                                    <View style={styles.zoomHint}>
                                        <Ionicons name="scan-outline" size={20} color="#fff" />
                                    </View>
                                </View>
                            </Pressable>
                            <ZoomableImageModal
                                visible={zoomVisible}
                                uri={imageUri}
                                onClose={() => setZoomVisible(false)}
                            />
                        </>
                    )}

                    {/* Description Card */}
                    {data.description ? (
                        <View style={styles.bodyContainer}>
                            {Platform.OS === "ios" ? (
                                <TextInput
                                    value={data.description ?? ""}
                                    editable={false}
                                    multiline
                                    scrollEnabled={false}
                                    contextMenuHidden={false}
                                    dataDetectorTypes={["link"]}
                                    style={[styles.bodyText, { padding: 0 }]}
                                />
                            ) : (
                                <Text style={styles.bodyText} selectable>
                                    {renderLinkedText(data.description, handlePressLink)}
                                </Text>
                            )}
                        </View>
                    ) : null}
                </View>
            </ScrollView>

            {/* Action Sheet Modal */}
            <Modal
                transparent
                visible={actionSheetVisible}
                animationType="fade"
                onRequestClose={() => setActionSheetVisible(false)}
            >
                <TouchableWithoutFeedback onPress={() => setActionSheetVisible(false)}>
                    <View style={styles.modalOverlay}>
                        <TouchableWithoutFeedback>
                            <View style={[styles.actionSheet, { paddingBottom: insets.bottom + 16 }]}>
                                <View style={styles.actionSheetHandle} />
                                <Text style={styles.actionSheetTitle}>Gestisci News</Text>

                                {canEdit && (
                                    <Pressable
                                        onPress={handleTogglePinned}
                                        hitSlop={{ top: 6, bottom: 6 }}
                                        disabled={pinUpdating}
                                        style={({ pressed }) => [styles.pinRow, pressed && { opacity: 0.7 }, pinUpdating && { opacity: 0.6 }]}
                                    >
                                        <Text style={styles.pinLabel}>Fissa in alto</Text>
                                        <View style={styles.pinSwitchWrap} pointerEvents="none">
                                            <Switch value={!!data.pinned} />
                                        </View>
                                    </Pressable>
                                )}

                                <Pressable style={styles.actionOption} onPress={() => handleAction("edit")}>
                                    <View style={[styles.actionIconBox, { backgroundColor: "#DBEAFE" }]}>
                                        <Ionicons name="create-outline" size={22} color="#1E3A8A" />
                                    </View>
                                    <Text style={styles.actionOptionText}>Modifica</Text>
                                </Pressable>

                                <Pressable style={styles.actionOption} onPress={() => handleAction("archive")}>
                                    <View style={[styles.actionIconBox, { backgroundColor: "#FEF3C7" }]}>
                                        <Ionicons name={data.archived ? "arrow-undo-outline" : "archive-outline"} size={22} color="#92400E" />
                                    </View>
                                    <Text style={styles.actionOptionText}>
                                        {data.archived ? "Riattiva" : "Archivia"}
                                    </Text>
                                </Pressable>

                                <View style={styles.divider} />

                                <Pressable style={styles.actionOption} onPress={() => handleAction("delete")}>
                                    <View style={[styles.actionIconBox, { backgroundColor: "#FEE2E2" }]}>
                                        <Ionicons name="trash-outline" size={22} color="#DC2626" />
                                    </View>
                                    <Text style={[styles.actionOptionText, { color: "#DC2626" }]}>Elimina definitivamente</Text>
                                </Pressable>
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </View >
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
    // HEADER STANDARD
    headerContainer: {
        backgroundColor: "#FDFCF8",
        borderBottomWidth: 1,
        borderBottomColor: "#F1F5F9",
        zIndex: 10,
    },
    headerRow: {
        height: 56, // Slightly taller
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12, // Space between back arrow and title
        flex: 1,
    },
    backBtn: {
        padding: 4,
        marginLeft: -8, // Nice alignment
    },
    headerTitle: {
        fontSize: 20, // Standard size
        fontWeight: "800",
        color: "#1E293B",
        letterSpacing: -0.5,
    },
    manageBtn: {
        // Removed
    },
    manageBtnText: {
        // Removed
    },
    // BODY
    container: {
        paddingBottom: 40,
        paddingTop: 24,
    },
    date: {
        fontSize: 13,
        fontWeight: "600",
        color: "#94A3B8", // Muted gray
        marginBottom: 8,
        textTransform: "uppercase",
        letterSpacing: 0.8
    },
    title: {
        fontSize: 26,
        fontWeight: "800",
        color: "#1E293B",
        marginBottom: 20,
        lineHeight: 34,
        letterSpacing: -0.5,
    },
    imageContainer: {
        width: "100%",
        height: 240,
        borderRadius: 20,
        overflow: "hidden",
        marginBottom: 24,
        backgroundColor: "#E2E8F0",
        borderWidth: 1,
        borderColor: "#F1F5F9"
    },
    image: {
        width: "100%",
        height: "100%"
    },
    bodyContainer: {
        backgroundColor: "#fff",
        padding: 24,
        borderRadius: 20,
        shadowColor: "#64748B",
        shadowOpacity: 0.04,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
        borderWidth: 1,
        borderColor: "#F1F5F9"
    },
    bodyText: {
        fontSize: 16,
        lineHeight: 28,
        color: "#334155"
    },
    zoomHint: {
        position: "absolute",
        bottom: 12,
        right: 12,
        backgroundColor: "rgba(15, 23, 42, 0.6)",
        padding: 8,
        borderRadius: 12,
        // backdropFilter removed as it's not standard RN
    },
    // Action Sheet Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "flex-end",
    },
    actionSheet: {
        backgroundColor: "#fff",
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        padding: 24,
        gap: 8,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 10
    },
    actionSheetHandle: {
        width: 48,
        height: 5,
        borderRadius: 3,
        backgroundColor: "#E2E8F0",
        alignSelf: "center",
        marginBottom: 16,
    },
    actionSheetTitle: {
        fontSize: 20,
        fontWeight: "800",
        color: "#1E293B",
        marginBottom: 16,
        textAlign: "center",
    },
    pinRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        borderRadius: 12,
    },
    pinLabel: {
        flex: 1,
        fontSize: 17,
        fontWeight: "600",
        color: "#334155",
    },
    pinSwitchWrap: {
        width: 52,
        alignItems: "flex-end",
    },
    actionOption: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        gap: 16,
        borderRadius: 12,
    },
    actionIconBox: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
    },
    actionOptionText: {
        fontSize: 17, // Standard
        fontWeight: "600",
        color: "#334155",
    },
    divider: {
        height: 1,
        backgroundColor: "#F1F5F9",
        marginVertical: 8,
    },
});
