import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Linking,
} from "react-native";
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
import { GestureHandlerRootView, PinchGestureHandler, PanGestureHandler, State } from "react-native-gesture-handler";
import { useFocusEffect } from "@react-navigation/native";
import { saveBoardLastSeen } from "../utils/boardStorage";

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
  includeDescription: false,
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

const window = Dimensions.get("window");

export default function BoardScreen({ navigation }: any) {
  const { isAdmin, isOwner, loading: profileLoading } = useCurrentProfile();
  const canEdit = isAdmin || isOwner;
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});

  const [items, setItems] = useState<BoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"active" | "archived">("active");

  const [composeOpen, setComposeOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(createEmptyEditorState());
  const [saving, setSaving] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const lastScaleRef = useRef(1);
  const scaledValue = Animated.multiply(baseScale, pinchScale);
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const lastPanRef = useRef({ x: 0, y: 0 });
  const panRef = useRef(null);
  const pinchRef = useRef(null);
  const [canPan, setCanPan] = useState(false);
  const userId = auth.currentUser?.uid ?? null;

  const editingItem = useMemo(
    () => (editor.id ? items.find((itm) => itm.id === editor.id) ?? null : null),
    [editor.id, items]
  );
  const editorPreviewUri = useMemo(() => {
    if (!editor.includeImage) return null;
    if (editor.image?.uri) return editor.image.uri;
    if (editingItem?.imageBase64) return `data:image/jpeg;base64,${editingItem.imageBase64}`;
    if (editingItem?.imageUrl) return editingItem.imageUrl;
    return null;
  }, [editor.image, editingItem, editor.includeImage]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      saveBoardLastSeen(userId);
    }, [userId])
  );
  const handlePinchEvent = useMemo(
    () =>
      Animated.event([{ nativeEvent: { scale: pinchScale } }], {
        useNativeDriver: true,
      }),
    [pinchScale]
  );

  const handlePinchStateChange = useCallback(
    (event: any) => {
      const { state, scale } = event.nativeEvent;
      if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
        lastScaleRef.current = Math.min(Math.max(lastScaleRef.current * scale, 1), 4);
        baseScale.setValue(lastScaleRef.current);
        pinchScale.setValue(1);
        setCanPan(lastScaleRef.current > 1.01);
      } else if (state === State.BEGAN) {
        pinchScale.setValue(1);
      }
    },
    [baseScale, pinchScale]
  );

  // TODO: logica di preview/zoom immagine (pinch/pan) potrebbe essere incapsulata in hook o componente modale dedicato.
  const handlePanEvent = useMemo(
    () =>
      Animated.event([{ nativeEvent: { translationX: pan.x, translationY: pan.y } }], {
        useNativeDriver: true,
      }),
    [pan.x, pan.y]
  );

  const handlePanStateChange = useCallback(
    (event: any) => {
      const { state, translationX, translationY } = event.nativeEvent;
      if (state === State.BEGAN) {
        pan.setOffset(lastPanRef.current);
        pan.setValue({ x: 0, y: 0 });
      } else if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
        lastPanRef.current = {
          x: lastPanRef.current.x + translationX,
          y: lastPanRef.current.y + translationY,
        };
        pan.setOffset(lastPanRef.current);
        pan.setValue({ x: 0, y: 0 });
      }
    },
    [pan]
  );

  const closePreview = useCallback(() => {
    setPreviewImage(null);
    lastScaleRef.current = 1;
    baseScale.setValue(1);
    pinchScale.setValue(1);
    lastPanRef.current = { x: 0, y: 0 };
    pan.setValue({ x: 0, y: 0 });
    pan.setOffset({ x: 0, y: 0 });
    setCanPan(false);
  }, [baseScale, pinchScale, pan]);

  useEffect(() => {
    const q = query(collection(db, "boardPosts"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: BoardItem[] = [];
        snap.forEach((docSnap) => {
        const data = docSnap.data() as any;
        const hasTitle = data?.hasTitle ?? (!!data?.title && String(data.title).trim().length > 0);
        const hasImage = data?.hasImage ?? (!!data?.imageUrl || !!data?.imageBase64);
        const hasDescription = data?.hasDescription ?? (!!data?.description && String(data.description).trim().length > 0);
        next.push({
          id: docSnap.id,
          title: data?.title ?? null,
          description: data?.description ?? null,
          imageUrl: data?.imageUrl ?? null,
          imageBase64: data?.imageBase64 ?? null,
          imageStoragePath: data?.imageStoragePath ?? null,
          archived: data?.archived === true,
          createdAt: data?.createdAt?.toDate?.() ?? null,
          createdBy: data?.createdBy ?? null,
          hasTitle,
          hasImage,
          hasDescription,
        });
        });
        setItems(next);
        setLoading(false);
      },
      (err) => {
        console.error("[BoardScreen] onSnapshot error:", err);
        setLoading(false);
      }
    );
    return () => {
      try {
        unsub();
      } catch {}
    };
  }, []);

  const searchNormalized = useMemo(() => normalize(search), [search]);

  // TODO: logica filtri/ordinamento board potrebbe essere estratta in hook dedicato per testabilità.
  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        if (filter === "active") {
          if (item.archived) return false;
        } else if (!item.archived) {
          return false;
        }
        if (!searchNormalized) return true;
        const target = `${item.title ?? ""} ${item.description ?? ""}`;
        return normalize(target).includes(searchNormalized);
      })
      .sort((a, b) => {
        const timeA = a.createdAt ? a.createdAt.getTime() : 0;
        const timeB = b.createdAt ? b.createdAt.getTime() : 0;
        return timeB - timeA;
      });
  }, [items, filter, searchNormalized]);

  const resetCompose = () => {
    setEditor(createEmptyEditorState());
    setComposeOpen(false);
  };

  const requestMediaPermission = useCallback(async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert(
        "Permesso richiesto",
        "Per caricare un'immagine devi autorizzare l'accesso alla libreria foto."
      );
    }
    return granted;
  }, []);

  const handlePickImage = useCallback(async () => {
    if (!(await requestMediaPermission())) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length) {
      const asset = result.assets[0];
      setEditor((prev) => ({ ...prev, image: { uri: asset.uri, mimeType: asset.mimeType } }));
    }
  }, [requestMediaPermission]);

  // TODO: flusso creazione/modifica post (titolo/descrizione/immagine) abbastanza coeso per estrazione in hook/useBoardPostForm.
  const handleSave = useCallback(async () => {
    if (!canEdit) return;

    if (!editor.includeTitle && !editor.includeImage && !editor.includeDescription) {
      Alert.alert("Seleziona il contenuto", "Scegli almeno un elemento tra titolo, immagine o descrizione.");
      return;
    }

    const trimmedTitle = editor.title.trim();
    if (editor.includeTitle && !trimmedTitle) {
      Alert.alert(
        "Titolo obbligatorio",
        'Inserisci un titolo oppure disattiva la voce "Titolo".'
      );
      return;
    }

    const trimmedDescription = editor.description.trim();
    if (editor.includeDescription && !trimmedDescription) {
      Alert.alert(
        "Descrizione obbligatoria",
        'Inserisci una descrizione oppure disattiva la voce "Descrizione".'
      );
      return;
    }

    const editingExisting = !!editor.id;
    const existingItem = editingExisting ? items.find((itm) => itm.id === editor.id) ?? null : null;
    const hasExistingImage = existingItem?.hasImage
      ? !!(existingItem.imageUrl || existingItem.imageBase64)
      : false;

    if (editor.includeImage && !editor.image?.uri && !hasExistingImage) {
      Alert.alert(
        "Immagine mancante",
        'Seleziona un\'immagine oppure disattiva la voce "Immagine".'
      );
      return;
    }

    try {
      setSaving(true);
      const docRef = editingExisting ? doc(db, "boardPosts", editor.id!) : doc(collection(db, "boardPosts"));

      let imageUrlValue: any = undefined;
      let imageStoragePathValue: any = undefined;
      let imageBase64Value: any = undefined;

      if (editor.includeImage) {
        imageUrlValue = existingItem?.imageUrl ?? null;
        imageStoragePathValue = existingItem?.imageStoragePath ?? null;
        imageBase64Value = existingItem?.imageBase64 ?? null;

        if (editor.image?.uri) {
          try {
            const newStoragePath = `board/${docRef.id}_${Date.now()}.jpg`;
            const storageRef = ref(storage, newStoragePath);
            const response = await fetch(editor.image.uri);
            if (!response.ok) {
              throw new Error("Impossibile leggere il file selezionato.");
            }
            const blob = await response.blob();

            await uploadBytes(storageRef, blob, {
              contentType: editor.image.mimeType ?? "image/jpeg",
            });
            imageUrlValue = await getDownloadURL(storageRef);
            if (imageStoragePathValue && imageStoragePathValue !== newStoragePath) {
              try {
                await deleteObject(ref(storage, imageStoragePathValue));
              } catch (delErr) {
                console.warn("[Board] Impossibile eliminare immagine precedente:", delErr);
              }
            }
            imageStoragePathValue = newStoragePath;
            imageBase64Value = editingExisting ? deleteField() : null;
          } catch (uploadErr: any) {
            console.warn("[Board] upload storage fallito, fallback base64:", uploadErr);
            imageStoragePathValue = null;
            let compressQuality = 0.75;
            let attempts = 0;
            let manipulated = await ImageManipulator.manipulateAsync(
              editor.image.uri,
              [{ resize: { width: 1200 } }],
              { compress: compressQuality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
            );
            while (manipulated.base64 && manipulated.base64.length > 380000 && attempts < 3) {
              compressQuality = Math.max(0.45, compressQuality - 0.1);
              manipulated = await ImageManipulator.manipulateAsync(
                editor.image.uri,
                [{ resize: { width: 1024 } }],
                { compress: compressQuality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
              );
              attempts += 1;
            }
            if (!manipulated.base64 || manipulated.base64.length > 400000) {
              throw uploadErr;
            }
            imageBase64Value = manipulated.base64;
            imageUrlValue = null;
            if (existingItem?.imageStoragePath) {
              try {
                await deleteObject(ref(storage, existingItem.imageStoragePath));
              } catch (delErr) {
                console.warn("[Board] delete old storage (fallback)", delErr);
              }
            }
          }
        }
      } else if (editingExisting) {
        imageUrlValue = deleteField();
        imageStoragePathValue = deleteField();
        imageBase64Value = deleteField();
        if (existingItem?.imageStoragePath) {
          try {
            await deleteObject(ref(storage, existingItem.imageStoragePath));
          } catch (delErr) {
            console.warn("[Board] delete image after disable:", delErr);
          }
        }
      }

      const payload: any = {};

      if (editor.includeTitle) {
        payload.title = trimmedTitle;
      } else if (editingExisting) {
        payload.title = deleteField();
      }

      if (editor.includeDescription) {
        payload.description = trimmedDescription;
      } else if (editingExisting) {
        payload.description = deleteField();
      }

      if (!editingExisting) {
        payload.createdAt = serverTimestamp();
        payload.createdBy = auth.currentUser?.uid ?? null;
        payload.archived = false;
      } else {
        payload.archivedAt = deleteField();
        payload.hasTitle = deleteField();
        payload.hasImage = deleteField();
        payload.hasDescription = deleteField();
      }

      if (imageUrlValue !== undefined) payload.imageUrl = imageUrlValue;
      if (imageStoragePathValue !== undefined) payload.imageStoragePath = imageStoragePathValue;
      if (imageBase64Value !== undefined) payload.imageBase64 = imageBase64Value;

      await setDoc(docRef, payload, { merge: editingExisting });

      resetCompose();
    } catch (err: any) {
      console.error("[Board] create error:", err);
      Alert.alert("Errore", err?.message ?? "Impossibile salvare la news.");
    } finally {
      setSaving(false);
    }
  }, [canEdit, editor, items, resetCompose]);

  const confirmArchive = useCallback(
    (item: BoardItem) => {
      if (!canEdit) return;
      const newsLabel = item.hasTitle && item.title ? `"${item.title}"` : "Questa news";
      Alert.alert("Archiviare la news?", `${newsLabel} non sarà più visibile nella bacheca.`, [
        { text: "Annulla", style: "cancel" },
        {
          text: "Archivia",
          style: "destructive",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "boardPosts", item.id), {
                archived: true,
                archivedAt: serverTimestamp(),
              });
            } catch (err: any) {
              Alert.alert("Errore", err?.message ?? "Impossibile archiviare la news.");
            }
          },
        },
      ]);
    },
    [canEdit]
  );

  const confirmUnarchive = useCallback(
    (item: BoardItem) => {
      if (!canEdit) return;
      const newsLabel = item.hasTitle && item.title ? `"${item.title}"` : "La news";
      Alert.alert("Riattivare la news?", `${newsLabel} tornerà visibile nella bacheca.`, [
        { text: "Annulla", style: "cancel" },
        {
          text: "Riattiva",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "boardPosts", item.id), {
                archived: false,
                archivedAt: deleteField(),
              });
            } catch (err: any) {
              Alert.alert("Errore", err?.message ?? "Impossibile riattivare la news.");
            }
          },
        },
      ]);
    },
    [canEdit]
  );

  const confirmDelete = useCallback(
    (item: BoardItem) => {
      if (!canEdit) return;
      const newsLabel = item.hasTitle && item.title ? `"${item.title}"` : "Questa news";
      const deleteMessage = `${newsLabel} sarà eliminata definitivamente. Questa operazione non può essere annullata.${
        item.hasImage ? " L'immagine collegata verrà rimossa." : ""
      }`;
      Alert.alert(
        "Eliminare definitivamente?",
        deleteMessage,
        [
          { text: "Annulla", style: "cancel" },
          {
            text: "Elimina",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteDoc(doc(db, "boardPosts", item.id));
                if (item.imageStoragePath) {
                  try {
                    await deleteObject(ref(storage, item.imageStoragePath));
                  } catch (storageErr) {
                    console.warn("[Board] delete image fallback:", storageErr);
                  }
                }
              } catch (err: any) {
                Alert.alert("Errore", err?.message ?? "Impossibile eliminare la news.");
              }
            },
          },
        ]
      );
    },
    [canEdit]
  );

  const handleEdit = useCallback(
    (item: BoardItem) => {
      if (!canEdit || item.archived) return;
      setEditor({
        id: item.id,
        title: item.title ?? "",
        description: item.description ?? "",
        image: null,
        includeTitle: item.hasTitle,
        includeImage: item.hasImage,
        includeDescription: item.hasDescription,
      });
      setComposeOpen(true);
    },
    [canEdit]
  );

  const handleOpenLink = useCallback(async (url: string) => {
    const target = url.trim();
    try {
      const canOpen = await Linking.canOpenURL(target);
      if (!canOpen) {
        Alert.alert("Link non valido", "Impossibile aprire questo indirizzo.");
        return;
      }
      await Linking.openURL(target);
    } catch (err) {
      console.warn("[Board] open link error", err);
      Alert.alert("Errore", "Impossibile aprire il link.");
    }
  }, []);

  const renderDescriptionParts = useCallback(
    (text: string) => {
      const parts: { type: "text" | "link"; value: string }[] = [];
      const urlRegex = /(https?:\/\/[^\s]+)/gi;
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = urlRegex.exec(text)) !== null) {
        const offset = match.index;
        const url = match[0];
        if (offset > lastIndex) {
          parts.push({ type: "text", value: text.slice(lastIndex, offset) });
        }
        parts.push({ type: "link", value: url });
        lastIndex = offset + url.length;
      }

      if (lastIndex < text.length) {
        parts.push({ type: "text", value: text.slice(lastIndex) });
      }

      return parts.map((part, idx) =>
        part.type === "link" ? (
          <Text
            key={`link-${idx}`}
            style={styles.descriptionLink}
            onPress={() => handleOpenLink(part.value)}
            accessibilityRole="link"
          >
            {part.value}
          </Text>
        ) : (
          <Text key={`text-${idx}`}>
            {part.value}
          </Text>
        )
      );
    },
    [handleOpenLink]
  );

  const renderItem = useCallback(
    ({ item }: { item: BoardItem }) => {
      const dateLabel = item.createdAt
        ? item.createdAt.toLocaleDateString("it-IT", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "—";
      const descriptionText =
        item.hasDescription && item.description ? item.description.trim() : "";
      const isExpanded = expandedDescriptions[item.id] === true;
      const shouldShowToggle = descriptionText.length > 240 || descriptionText.split(/\r?\n/).length > 4;
      const imageUri = item.imageBase64
        ? `data:image/jpeg;base64,${item.imageBase64}`
        : item.imageUrl || PLACEHOLDER;

      return (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardDate}>{dateLabel}</Text>
            {item.hasTitle && item.title ? (
              <Text style={styles.cardTitle}>{item.title}</Text>
            ) : (
              canEdit && <Text style={styles.cardTitleMuted}>News senza titolo</Text>
            )}
          </View>
          {item.hasImage ? (
            <Pressable
              onPress={() =>
                {
                  lastScaleRef.current = 1;
                  baseScale.setValue(1);
                  pinchScale.setValue(1);
                  lastPanRef.current = { x: 0, y: 0 };
                  pan.setValue({ x: 0, y: 0 });
                  pan.setOffset({ x: 0, y: 0 });
                  setCanPan(false);
                  setPreviewImage(imageUri);
                }
              }
              style={styles.cardImageWrapper}
            >
              <Image
                source={{
                  uri: imageUri,
                }}
                style={styles.cardImage}
                resizeMode="contain"
              />
            </Pressable>
          ) : null}
          {descriptionText ? (
            <View style={styles.cardDescriptionBox}>
              <Text
                style={styles.cardDescription}
                numberOfLines={isExpanded || !shouldShowToggle ? undefined : 5}
                selectable
              >
                {renderDescriptionParts(descriptionText)}
              </Text>
              {shouldShowToggle && (
                <Pressable
                  onPress={() =>
                    setExpandedDescriptions((prev) => ({
                      ...prev,
                      [item.id]: !prev[item.id],
                    }))
                  }
                  accessibilityRole="button"
                  style={styles.descriptionToggle}
                >
                  <Text style={styles.descriptionToggleText}>
                    {isExpanded ? "Mostra meno..." : "Mostra di più..."}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : null}
          {canEdit && (
            <View style={styles.cardActions}>
              {!item.archived && (
                <Pressable
                  onPress={() => handleEdit(item)}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    { backgroundColor: "#e0f2fe", borderColor: "#2563eb", opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <Text style={[styles.actionText, { color: "#1d4ed8" }]}>Modifica</Text>
                </Pressable>
              )}
              {item.archived ? (
                <Pressable
                  onPress={() => confirmUnarchive(item)}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    { backgroundColor: "#dcfce7", borderColor: "#22c55e", opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <Text style={[styles.actionText, { color: "#166534" }]}>Riattiva</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => confirmArchive(item)}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    { backgroundColor: "#fef3c7", borderColor: "#f59e0b", opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <Text style={[styles.actionText, { color: "#92400e" }]}>Archivia</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => confirmDelete(item)}
                style={({ pressed }) => [
                  styles.actionBtn,
                  { backgroundColor: "#fee2e2", borderColor: "#ef4444", opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Text style={[styles.actionText, { color: "#b91c1c" }]}>Elimina</Text>
              </Pressable>
            </View>
          )}
        </View>
      );
    },
    [canEdit, confirmArchive, confirmUnarchive, confirmDelete, handleEdit, expandedDescriptions, renderDescriptionParts]
  );

  return (
    <Screen
      title="Bacheca"
      subtitle="Novità e comunicazioni"
      scroll={false}
      keyboardShouldPersistTaps="handled"
    >
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
          contentContainerStyle={{ paddingBottom: UI.spacing.xl }}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <View style={styles.searchRow}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Cerca per titolo o descrizione"
                  placeholderTextColor="#9ca3af"
                  value={search}
                  onChangeText={setSearch}
                  returnKeyType="search"
                />
              </View>

              <View style={styles.filterRow}>
                <PillButton label="Attive" active={filter === "active"} onPress={() => setFilter("active")} />
                <PillButton label="Archiviate" active={filter === "archived"} onPress={() => setFilter("archived")} />
                {canEdit && (
                  <PrimaryButton
                    label={composeOpen ? "Annulla" : "Nuova news"}
                    onPress={() =>
                      composeOpen
                        ? resetCompose()
                        : (setEditor(createEmptyEditorState()), setComposeOpen(true))
                    }
                    style={styles.newBtn}
                  />
                )}
              </View>

              {composeOpen && canEdit && (
                <View style={styles.composeCard}>
                  <Text style={styles.composeTitle}>{editor.id ? "Modifica news" : "Crea nuova news"}</Text>
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
                      numberOfLines={4}
                      textAlignVertical="top"
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
      <Modal
        visible={!!previewImage}
        transparent
        animationType="fade"
        onRequestClose={closePreview}
      >
        <GestureHandlerRootView style={styles.previewBackdrop}>
          {previewImage ? (
            <PanGestureHandler
              ref={panRef}
              simultaneousHandlers={pinchRef}
              onGestureEvent={handlePanEvent}
              onHandlerStateChange={handlePanStateChange}
              minPointers={1}
              enabled={canPan}
              minDist={canPan ? 2 : 20}
            >
              <Animated.View style={{ transform: [...pan.getTranslateTransform()] }}>
                <PinchGestureHandler
                  ref={pinchRef}
                  simultaneousHandlers={panRef}
                  onGestureEvent={handlePinchEvent}
                  onHandlerStateChange={handlePinchStateChange}
                >
                  <Animated.View style={[styles.previewImageWrapper, { transform: [{ scale: scaledValue }] }]}> 
                    <Image source={{ uri: previewImage }} style={styles.previewImage} resizeMode="contain" />
                  </Animated.View>
                </PinchGestureHandler>
              </Animated.View>
            </PanGestureHandler>
          ) : null}
          <Pressable style={styles.previewClose} onPress={closePreview}>
            <Text style={styles.previewCloseText}>Chiudi</Text>
          </Pressable>
          <Text style={styles.previewHint}>Pizzica per zoomare</Text>
        </GestureHandlerRootView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBlock: {
    gap: UI.spacing.md,
    marginBottom: UI.spacing.md,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: UI.radius.md,
    paddingHorizontal: UI.spacing.sm,
    paddingVertical: UI.spacing.xs,
    backgroundColor: "#fff",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: UI.colors.text,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: UI.spacing.sm,
    flexWrap: "wrap",
  },
  newBtn: {
    marginBottom: 0,
    paddingHorizontal: UI.spacing.md,
  },
  composeCard: {
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    borderRadius: UI.radius.lg,
    padding: UI.spacing.md,
    gap: UI.spacing.sm,
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
    minHeight: 120,
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
  card: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: UI.radius.lg,
    overflow: "hidden",
    backgroundColor: "#fff",
    marginBottom: UI.spacing.sm,
  },
  cardHeader: {
    paddingHorizontal: UI.spacing.md,
    paddingTop: UI.spacing.md,
    paddingBottom: UI.spacing.sm,
    gap: 4,
  },
  cardImageWrapper: {
    height: 320,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginTop: UI.spacing.sm,
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  cardDate: {
    fontSize: 12,
    color: "#64748b",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: UI.colors.text,
  },
  cardTitleMuted: {
    fontSize: 16,
    fontWeight: "700",
    color: "#94a3b8",
  },
  cardDescriptionBox: {
    paddingHorizontal: UI.spacing.md,
    paddingBottom: UI.spacing.sm,
    marginTop: UI.spacing.sm,
    gap: UI.spacing.xs,
  },
  cardDescription: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 20,
  },
  descriptionLink: {
    color: "#2563eb",
    textDecorationLine: "underline",
  },
  descriptionToggle: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  descriptionToggleText: {
    color: UI.colors.primary,
    fontWeight: "700",
  },
  cardActions: {
    marginTop: UI.spacing.md,
    flexDirection: "row",
    gap: UI.spacing.sm,
    paddingHorizontal: UI.spacing.md,
    paddingBottom: UI.spacing.md,
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: UI.radius.round,
    borderWidth: 1,
  },
  actionText: {
    fontWeight: "700",
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: UI.spacing.md,
  },
  previewImageWrapper: {
    width: window.width * 0.9,
    height: window.height * 0.75,
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    width: window.width * 0.9,
    height: window.height * 0.75,
  },
  previewClose: {
    marginTop: UI.spacing.md,
    paddingHorizontal: UI.spacing.lg,
    paddingVertical: UI.spacing.sm,
    borderRadius: UI.radius.round,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  previewCloseText: {
    color: "#f8fafc",
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  previewHint: {
    marginTop: UI.spacing.xs,
    color: "#cbd5f5",
    fontSize: 12,
  },
});
