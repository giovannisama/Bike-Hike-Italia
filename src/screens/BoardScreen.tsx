import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Linking,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { Screen, UI } from "../components/Screen";
import { PrimaryButton, PillButton } from "../components/Button";
import { auth, db, storage } from "../firebase";
import useCurrentProfile from "../hooks/useCurrentProfile";
import * as ImageManipulator from "expo-image-manipulator";
import { useFocusEffect } from "@react-navigation/native";
import { saveBoardLastSeen } from "../utils/boardStorage";
import { renderLinkedText } from "../utils/renderLinkedText";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type BoardItem = {
  id: string;
  title: string | null;
  description: string | null;
  imageBase64?: string | null;
  imageUrl: string | null;
  imageStoragePath?: string | null;
  createdAt: Date | null;
  archived: boolean;
  createdBy?: string | null;
  hasTitle: boolean;
  hasImage: boolean;
  hasDescription: boolean;
};

type LocalImage = {
  uri: string;
  mimeType?: string | null;
};

type EditorState = {
  id: string | null;
  title: string;
  description: string;
  image: LocalImage | null;
  // Toggles
  includeTitle: boolean;
  includeImage: boolean;
  includeDescription: boolean;
};

const createEmptyEditorState = (): EditorState => ({
  id: null,
  title: "",
  description: "",
  image: null,
  includeTitle: true,
  includeImage: true,
  includeDescription: true,
});

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const PLACEHOLDER =
  "https://images.unsplash.com/photo-1529429617124-aee3183d15ab?auto=format&fit=crop&w=800&q=80";

const ACTION_GREEN = "#22c55e";

