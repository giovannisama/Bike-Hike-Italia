import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    FlatList,
    Alert,
    Modal,
    TextInput,
    Platform,
    KeyboardAvoidingView,
    Linking,
    ScrollView,
    SectionList
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

import { Screen, UI } from "../components/Screen";
import useCurrentProfile from "../hooks/useCurrentProfile";
import { auth, db } from "../firebase";
import { PrimaryButton } from "../components/Button";

// --- TYPES ---
type InfoItemType = "text" | "phone" | "whatsapp" | "email" | "iban" | "address" | "vat";

type InfoItem = {
    id: string;
    label: string;
    value: string;
    type: InfoItemType;
    section: "Associazione" | "Contatti" | "Dati Fiscali";
};

// --- MOCK INITIAL DATA ---
const INITIAL_DATA: InfoItem[] = [
    { id: "1", label: "Nome dell'Associazione", value: "Bike and Hike Italia", type: "text", section: "Associazione" },
    { id: "2", label: "Sede", value: "Via Roma 1, 00100 Roma", type: "address", section: "Associazione" },
    { id: "3", label: "Presidente", value: "Domenico", type: "text", section: "Associazione" },
    { id: "4", label: "Contatto Telefonico", value: "+39 349 4108388", type: "phone", section: "Contatti" },
    { id: "5", label: "Contatto WhatsApp", value: "+39 349 4108388", type: "whatsapp", section: "Contatti" },
    { id: "6", label: "PEC", value: "bikeandhike@pec.it", type: "email", section: "Contatti" },
    { id: "7", label: "P.IVA", value: "12345678901", type: "vat", section: "Dati Fiscali" },
    { id: "8", label: "IBAN", value: "IT00 X000 0000 0000 0000 0000 000", type: "iban", section: "Dati Fiscali" },
];

const INFO_DOC_REF = doc(db, "app_content", "informazioni");

