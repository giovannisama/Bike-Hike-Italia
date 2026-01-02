// src/screens/BoardScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { Screen, UI } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader"; // Unified Header
import { PrimaryButton } from "../components/Button";
import { auth, db, storage } from "../firebase";
import useCurrentProfile from "../hooks/useCurrentProfile";
import * as ImageManipulator from "expo-image-manipulator";
import { useFocusEffect } from "@react-navigation/native";
import { saveBoardLastSeen } from "../utils/boardStorage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

// Types
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

type BoardListItemProps = {
  item: BoardItem;
  canEdit: boolean;
  onPress: (postId: string, title: string | null) => void;
};

const BoardListItem = React.memo(function BoardListItem({ item, canEdit, onPress }: BoardListItemProps) {
  const dateObj = item.createdAt;
  const day = dateObj ? dateObj.toLocaleDateString("it-IT", { day: "2-digit" }) : "--";
  const monthShort = dateObj ? dateObj.toLocaleDateString("it-IT", { month: "short" }).toUpperCase().replace(".", "") : "";
  const year = dateObj ? dateObj.getFullYear() : "----";

  const descriptionText = item.hasDescription && item.description ? item.description.trim() : "";
  const imageUri = item.imageBase64 ? `data:image/jpeg;base64,${item.imageBase64}` : item.imageUrl || PLACEHOLDER;

  const handlePress = useCallback(() => {
    onPress(item.id, item.title);
  }, [item.id, item.title, onPress]);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [styles.cardInner, pressed && { opacity: 0.7 }]}
      >
        <View style={styles.dateColumn}>
          <Text style={styles.dateTopLine} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{`${day} ${monthShort}`}</Text>
          <Text style={styles.dateYear} numberOfLines={1}>{year}</Text>
          <View style={{ height: 8 }} />
          {item.hasImage ? (
            <Image source={{ uri: imageUri }} style={styles.cardThumb} resizeMode="cover" />
          ) : (
            <View style={styles.cardThumbPlaceholder}>
              <Ionicons name="newspaper-outline" size={20} color="#94A3B8" />
            </View>
          )}
        </View>

        <View style={{ flex: 1, paddingLeft: 4 }}>
          <View style={styles.cardHeader}>
            {item.hasTitle && item.title ? (
              <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
            ) : (
              canEdit && <Text style={styles.cardTitleMuted}>News senza titolo</Text>
            )}
            <Ionicons name="chevron-forward" size={18} color="#CBD5E1" style={{ marginTop: 2 }} />
          </View>
          <Text numberOfLines={3} style={styles.cardSnippet}>{descriptionText}</Text>
        </View>
      </Pressable>
    </View>
  );
});