export default function BoardScreen({ navigation, route }: any) {
  const { isAdmin, isOwner, loading: profileLoading } = useCurrentProfile();
  const canEdit = isAdmin || isOwner;
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<BoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"active" | "archived">("active");

  const [composeOpen, setComposeOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(createEmptyEditorState());
  const [saving, setSaving] = useState(false);

  const userId = auth.currentUser?.uid ?? null;

  // Real-time subscription
  useEffect(() => {
    const q = query(
      collection(db, "boardPosts"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const list: BoardItem[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          title: d.title || null,
          description: d.description || null,
          imageBase64: d.imageBase64 || null,
          imageUrl: d.imageUrl || null,
          imageStoragePath: d.imageStoragePath || null,
          createdAt: d.createdAt ? d.createdAt.toDate() : null,
          archived: !!d.archived,
          createdBy: d.createdBy || null,
          hasTitle: !!d.title,
          hasImage: !!(d.imageBase64 || d.imageUrl),
          hasDescription: !!d.description,
        });
      });
      setItems(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Filter Logic
  const filteredItems = useMemo(() => {
    let result = items;
    // Filter by tab
    if (filter === "active") {
      result = result.filter(i => !i.archived);
    } else {
      result = result.filter(i => i.archived);
    }
    // Filter by search
    if (search.trim()) {
      const q = normalize(search);
      result = result.filter(i =>
        (i.title && normalize(i.title).includes(q)) ||
        (i.description && normalize(i.description).includes(q))
      );
    }
    return result;
  }, [items, filter, search]);

  // Mark as seen on navigation
  useFocusEffect(
    useCallback(() => {
      saveBoardLastSeen();
    }, [])
  );

  // Helper: Open Editor
  const handleEdit = useCallback((item: BoardItem) => {
    setEditor({
      id: item.id,
      title: item.title || "",
      description: item.description || "",
      image: item.imageUrl ? { uri: item.imageUrl } : null,
      includeTitle: !!item.title,
      includeImage: !!(item.imageBase64 || item.imageUrl),
      includeDescription: !!item.description,
    });
    setComposeOpen(true);
  }, []);

  // Handle Edit Param from Navigation
  useEffect(() => {
    if (route.params?.editPostId) {
      const target = items.find(i => i.id === route.params.editPostId);
      if (target) {
        handleEdit(target);
        navigation.setParams({ editPostId: undefined });
      }
    }
  }, [route.params?.editPostId, items, handleEdit, navigation]);

  // Helper: Reset Editor
  const resetCompose = () => {
    setEditor(createEmptyEditorState());
    setComposeOpen(false);
  };

  // Image Picker
  const handlePickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permesso negato", "Serve accesso alla galleria per caricare immagini.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      setEditor(prev => ({
        ...prev,
        image: { uri: asset.uri, mimeType: asset.mimeType },
        includeImage: true
      }));
    }
  };

  const editorPreviewUri = editor.image ? editor.image.uri : null;

  // Save Logic
  const handleSave = async () => {
    if (!userId) return;

    // Validate
    if (editor.includeTitle && !editor.title.trim()) {
      Alert.alert("Titolo mancante", "Inserisci un titolo o disabilitalo.");
      return;
    }
    if (editor.includeDescription && !editor.description.trim()) {
      Alert.alert("Descrizione mancante", "Inserisci una descrizione o disabilitala.");
      return;
    }
    if (editor.includeImage && !editor.image) {
      Alert.alert("Immagine mancante", "Seleziona un'immagine o disabilitala.");
      return;
    }
    if (!editor.includeTitle && !editor.includeDescription && !editor.includeImage) {
      Alert.alert("Vuoto", "La news deve contenere almeno un elemento.");
      return;
    }

    setSaving(true);
    try {
      const docData: any = {
        updatedAt: serverTimestamp(),
      };

      // Handle Title
      if (editor.includeTitle) docData.title = editor.title.trim();
      else docData.title = deleteField();

      // Handle Description
      if (editor.includeDescription) docData.description = editor.description.trim();
      else docData.description = deleteField();

      // Handle Image
      if (editor.includeImage && editor.image) {
        const isNewImage = !editor.image.uri.startsWith("http");

        if (isNewImage) {
          const manipResult = await ImageManipulator.manipulateAsync(
            editor.image.uri,
            [{ resize: { width: 1080 } }],
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
          );

          const response = await fetch(manipResult.uri);
          const blob = await response.blob();
          const filename = `board/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
          const storageRef = ref(storage, filename);
          await uploadBytes(storageRef, blob);
          const downloadUrl = await getDownloadURL(storageRef);

          docData.imageUrl = downloadUrl;
          docData.imageStoragePath = filename;
          docData.imageBase64 = deleteField();
        }
      } else {
        docData.imageUrl = deleteField();
        docData.imageStoragePath = deleteField();
        docData.imageBase64 = deleteField();
      }

      if (editor.id) {
        await updateDoc(doc(db, "boardPosts", editor.id), docData);
        Alert.alert("Successo", "News aggiornata.");
      } else {
        docData.createdAt = serverTimestamp();
        docData.createdBy = userId;
        docData.archived = false;
        await setDoc(doc(collection(db, "boardPosts")), docData);
        Alert.alert("Successo", "News pubblicata.");
      }
      resetCompose();

    } catch (err) {
      console.error(err);
      Alert.alert("Errore", "Impossibile salvare la news.");
    } finally {
      setSaving(false);
    }
  };


  const renderItem = useCallback(
    ({ item }: { item: BoardItem }) => {
      const dateObj = item.createdAt;
      // Date components
      const day = dateObj ? dateObj.toLocaleDateString("it-IT", { day: "2-digit" }) : "--";
      const monthShort = dateObj ? dateObj.toLocaleDateString("it-IT", { month: "short" }).toUpperCase().replace(".", "") : "";
      const year = dateObj ? dateObj.getFullYear() : "----";

      const descriptionText =
        item.hasDescription && item.description ? item.description.trim() : "";

      const imageUri = item.imageBase64
        ? `data:image/jpeg;base64,${item.imageBase64}`
        : item.imageUrl || PLACEHOLDER;

      return (
        <View style={styles.card}>
          <Pressable
            onPress={() => navigation.navigate("BoardPostDetail", { postId: item.id, title: item.title })}
            style={({ pressed }) => [styles.cardInner, pressed && { opacity: 0.7 }]}
          >
            {/* Left Column: Date + Thumbnail */}
            <View style={styles.dateColumn}>
              {/* Fixed Single Line Day+Month */}
              <Text
                style={styles.dateTopLine}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {`${day} ${monthShort}`}
              </Text>

              {/* Fixed Year */}
              <Text style={styles.dateYear} numberOfLines={1}>
                {year}
              </Text>

              <View style={{ height: 8 }} />

              {item.hasImage ? (
                <Image
                  source={{ uri: imageUri }}
                  style={styles.cardThumb}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.cardThumbPlaceholder}>
                  <Ionicons name="newspaper-outline" size={20} color="#94A3B8" />
                </View>
              )}
            </View>

            {/* Right Column: Content */}
            <View style={{ flex: 1, paddingLeft: 4 }}>
              <View style={styles.cardHeader}>
                {item.hasTitle && item.title ? (
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                ) : (
                  canEdit && <Text style={styles.cardTitleMuted}>News senza titolo</Text>
                )}
                <Ionicons name="chevron-forward" size={18} color="#CBD5E1" style={{ marginTop: 2 }} />
              </View>

              <Text numberOfLines={3} style={styles.cardSnippet}>
                {descriptionText}
              </Text>
            </View>

          </Pressable>
        </View>
      );
    },
    [canEdit, navigation]
  );

  return (
    <Screen
      useNativeHeader
      scroll={false}
      keyboardShouldPersistTaps="handled"
      avoidKeyboard={false}
      backgroundColor="#FDFCF8"
    >
      {/* Decorative Header Gradient */}
      <View style={styles.headerGradientContainer}>
        <LinearGradient
          colors={["rgba(20, 83, 45, 0.08)", "rgba(14, 165, 233, 0.08)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        <FlatList
          contentInsetAdjustmentBehavior="automatic"
          data={filteredItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 16, paddingTop: 8 }}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              {/* Custom Header Title */}
              <View style={styles.headerRow}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 8, marginTop: 4 }}>
                  <Ionicons name="arrow-back" size={24} color="#1E293B" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={styles.headerTitle}>BACHECA</Text>
                  <Text style={styles.headerSubtitle}>Novità e comunicazioni</Text>
                </View>
                {canEdit && (
                  <TouchableOpacity
                    style={styles.headerAddBtn}
                    onPress={() => {
                      setEditor(createEmptyEditorState());
                      setComposeOpen(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Crea nuova news"
                  >
                    <Ionicons name="add" size={24} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.searchRow}>
                <Ionicons name="search" size={18} color="#94a3b8" style={{ marginRight: 8 }} />
                <View style={{ flex: 1, position: "relative" }}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Cerca news..."
                    placeholderTextColor="#9ca3af"
                    value={search}
                    onChangeText={setSearch}
                    returnKeyType="search"
                  />
                  {search.trim().length > 0 && (
                    <Pressable
                      onPress={() => {
                        setSearch("");
                        Keyboard.dismiss();
                      }}
                      hitSlop={10}
                      style={styles.searchClear}
                    >
                      <Ionicons name="close-circle" size={18} color="#94a3b8" />
                    </Pressable>
                  )}
                </View>
              </View>

              <View style={styles.filterRow}>
                <View style={styles.segmentedControl}>
                  <Pressable
                    onPress={() => setFilter("active")}
                    style={[styles.segmentBtn, filter === "active" && styles.segmentBtnActive]}
                  >
                    <Text style={[styles.segmentText, filter === "active" && styles.segmentTextActive]}>Attive</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setFilter("archived")}
                    style={[styles.segmentBtn, filter === "archived" && styles.segmentBtnActive]}
                  >
                    <Text style={[styles.segmentText, filter === "archived" && styles.segmentTextActive]}>Archiviate</Text>
                  </Pressable>
                </View>
                {/* No inline add button */}
              </View>

              {composeOpen && canEdit && (
                <View style={styles.composeCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.composeTitle}>{editor.id ? "Modifica news" : "Crea nuova news"}</Text>
                    <Pressable onPress={resetCompose} hitSlop={10}>
                      <Ionicons name="close-circle" size={24} color="#94A3B8" />
                    </Pressable>
                  </View>

                  <View style={styles.composeOptions}>
                    <Text style={styles.composeSubtitle}>Come vuoi comporre la news?</Text>
                    <View style={styles.composeToggleRow}>
                      <Pressable
                        onPress={() =>
                          setEditor((prev) => ({ ...prev, includeTitle: !prev.includeTitle }))
                        }
                        style={({ pressed }) => [
                          styles.composeToggle,
                          editor.includeTitle ? styles.composeToggleActive : styles.composeToggleInactive,
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        <Text
                          style={[
                            styles.composeToggleText,
                            editor.includeTitle && styles.composeToggleTextActive,
                          ]}
                        >
                          Titolo
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          setEditor((prev) => ({ ...prev, includeImage: !prev.includeImage }))
                        }
                        style={({ pressed }) => [
                          styles.composeToggle,
                          editor.includeImage ? styles.composeToggleActive : styles.composeToggleInactive,
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        <Text
                          style={[
                            styles.composeToggleText,
                            editor.includeImage && styles.composeToggleTextActive,
                          ]}
                        >
                          Immagine
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          setEditor((prev) => ({ ...prev, includeDescription: !prev.includeDescription }))
                        }
                        style={({ pressed }) => [
                          styles.composeToggle,
                          editor.includeDescription
                            ? styles.composeToggleActive
                            : styles.composeToggleInactive,
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        <Text
                          style={[
                            styles.composeToggleText,
                            editor.includeDescription && styles.composeToggleTextActive,
                          ]}
                        >
                          Descrizione
                        </Text>
                      </Pressable>
                    </View>
                    <Text style={styles.composeHint}>Seleziona almeno un elemento.</Text>
                  </View>

                  {editor.includeTitle && (
                    <TextInput
                      style={styles.composeInput}
                      placeholder="Titolo"
                      value={editor.title}
                      onChangeText={(value) => setEditor((prev) => ({ ...prev, title: value }))}
                      placeholderTextColor="#9ca3af"
                    />
                  )}

                  {editor.includeDescription && (
                    <TextInput
                      style={styles.composeDescriptionInput}
                      placeholder="Descrizione"
                      value={editor.description}
                      onChangeText={(value) => setEditor((prev) => ({ ...prev, description: value }))}
                      placeholderTextColor="#9ca3af"
                      multiline
                      numberOfLines={10}
                      textAlignVertical="top"
                      scrollEnabled
                    />
                  )}

                  {editor.includeImage && (
                    <Pressable
                      onPress={handlePickImage}
                      style={({ pressed }) => [
                        styles.imagePicker,
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      {editorPreviewUri ? (
                        <Image source={{ uri: editorPreviewUri }} style={styles.imagePreview} resizeMode="cover" />
                      ) : (
                        <View style={{ alignItems: "center", justifyContent: "center", gap: 6 }}>
                          <Text style={{ fontWeight: "700", color: UI.colors.primary }}>Seleziona immagine</Text>
                          <Text style={{ color: "#64748b", fontSize: 12 }}>Dalla libreria del dispositivo</Text>
                        </View>
                      )}
                    </Pressable>
                  )}

                  <PrimaryButton
                    label={editor.id ? "Salva modifiche" : "Pubblica"}
                    onPress={handleSave}
                    loading={saving}
                    disabled={saving}
                  />
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            profileLoading || loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator />
                <Text style={{ marginTop: 8 }}>Carico la bacheca…</Text>
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={{ fontWeight: "700", color: UI.colors.muted }}>Nessuna news da mostrare.</Text>
                {filter === "archived" && (
                  <Text style={{ marginTop: 4, color: "#6b7280" }}>Le news archiviate compariranno qui.</Text>
                )}
              </View>
            )
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        />
      </KeyboardAvoidingView>



    </Screen>
  );
}

const styles = StyleSheet.create({
  headerGradientContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  headerBlock: {
    gap: 16,
    marginBottom: 16,
    marginTop: 8,
  },
  headerRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1E293B",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#64748B",
    marginTop: 2,
  },
  headerAddBtn: {
    backgroundColor: ACTION_GREEN, // Green-800 -> ACTION_GREEN
    width: 44,
    height: 44,
    borderRadius: 22, // Circle
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
    marginTop: 2,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#64748B",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  searchClear: {
    position: "absolute",
    right: 4,
    top: "50%",
    transform: [{ translateY: -9 }],
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#0F172A",
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    padding: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  segmentBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  segmentBtnActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  segmentTextActive: {
    color: "#0F172A",
    fontWeight: "700",
  },
  // COMPOSE
  composeCard: {
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    borderRadius: UI.radius.lg,
    padding: UI.spacing.md,
    gap: UI.spacing.sm,
    marginTop: 16,
  },
  composeTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: UI.colors.text,
  },
  composeOptions: {
    borderWidth: 1,
    borderColor: "#cbd5f5",
    borderRadius: UI.radius.md,
    backgroundColor: "#fff",
    padding: UI.spacing.sm,
    gap: UI.spacing.xs,
    marginBottom: UI.spacing.sm,
  },
  composeSubtitle: {
    fontSize: 14,
    fontWeight: "700",
    color: UI.colors.text,
  },
  composeToggleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: UI.spacing.xs,
  },
  composeToggle: {
    borderWidth: 1,
    borderRadius: UI.radius.round,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  composeToggleActive: {
    backgroundColor: UI.colors.tint,
    borderColor: UI.colors.primary,
  },
  composeToggleInactive: {
    backgroundColor: "#fff",
    borderColor: "#cbd5f5",
  },
  composeToggleText: {
    fontWeight: "700",
    color: "#475569",
  },
  composeToggleTextActive: {
    color: UI.colors.primary,
  },
  composeHint: {
    fontSize: 12,
    color: "#64748b",
    marginTop: UI.spacing.xs / 2,
  },
  composeInput: {
    borderWidth: 1,
    borderColor: "#cbd5f5",
    borderRadius: UI.radius.md,
    paddingHorizontal: UI.spacing.sm,
    paddingVertical: UI.spacing.xs,
    backgroundColor: "#fff",
    color: UI.colors.text,
  },
  composeDescriptionInput: {
    borderWidth: 1,
    borderColor: "#cbd5f5",
    borderRadius: UI.radius.md,
    paddingHorizontal: UI.spacing.sm,
    paddingVertical: UI.spacing.xs,
    backgroundColor: "#fff",
    color: UI.colors.text,
    minHeight: 200,
    maxHeight: 320,
  },
  imagePicker: {
    borderWidth: 1,
    borderColor: "#dbeafe",
    borderRadius: UI.radius.md,
    height: 180,
    backgroundColor: "#fff",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  imagePreview: {
    width: "100%",
    height: "100%",
  },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: UI.spacing.xl,
    gap: 4,
  },
  // CARD
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#64748B",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    overflow: "hidden",
  },
  cardInner: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
    alignItems: 'flex-start'
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  dateColumn: {
    flexDirection: 'column',
    alignItems: 'center',
    width: 72,
    marginTop: 2,
    flexShrink: 0,
    paddingHorizontal: 0,
  },
  dateTopLine: {
    color: ACTION_GREEN, // Green-800 -> ACTION_GREEN
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 0.2,
    textAlign: "center"
  },
  dateYear: {
    color: ACTION_GREEN, // Green-700 -> ACTION_GREEN
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
    marginTop: 2
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
    flex: 1,
    marginRight: 8,
    lineHeight: 22
  },
  cardTitleMuted: {
    fontSize: 16,
    fontWeight: "700",
    color: "#94a3b8",
  },
  cardThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#E2E8F0",
  },
  cardThumbPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardSnippet: {
    fontSize: 14,
    color: "#64748B",
    lineHeight: 20,
    marginTop: 2,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: UI.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: UI.colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 100,
  }
});