export default function InfoScreen({ navigation }: any) {
    const { isOwner } = useCurrentProfile();
    const insets = useSafeAreaInsets();
    const [data, setData] = useState<InfoItem[]>(INITIAL_DATA);

    // Management Mode State
    const [isEditing, setIsEditing] = useState(false);

    // Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [editItem, setEditItem] = useState<InfoItem | null>(null);
    const [formLabel, setFormLabel] = useState("");
    const [formValue, setFormValue] = useState("");
    const [formType, setFormType] = useState<InfoItemType>("text");
    const [formSection, setFormSection] = useState<InfoItem["section"]>("Associazione");

    useEffect(() => {
        const loadInfo = async () => {
            try {
                const snap = await getDoc(INFO_DOC_REF);
                if (!snap.exists()) {
                    setData(INITIAL_DATA);
                    return;
                }
                const payload = snap.data() as any;
                const items = payload?.items;

                const allowedSections: InfoItem["section"][] = ["Associazione", "Contatti", "Dati Fiscali"];
                const allowedTypes: InfoItemType[] = ["text", "phone", "whatsapp", "email", "iban", "address", "vat"];

                const sanitized: InfoItem[] = Array.isArray(items)
                    ? (items as any[])
                          .filter((it) => it && typeof it === "object")
                          .map((it) => {
                              const id = typeof it.id === "string" ? it.id : "";
                              const label = typeof it.label === "string" ? it.label : "";
                              const value = typeof it.value === "string" ? it.value : "";
                              const type = allowedTypes.includes(it.type) ? (it.type as InfoItemType) : "text";
                              const section = allowedSections.includes(it.section)
                                  ? (it.section as InfoItem["section"])
                                  : "Associazione";
                              return { id, label, value, type, section };
                          })
                          .filter((it) => it.id.trim() && it.label.trim() && it.value.trim())
                    : [];

                if (sanitized.length > 0) {
                    setData(sanitized);
                } else {
                    setData(INITIAL_DATA);
                }
            } catch (err) {
                console.warn("Error loading info data", err);
                setData(INITIAL_DATA);
            }
        };
        loadInfo();
    }, []);

    const persistItems = async (items: InfoItem[]) => {
        if (!isOwner) {
            Alert.alert("Permesso negato", "Solo gli owner possono modificare queste informazioni.");
            return;
        }
        const uid = auth.currentUser?.uid;
        try {
            await setDoc(
                INFO_DOC_REF,
                {
                    items,
                    updatedAt: serverTimestamp(),
                    ...(uid ? { updatedBy: uid } : {}),
                },
                { merge: true }
            );
        } catch (err) {
            console.error("Error saving info data", err);
            Alert.alert("Errore salvataggio", "Impossibile salvare le informazioni.");
        }
    };

    // Group Data for SectionList
    const sections = [
        { title: "Associazione", data: data.filter(i => i.section === "Associazione") },
        { title: "Contatti", data: data.filter(i => i.section === "Contatti") },
        { title: "Dati Fiscali", data: data.filter(i => i.section === "Dati Fiscali") }
    ].filter(s => s.data.length > 0 || isEditing); // Keep empty sections in edit mode? logic to add? Simplification: just show if data exists.

    // --- INTERACTIONS ---
    const handlePressItem = async (item: InfoItem) => {
        if (isEditing) return; // Disable standard link actions while editing

        try {
            switch (item.type) {
                case "phone":
                    await Linking.openURL(`tel:${item.value.replace(/\s/g, "")}`);
                    break;
                case "whatsapp":
                    const cleanPhone = item.value.replace(/[^\d]/g, "");
                    await Linking.openURL(`https://wa.me/${cleanPhone}`);
                    break;
                case "email":
                    await Linking.openURL(`mailto:${item.value}`);
                    break;
                case "iban":
                    Alert.alert("IBAN Copiato", "Il codice IBAN è stato copiato negli appunti.");
                    break;
                default:
                    break;
            }
        } catch (err) {
            console.warn("Error opening link", err);
            Alert.alert("Errore", "Impossibile eseguire l'azione richiesta.");
        }
    };

    // --- CRUD ACTIONS (Owner Only) ---
    const startAdd = () => {
        setEditItem(null);
        setFormLabel("");
        setFormValue("");
        setFormType("text");
        setFormSection("Associazione");
        setModalVisible(true);
    };

    const startEdit = (item: InfoItem) => {
        setEditItem(item);
        setFormLabel(item.label);
        setFormValue(item.value);
        setFormType(item.type);
        setFormSection(item.section);
        setModalVisible(true);
    };

    const deleteItem = (id: string) => {
        Alert.alert("Elimina Campo", "Sei sicuro?", [
            { text: "Annulla", style: "cancel" },
            {
                text: "Elimina",
                style: "destructive",
                onPress: () =>
                    setData((prev) => {
                        const next = prev.filter((i) => i.id !== id);
                        void persistItems(next);
                        return next;
                    }),
            },
        ]);
    };

    const saveForm = () => {
        if (!formLabel.trim() || !formValue.trim()) {
            Alert.alert("Attenzione", "Etichetta e Valore sono obbligatori.");
            return;
        }

        const newItem: InfoItem = {
            id: editItem ? editItem.id : Date.now().toString(),
            label: formLabel,
            value: formValue,
            type: formType,
            section: formSection
        };

        if (editItem) {
            setData((prev) => {
                const next = prev.map((i) => i.id === editItem.id ? newItem : i);
                void persistItems(next);
                return next;
            });
        } else {
            setData((prev) => {
                const next = [...prev, newItem];
                void persistItems(next);
                return next;
            });
        }
        setModalVisible(false);
    };

    // --- RENDER HELPERS ---
    const getIconInfo = (type: InfoItemType) => {
        switch (type) {
            case "phone": return { name: "call" as const, color: "#0F172A", bg: "#F1F5F9" };
            case "whatsapp": return { name: "logo-whatsapp" as const, color: "#16A34A", bg: "#DCFCE7" };
            case "email": return { name: "mail" as const, color: "#EA580C", bg: "#FFEDD5" };
            case "iban": return { name: "card" as const, color: "#0F766E", bg: "#CCFBF1" };
            case "address": return { name: "location" as const, color: "#475569", bg: "#F1F5F9" };
            case "vat": return { name: "business" as const, color: "#475569", bg: "#F1F5F9" };
            default: return { name: "information-circle" as const, color: "#64748B", bg: "#F8FAFC" };
        }
    };

    const renderItem = ({ item }: { item: InfoItem }) => {
        const { name, color, bg } = getIconInfo(item.type);
        const isInteractive = ["phone", "whatsapp", "email", "iban"].includes(item.type);

        return (
            <Pressable
                onPress={() => handlePressItem(item)}
                style={({ pressed }) => [
                    styles.cardRow,
                    pressed && isInteractive && !isEditing && { backgroundColor: "#F8FAFC" }
                ]}
                disabled={!isInteractive && !isEditing}
            >
                <View style={[styles.iconCircle, { backgroundColor: bg }]}>
                    <Ionicons name={name} size={20} color={color} />
                </View>

                <View style={styles.contentBox}>
                    <Text style={styles.labelText}>{item.label}</Text>
                    <Text style={styles.valueText}>{item.value}</Text>
                </View>

                {isEditing ? (
                    <View style={styles.editActions}>
                        <Pressable onPress={() => startEdit(item)} style={styles.editBtn}>
                            <Ionicons name="pencil" size={18} color="#0284C7" />
                        </Pressable>
                        <Pressable onPress={() => deleteItem(item.id)} style={styles.editBtn}>
                            <Ionicons name="trash-outline" size={18} color="#EF4444" />
                        </Pressable>
                    </View>
                ) : (
                    isInteractive && <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
                )}
            </Pressable>
        );
    };

    const renderSectionHeader = ({ section: { title } }: any) => (
        <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{title}</Text>
        </View>
    );

    return (
        <View style={{ flex: 1, backgroundColor: "#FDFCF8" }}>
            {/* HERO HEADER - Custom implementation without Screen wrapper header */}
            <View style={[styles.heroHeader, { paddingTop: insets.top }]}>
                <LinearGradient
                    colors={["rgba(20, 83, 45, 0.08)", "rgba(14, 165, 233, 0.08)"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                />

                <View style={styles.headerContent}>
                    <View>
                        <Text style={styles.heroTitle}>Informazioni</Text>
                        <Text style={styles.heroSubtitle}>Dati e contatti dell’associazione</Text>
                    </View>

                    {isOwner && (
                        <Pressable
                            onPress={() => setIsEditing(!isEditing)}
                            style={({ pressed }) => [styles.manageBtn, pressed && { opacity: 0.7 }]}
                        >
                            <Text style={styles.manageBtnText}>{isEditing ? "Fine" : "Gestisci"}</Text>
                        </Pressable>
                    )}
                </View>
            </View>

            <SectionList
                sections={sections}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                renderSectionHeader={renderSectionHeader}
                contentContainerStyle={[styles.listContainer, { paddingBottom: 120 }]} // Extra padding for bottom tabs
                stickySectionHeadersEnabled={false}
                ListFooterComponent={
                    isEditing ? (
                        <Pressable onPress={startAdd} style={styles.addFieldBtn}>
                            <Ionicons name="add-circle-outline" size={24} color="#64748B" />
                            <Text style={styles.addFieldText}>Aggiungi campo</Text>
                        </Pressable>
                    ) : null
                }
            />

            {/* FULL SCREEN MODAL for ADD/EDIT */}
            <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={{ flex: 1 }}
                >
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{editItem ? "Modifica Campo" : "Nuovo Campo"}</Text>
                            <Pressable onPress={() => setModalVisible(false)}>
                                <Text style={styles.modalCloseText}>Annulla</Text>
                            </Pressable>
                        </View>

                        <ScrollView contentContainerStyle={styles.formContent}>
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>SEZIONE</Text>
                                <View style={styles.typeSelector}>
                                    {(["Associazione", "Contatti", "Dati Fiscali"] as const).map(s => (
                                        <Pressable
                                            key={s}
                                            onPress={() => setFormSection(s)}
                                            style={[styles.typeChip, formSection === s && styles.typeChipSelected]}
                                        >
                                            <Text style={[styles.typeChipText, formSection === s && { color: "#fff" }]}>{s}</Text>
                                        </Pressable>
                                    ))}
                                </View>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>ETICHETTA</Text>
                                <TextInput
                                    style={styles.textInput}
                                    value={formLabel}
                                    onChangeText={setFormLabel}
                                    placeholder="Es. Indirizzo"
                                />
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>VALORE</Text>
                                <TextInput
                                    style={[styles.textInput, { height: 80, textAlignVertical: "top" }]}
                                    value={formValue}
                                    onChangeText={setFormValue}
                                    multiline
                                />
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>TIPO</Text>
                                <View style={styles.typeSelector}>
                                    {(["text", "phone", "whatsapp", "email", "iban", "address", "vat"] as InfoItemType[]).map((t) => (
                                        <Pressable
                                            key={t}
                                            onPress={() => setFormType(t)}
                                            style={[styles.typeChip, formType === t && styles.typeChipSelected]}
                                        >
                                            <Text style={[styles.typeChipText, formType === t && { color: "#fff" }]}>
                                                {t.toUpperCase()}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </View>
                            </View>

                            <PrimaryButton
                                label="Salva"
                                onPress={saveForm}
                                style={styles.saveBtn}
                            />
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    heroHeader: {
        paddingTop: 60, // Fallback if safe area not used
        paddingBottom: 24,
        paddingHorizontal: 20,
    },
    headerContent: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
    },
    heroTitle: {
        fontSize: 32,
        fontWeight: "800",
        color: "#1E293B",
        letterSpacing: -1,
    },
    heroSubtitle: {
        fontSize: 16,
        fontWeight: "500",
        color: "#64748B",
        marginTop: 4,
    },
    manageBtn: {
        backgroundColor: "rgba(255,255,255,0.6)",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    manageBtnText: {
        fontWeight: "700",
        fontSize: 14,
        color: "#0F172A",
    },

    // LIST
    listContainer: {
        paddingHorizontal: 16,
        gap: 12,
        paddingTop: 10,
    },
    sectionHeader: {
        paddingVertical: 8,
        marginTop: 12,
        marginBottom: 4,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: "800",
        color: "#94A3B8",
        textTransform: "uppercase",
        letterSpacing: 1,
    },
    cardRow: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FFFFFF",
        padding: 16,
        borderRadius: 16,
        marginBottom: 8,
        // Shadow
        shadowColor: "#64748B",
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
        borderWidth: 1,
        borderColor: "#F1F5F9",
    },
    iconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 14,
    },
    contentBox: {
        flex: 1,
        gap: 2,
    },
    labelText: {
        fontSize: 11,
        fontWeight: "700",
        color: "#64748B",
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    valueText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#1E293B",
    },
    editActions: {
        flexDirection: "row",
        gap: 4,
    },
    editBtn: {
        padding: 8,
    },
    addFieldBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: "#CBD5E1",
        borderRadius: 16,
        marginTop: 20,
        gap: 8,
    },
    addFieldText: {
        fontSize: 15,
        fontWeight: "600",
        color: "#64748B",
    },

    // MODAL
    modalContainer: {
        flex: 1,
        backgroundColor: "#F8FAFC",
    },
    modalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 20,
        backgroundColor: UI.colors.card,
        borderBottomWidth: 1,
        borderBottomColor: UI.colors.tint,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: "#1E293B",
    },
    modalCloseText: {
        fontSize: 16,
        color: "#64748B",
    },
    formContent: {
        padding: 20,
        gap: 24,
    },
    inputGroup: {
        gap: 8,
    },
    inputLabel: {
        fontSize: 12,
        fontWeight: "700",
        color: UI.colors.muted,
        letterSpacing: 0.5,
    },
    textInput: {
        backgroundColor: UI.colors.card,
        borderWidth: 1,
        borderColor: "#CBD5E1",
        borderRadius: 12,
        padding: 14,
        fontSize: 16,
        color: UI.colors.text,
    },
    typeSelector: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    typeChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: UI.colors.card,
        borderWidth: 1,
        borderColor: UI.colors.tint,
    },
    typeChipSelected: {
        backgroundColor: UI.colors.action,
        borderColor: UI.colors.action,
    },
    typeChipText: {
        fontSize: 12,
        fontWeight: "700",
        color: UI.colors.muted,
    },
    saveBtn: {
        marginTop: 10,
        backgroundColor: UI.colors.action,
        borderColor: UI.colors.action,
    },
});