// Removed local ACTION_GREEN -> using UI.colors.action

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
    if (filter === "active") result = result.filter(i => !i.archived);
    else result = result.filter(i => i.archived);

    if (search.trim()) {
      const q = normalize(search);
      result = result.filter(i =>
        (i.title && normalize(i.title).includes(q)) ||
        (i.description && normalize(i.description).includes(q))
      );
    }
    return result;
  }, [items, filter, search]);

  useFocusEffect(
    useCallback(() => {
      if (userId) saveBoardLastSeen(userId);
    }, [userId])
  );

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

  const resetCompose = useCallback(() => {
    setEditor(createEmptyEditorState());
    setComposeOpen(false);
  }, []);

  const handlePickImage = useCallback(async () => {
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
  }, []);

  const editorPreviewUri = editor.image ? editor.image.uri : null;

  const handleSave = useCallback(async () => {
    if (!userId) return;
    if (editor.includeTitle && !editor.title.trim()) { Alert.alert("Titolo mancante", "Inserisci un titolo o disabilitalo."); return; }
    if (editor.includeDescription && !editor.description.trim()) { Alert.alert("Descrizione mancante", "Inserisci una descrizione o disabilitala."); return; }
    if (editor.includeImage && !editor.image) { Alert.alert("Immagine mancante", "Seleziona un'immagine o disabilitala."); return; }
    if (!editor.includeTitle && !editor.includeDescription && !editor.includeImage) { Alert.alert("Vuoto", "La news deve contenere almeno un elemento."); return; }

    setSaving(true);
    try {
      const docData: any = { updatedAt: serverTimestamp() };
      if (editor.includeTitle) docData.title = editor.title.trim(); else docData.title = deleteField();
      if (editor.includeDescription) docData.description = editor.description.trim(); else docData.description = deleteField();

      if (editor.includeImage && editor.image) {
        const isNewImage = !editor.image.uri.startsWith("http");
        if (isNewImage) {
          const manipResult = await ImageManipulator.manipulateAsync(
            editor.image.uri, [{ resize: { width: 1080 } }],
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
          docData.imageBase64 = deleteField(); // Clean up old base64
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
  }, [editor, resetCompose, userId]);

  const handleOpenPost = useCallback((postId: string, title: string | null) => {
    navigation.navigate("BoardPostDetail", { postId, title });
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }: { item: BoardItem }) => (
      <BoardListItem item={item} canEdit={canEdit} onPress={handleOpenPost} />
    ),
    [canEdit, handleOpenPost]
  );

  const listHeader = useMemo(() => (
    <View style={styles.headerBlock}>
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
            <Pressable onPress={() => { setSearch(""); Keyboard.dismiss(); }} hitSlop={10} style={styles.searchClear}>
              <Ionicons name="close-circle" size={18} color="#94a3b8" />
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.filterRow}>
        <View style={styles.segmented}>
          <Pressable
            onPress={() => setFilter("active")}
            style={[styles.segmentedTab, filter === "active" && styles.segmentedTabActive]}
          >
            <Text style={[styles.segmentedText, filter === "active" && styles.segmentedTextActive]}>
              Attive
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setFilter("archived")}
            style={[styles.segmentedTab, filter === "archived" && styles.segmentedTabActive]}
          >
            <Text style={[styles.segmentedText, filter === "archived" && styles.segmentedTextActive]}>
              Archiviate
            </Text>
          </Pressable>
        </View>
      </View>

      {composeOpen && canEdit && (
        <View style={styles.composeCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.composeTitle}>{editor.id ? "Modifica news" : "Crea nuova news"}</Text>
            <Pressable onPress={resetCompose} hitSlop={10}><Ionicons name="close-circle" size={24} color="#94A3B8" /></Pressable>
          </View>
          <View style={styles.composeOptions}>
            <Text style={styles.composeSubtitle}>Come vuoi comporre la news?</Text>
            <View style={styles.composeToggleRow}>
              <Pressable onPress={() => setEditor((prev) => ({ ...prev, includeTitle: !prev.includeTitle }))} style={[styles.composeToggle, editor.includeTitle ? styles.composeToggleActive : styles.composeToggleInactive]}>
                <Text style={[styles.composeToggleText, editor.includeTitle && styles.composeToggleTextActive]}>Titolo</Text>
              </Pressable>
              <Pressable onPress={() => setEditor((prev) => ({ ...prev, includeImage: !prev.includeImage }))} style={[styles.composeToggle, editor.includeImage ? styles.composeToggleActive : styles.composeToggleInactive]}>
                <Text style={[styles.composeToggleText, editor.includeImage && styles.composeToggleTextActive]}>Immagine</Text>
              </Pressable>
              <Pressable onPress={() => setEditor((prev) => ({ ...prev, includeDescription: !prev.includeDescription }))} style={[styles.composeToggle, editor.includeDescription ? styles.composeToggleActive : styles.composeToggleInactive]}>
                <Text style={[styles.composeToggleText, editor.includeDescription && styles.composeToggleTextActive]}>Descrizione</Text>
              </Pressable>
            </View>
          </View>

          {editor.includeTitle && (
            <TextInput style={styles.composeInput} placeholder="Titolo" value={editor.title} onChangeText={(v) => setEditor((p) => ({ ...p, title: v }))} placeholderTextColor="#9ca3af" />
          )}
          {editor.includeDescription && (
            <TextInput style={styles.composeDescriptionInput} placeholder="Descrizione" value={editor.description} onChangeText={(v) => setEditor((p) => ({ ...p, description: v }))} placeholderTextColor="#9ca3af" multiline numberOfLines={10} textAlignVertical="top" scrollEnabled />
          )}
          {editor.includeImage && (
            <Pressable onPress={handlePickImage} style={styles.imagePicker}>
              {editorPreviewUri ? <Image source={{ uri: editorPreviewUri }} style={styles.imagePreview} resizeMode="cover" /> : (
                <View style={{ alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Text style={{ fontWeight: "700", color: UI.colors.primary }}>Seleziona immagine</Text>
                  <Text style={{ color: "#64748b", fontSize: 12 }}>Dalla libreria del dispositivo</Text>
                </View>
              )}
            </Pressable>
          )}
          <PrimaryButton label={editor.id ? "Salva modifiche" : "Pubblica"} onPress={handleSave} loading={saving} disabled={saving} />
        </View>
      )}
    </View>
  ), [canEdit, composeOpen, editor, editorPreviewUri, filter, handlePickImage, handleSave, resetCompose, saving, search]);

  return (
    <Screen useNativeHeader={true} scroll={false} keyboardShouldPersistTaps="handled" avoidKeyboard={false} backgroundColor="#FDFCF8">
      {/* 
        Unified Header
        Note: We hide the Back button by default in root tabs, or show it?
        Usually Board is a tab. So no back button.
      */}
      <ScreenHeader
        title="BACHECA"
        subtitle="Novità e comunicazioni"
        showBack={false}
        rightAction={
          canEdit && (
            <TouchableOpacity
              style={styles.headerAddBtn}
              onPress={() => { setEditor(createEmptyEditorState()); setComposeOpen(true); }}
              accessibilityRole="button"
            >
              <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          )
        }
      />

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
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            profileLoading || loading ? (
              <View style={styles.loadingBox}><ActivityIndicator /><Text style={{ marginTop: 8 }}>Carico la bacheca…</Text></View>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={{ fontWeight: "700", color: UI.colors.muted }}>Nessuna news da mostrare.</Text>
                {filter === "archived" && <Text style={{ marginTop: 4, color: "#6b7280" }}>Le news archiviate compariranno qui.</Text>}
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
  // Removed custom header styles

  headerBlock: {
    gap: 16,
    marginBottom: 16,
    marginTop: 8,
  },

  headerAddBtn: {
    backgroundColor: UI.colors.action,
    width: 44,
    height: 44,
    borderRadius: 22,
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
  searchClear: { position: "absolute", right: 4, top: "50%", transform: [{ translateY: -9 }] },
  searchInput: { flex: 1, fontSize: 15, color: "#0F172A" },
  filterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  segmented: {
    flexDirection: "row",
    backgroundColor: UI.colors.card,
    borderRadius: 999,
    padding: 4,
    alignSelf: "flex-start",
  },
  segmentedTab: {
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  segmentedTabActive: {
    backgroundColor: UI.colors.action,
  },
  segmentedText: { fontSize: 13, fontWeight: "600", color: UI.colors.muted },
  segmentedTextActive: { color: "#fff" },

  // COMPOSE
  composeCard: { borderWidth: 1, borderColor: "#bfdbfe", backgroundColor: "#eff6ff", borderRadius: UI.radius.lg, padding: UI.spacing.md, gap: UI.spacing.sm, marginTop: 16 },
  composeTitle: { fontSize: 16, fontWeight: "800", color: UI.colors.text },
  composeOptions: { borderWidth: 1, borderColor: "#cbd5f5", borderRadius: UI.radius.md, backgroundColor: "#fff", padding: UI.spacing.sm, gap: UI.spacing.xs, marginBottom: UI.spacing.sm },
  composeSubtitle: { fontSize: 14, fontWeight: "700", color: UI.colors.text },
  composeToggleRow: { flexDirection: "row", flexWrap: "wrap", gap: UI.spacing.xs },
  composeToggle: { borderWidth: 1, borderRadius: UI.radius.round, paddingVertical: 8, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  composeToggleActive: { backgroundColor: UI.colors.tint, borderColor: UI.colors.primary },
  composeToggleInactive: { backgroundColor: "#fff", borderColor: "#cbd5f5" },
  composeToggleText: { fontWeight: "700", color: "#475569" },
  composeToggleTextActive: { color: UI.colors.primary },
  composeInput: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, fontSize: 16, color: "#1e293b", fontWeight: "600" },
  composeDescriptionInput: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, fontSize: 15, color: "#334155", minHeight: 120 },
  imagePicker: { height: 160, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#cbd5e1", borderStyle: "dashed", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  imagePreview: { width: "100%", height: "100%" },

  loadingBox: { padding: 40, alignItems: "center" },
  emptyBox: { padding: 40, alignItems: "center", justifyContent: "center" },

  // CARD
  card: { backgroundColor: "#fff", borderRadius: 16, marginBottom: 16, shadowColor: "#475569", shadowOpacity: 0.08, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 3, borderWidth: 1, borderColor: "#F1F5F9", overflow: "hidden" },
  cardInner: { flexDirection: "row", padding: 12 },
  dateColumn: { width: 60, alignItems: "center", marginRight: 12 },
  dateTopLine: { fontSize: 13, fontWeight: "800", color: "#334155", textTransform: "uppercase" },
  dateYear: { fontSize: 11, fontWeight: "600", color: "#94A3B8" },
  cardThumb: { width: 60, height: 60, borderRadius: 10, backgroundColor: "#f1f5f9" },
  cardThumbPlaceholder: { width: 60, height: 60, borderRadius: 10, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E2E8F0" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  cardTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A", lineHeight: 22, flex: 1, paddingRight: 8 },
  cardTitleMuted: { fontSize: 16, fontWeight: "600", color: "#94a3b8", fontStyle: "italic" },
  cardSnippet: { fontSize: 14, color: "#64748B", lineHeight: 20 },
});
