// src/screens/RideDetails.tsx
import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Pressable,
  Share,
  ActionSheetIOS, // ADDED
  Platform,
  Linking, // ADDED
  Modal, // ADDED
  TextInput, // ADDED
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
  serverTimestamp,
  setDoc, // ADDED: per creare notifiche
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { getApp } from "firebase/app";
import useCurrentProfile from "../hooks/useCurrentProfile";
import type { PublicUserDoc } from "../types/firestore";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Screen, UI } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader"; // Unified Header
import { StatusBadge } from "./calendar/StatusBadge";
import { DifficultyBadge } from "./calendar/DifficultyBadge";
import { getBikeCategoryLabel } from "./calendar/bikeType";
import { LinearGradient } from "expo-linear-gradient";
import * as Calendar from "expo-calendar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ------------------------------------------------------------------
// CONSTANTS & TYPES for SERVICES
// ------------------------------------------------------------------
type RideServiceKey = "lunch" | "dinner" | "overnight";
type RideServiceChoice = "yes" | "no";
type RideServiceConfig = {
  enabled: boolean;
  label?: string | null;
};
type RideExtraServices = Partial<Record<RideServiceKey, RideServiceConfig>>;
type RideServiceResponseMap = Partial<Record<RideServiceKey, RideServiceChoice>>;
type RideServiceSelectionMap = Record<RideServiceKey, RideServiceChoice | null>;

const SERVICE_KEYS: RideServiceKey[] = ["lunch", "dinner", "overnight"];
const SERVICE_LABELS: Record<RideServiceKey, string> = {
  lunch: "Pranzo",
  dinner: "Cena",
  overnight: "Pernotto",
};

const emptySelection = (): RideServiceSelectionMap => ({ lunch: null, dinner: null, overnight: null });

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------
function getRideStatus(ride: any) {
  if (ride.archived) return "archived";
  if (ride.status === "cancelled") return "cancelled";
  return "active";
}

function safeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") {
    const obj = value as { name?: unknown; note?: unknown; id?: unknown };
    if (typeof obj.name === "string" || typeof obj.name === "number") return String(obj.name);
    if (typeof obj.note === "string" || typeof obj.note === "number") return String(obj.note);
    if (typeof obj.id === "string" || typeof obj.id === "number") return String(obj.id);
  }
  return "";
}

function buildPublicName(profile?: PublicUserDoc | null): string {
  if (!profile) return "";
  if (profile.displayName) return profile.displayName;
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;
  if ((profile as any).fullName) return String((profile as any).fullName);
  return "";
}

function buildManualParticipantId(entry: any): string {
  if (entry && typeof entry === "object") {
    const manualId = (entry as any).manualId ?? (entry as any).id;
    if (manualId) return String(manualId);
    const createdAtMs = (entry as any).createdAt?.toMillis?.();
    if (typeof createdAtMs === "number" && Number.isFinite(createdAtMs)) {
      return `manual_${createdAtMs}`;
    }
    const label = safeText((entry as any).name ?? (entry as any).note ?? (entry as any).addedBy);
    if (label) return `manual_${label}`;
  }
  const legacy = safeText(entry);
  return `manual_${legacy || "legacy"}`;
}

// URL Regex for description links
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

// ------------------------------------------------------------------
// TYPES
// ------------------------------------------------------------------
type RootStackParamList = {
  RideDetails: { rideId: string; title?: string; collectionName?: string; kind?: "ride" | "trek" | "trip" };
  CreateRide: { editMode: boolean; rideId: string };
  UserDetail: { userId: string };
};

type RideDetailsRouteProp = RouteProp<RootStackParamList, "RideDetails">;

// Removed local ACTION_GREEN -> using UI.colors.action

// ------------------------------------------------------------------
// MAIN COMPONENT
// ------------------------------------------------------------------
export default function RideDetails() {
  const navigation = useNavigation<any>();
  const route = useRoute<RideDetailsRouteProp>();
  const { rideId, collectionName = "rides", kind = "ride" } = route.params;
  const insets = useSafeAreaInsets();

  // Track heald IDs to avoid loops
  const healedParticipantsRef = useRef<Set<string>>(new Set());

  const [publicIndex, setPublicIndex] = useState<Record<string, PublicUserDoc | null>>({}); // Local cache for names
  const [phoneByUid, setPhoneByUid] = useState<Record<string, string | null>>({});

  // 1. Native Header Removal
  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  const { profile, isAdmin, isOwner, isGuide, loading: profileLoading } = useCurrentProfile();
  const isAdminOrOwner = !!isAdmin || !!isOwner;
  const userId = auth.currentUser?.uid;

  const [ride, setRide] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState(false);

  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<{ id: string; type: "user" | "manual"; displayName?: string } | null>(null);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [showAllParticipants, setShowAllParticipants] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [joinSaving, setJoinSaving] = useState(false);

  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [manualSaving, setManualSaving] = useState(false);

  const [joinServices, setJoinServices] = useState<RideServiceSelectionMap>(() => emptySelection());
  const [manualServices, setManualServices] = useState<RideServiceSelectionMap>(() => emptySelection());

  // ----------------------------------------------------------------
  // 1. FETCH RIDE + REALTIME
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!rideId) return;
    const unsub = onSnapshot(doc(db, collectionName, rideId), (snap) => {
      if (snap.exists()) {
        setRide({ id: snap.id, ...snap.data() });
      } else {
        Alert.alert("Errore", "Uscita non trovata o eliminata.");
        navigation.goBack();
      }
      setLoading(false);
    }, (error) => {
      console.warn("RideDetails fetch error:", error);
      setLoading(false);
      Alert.alert("Errore", "Impossibile caricare l'evento.");
      navigation.goBack();
    });
    return () => unsub();
  }, [rideId, navigation]);

  // ----------------------------------------------------------------
  // 2. FETCH PARTICIPANTS + REALTIME
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!rideId) return;
    const q = query(
      collection(db, collectionName, rideId, "participants")
      // orderBy("signedAt", "asc") // Removed to avoid missing index issues
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setParticipants(list);
    });
    return () => unsub();
  }, [rideId]);

  // ----------------------------------------------------------------
  // 3. RESOLVE NAMES LOCALLY (Like older version)
  // ----------------------------------------------------------------
  useEffect(() => {
    if (participants.length === 0) return;
    const missing = participants
      .filter((p) => p.id && !p.id.startsWith("manual_") && !Object.prototype.hasOwnProperty.call(publicIndex, p.id))
      .map((p) => ({ docId: p.id, uid: p.uid || p.id }));

    if (missing.length === 0) return;

    const fetchProfiles = async () => {
      const newEntries: Record<string, PublicUserDoc | null> = {};

      await Promise.all(
        missing.map(async (item) => {
          const { docId, uid } = item;
          let resolved: any = null;

          // 1. Try public profile first (fast, reliable for names)
          try {
            const publicSnap = await getDoc(doc(db, "users_public", uid));
            if (publicSnap.exists()) {
              resolved = publicSnap.data();
            }
          } catch { }

          newEntries[docId] = resolved || null;
        })
      );

      if (Object.keys(newEntries).length === 0) return;

      setPublicIndex((prev) => {
        const merged = { ...prev };
        Object.entries(newEntries).forEach(([docId, value]) => {
          if (value) {
            merged[docId] = { ...(merged[docId] || {}), ...value };
          } else if (!Object.prototype.hasOwnProperty.call(merged, docId)) {
            merged[docId] = null;
          }
        });
        return merged;
      });
    };

    fetchProfiles();
  }, [participants, publicIndex]);

  useEffect(() => {
    if (!isAdminOrOwner || !userId) return;
    const profilePhone = (profile as any)?.phoneNumber ?? null;
    setPhoneByUid((prev) => {
      if (prev[userId] === profilePhone) return prev;
      return { ...prev, [userId]: profilePhone };
    });
    console.log("[RideDetails] phone resolved", userId, profilePhone);
  }, [isAdminOrOwner, userId, profile?.phoneNumber]);

  useEffect(() => {
    if (!isAdminOrOwner) return;
    if (participants.length === 0) return;

    const missing = participants
      .map((p) => p.uid || p.id)
      .filter((uid): uid is string => !!uid)
      .filter((uid) => !Object.prototype.hasOwnProperty.call(phoneByUid, uid));

    if (missing.length === 0) return;

    let cancelled = false;

    const fetchPhones = async () => {
      const newEntries: Record<string, string | null> = {};
      await Promise.all(
        missing.map(async (uid) => {
          let phoneNumber: string | null = null;
          try {
            const userSnap = await getDoc(doc(db, "users", uid));
            if (userSnap.exists()) {
              phoneNumber = (userSnap.data() as any)?.phoneNumber ?? null;
            }
          } catch { }
          newEntries[uid] = phoneNumber;
          console.log("[RideDetails] phone resolved", uid, phoneNumber);
        })
      );
      if (cancelled || Object.keys(newEntries).length === 0) return;
      setPhoneByUid((prev) => ({ ...prev, ...newEntries }));
    };

    fetchPhones();
    return () => {
      cancelled = true;
    };
  }, [participants, isAdminOrOwner, phoneByUid]);

  // ----------------------------------------------------------------
  // COMPUTED
  // ----------------------------------------------------------------
  // A. Combine manual + registered
  const manualParticipants = useMemo(() => {
    if (!ride?.manualParticipants) return [];
    return Array.isArray(ride.manualParticipants) ? ride.manualParticipants : [];
  }, [ride]);

  // Merge lists for display
  const allParticipants = useMemo(() => {
    // 1. Registered users (from subcollection)
    // 1. Registered users (from subcollection)
    const registered = participants.map((p) => {
      let resolved = publicIndex[p.id];
      // Use local profile for "Me" to ensure we have private fields like displayName
      if (p.id === userId && profile) {
        resolved = { ...resolved, ...profile } as any;
      }
      const resolvedName = buildPublicName(resolved);
      const displayName = resolvedName || p.displayName || p.name || "Utente";
      const photoURL = (resolved as any)?.photoURL || p.photoURL || null;

      return {
        type: "user",
        id: p.id, // userId
        uid: p.uid || p.id,
        displayName,
        photoURL,
        signedAt: p.signedAt ? p.signedAt.toDate() : (p.createdAt ? p.createdAt.toDate() : null),
        isMe: p.id === userId,
        role: p.role || "user",
        note: p.note || null,
        services: p.services || null,
      };
    }).sort((a: any, b: any) => {
      const timeA = a.signedAt ? a.signedAt.getTime() : 0;
      const timeB = b.signedAt ? b.signedAt.getTime() : 0;
      return timeA - timeB;
    });

    // 2. Manual participants (array of strings OR objects)
    const manual = manualParticipants.map((entry: any) => {
      let displayName = "Sconosciuto";
      let note = null;
      let services = null;
      const manualId = buildManualParticipantId(entry);

      if (typeof entry === "string") {
        displayName = entry;
      } else if (entry && typeof entry === "object") {
        displayName = entry.name || "Sconosciuto";
        note = entry.note || null;
        services = entry.services || null;
      }

      return ({
        type: "manual",
        id: manualId,
        uid: null,
        displayName,
        note, // ADDED
        services, // ADDED
        photoURL: null,
        signedAt: entry?.createdAt ? entry.createdAt.toDate() : null,
        isMe: false,
        role: "guest",
      });
    }).sort((a: any, b: any) => {
      // Sort manual by creation time if available, otherwise keep index order (stable sort usually)
      // If we want insertion order, we can rely on index, but sorting ensures correctness if data was messed up.
      // However, if legacy strings don't have date, they go first?
      // User says "In alto i primi inseriti". 
      // If we trust array order, we don't need sort. But let's be safe.
      const timeA = a.signedAt ? a.signedAt.getTime() : Infinity; // If no date, put at end? Or beginning?
      // Actually, relying on array index is safer for "insertion order" if dates are missing.
      // But user said "in base alla data".
      // Let's stick to array order for manual as it's the definition of insertion order.
      // So NO explicit sort for `manual` unless needed. 
      // User: "Dopo gli inseriti manualmente sempre in base alla data di inserimento"
      // Since we append, array order IS insertion order.
      return 0;
    });

    return [...registered, ...manual];
  }, [participants, manualParticipants, userId, publicIndex, profile]);

  const userIsParticipant = participants.some((p) => p.id === userId);
  const selfParticipant = useMemo(() => participants.find((p) => p.id === userId) ?? null, [participants, userId]);
  const totalCount = allParticipants.length;
  const isFull =
    typeof ride?.maxParticipants === "number" &&
    totalCount >= ride.maxParticipants;



  // Service Stats Summary
  const serviceStatsSummary = useMemo(() => {
    if (!ride?.extraServices) return null;
    const activeKeys = SERVICE_KEYS.filter(k => ride.extraServices?.[k]?.enabled);
    if (activeKeys.length === 0) return null;

    const stats: Record<string, { yes: number, no: number }> = {};
    activeKeys.forEach(k => { stats[k] = { yes: 0, no: 0 }; });

    allParticipants.forEach(p => {
      if (p.services) {
        activeKeys.forEach(k => {
          const val = p.services[k];
          if (val === 'yes') stats[k].yes++;
          if (val === 'no') stats[k].no++;
        });
      }
    });

    return { keys: activeKeys, stats };
  }, [ride, allParticipants]);
  const isCancelled = ride?.status === "cancelled";
  const isArchived = !!ride?.archived;

  // Can Join?
  // User must approve disclaimer? We assume yes or implicit.
  // Logic: Not cancelled, not archived, not full (unless admin?), not already joined.
  const canJoin =
    !loading &&
    !isArchived &&
    !isCancelled &&
    (!isFull || isAdmin) &&
    !userIsParticipant &&
    profile?.approved;

  // ----------------------------------------------------------------
  // HELPERS FOR JOIN
  // ----------------------------------------------------------------
  const fetchPublicMini = useCallback(async (uid: string) => {
    try {
      const publicSnap = await getDoc(doc(db, "users_public", uid));
      if (publicSnap.exists()) return publicSnap.data() as PublicUserDoc;
    } catch { }

    try {
      const userSnap = await getDoc(doc(db, "users", uid));
      if (userSnap.exists()) return userSnap.data() as PublicUserDoc;
    } catch { }

    return { displayName: "Utente" } as PublicUserDoc;
  }, []);

  const closeNoteModal = useCallback(() => {
    if (joinSaving) return;
    setNoteModalVisible(false);
    setJoinServices(emptySelection());
    setEditTarget(null);
    setNoteText("");
  }, [joinSaving]);

  const buildSelectionFromServices = useCallback(
    (services?: RideServiceResponseMap | null): RideServiceSelectionMap => {
      return {
        lunch: ride?.extraServices?.lunch?.enabled ? (services?.lunch ?? "no") : null,
        dinner: ride?.extraServices?.dinner?.enabled ? (services?.dinner ?? "no") : null,
        overnight: ride?.extraServices?.overnight?.enabled ? (services?.overnight ?? "no") : null,
      };
    },
    [ride?.extraServices]
  );

  const openJoinModal = useCallback(() => {
    setEditTarget(null);
    setNoteText("");
    setJoinServices(buildSelectionFromServices());
    setNoteModalVisible(true);
  }, [buildSelectionFromServices]);

  const openEditModal = useCallback(
    (target: { id: string; type: "user" | "manual"; note?: string | null; services?: RideServiceResponseMap | null; displayName?: string }) => {
      if (isArchived || isCancelled) return;
      setEditTarget({ id: target.id, type: target.type, displayName: target.displayName });
      setNoteText(target.note ?? "");
      setJoinServices(buildSelectionFromServices(target.services ?? null));
      setNoteModalVisible(true);
    },
    [buildSelectionFromServices, isArchived, isCancelled]
  );

  const setServiceValue = useCallback(
    (
      key: RideServiceKey,
      nextValue: boolean,
      setState: React.Dispatch<React.SetStateAction<RideServiceSelectionMap>>
    ) => {
      setState((prev) => ({ ...prev, [key]: nextValue ? "yes" : "no" }));
    },
    []
  );

  // ----------------------------------------------------------------
  // ACTIONS
  // ----------------------------------------------------------------
  const handleUpdateParticipation = async () => {
    if (!editTarget) return;
    if (isArchived || isCancelled) return;
    setJoinSaving(true);
    try {
      const safeNote = noteText ? noteText.trim().slice(0, 500) : null;
      const cleanServices: RideServiceResponseMap = {};
      SERVICE_KEYS.forEach((key) => {
        const val = joinServices[key];
        if (val) cleanServices[key] = val;
      });
      if (editTarget.type === "manual") {
        const index = Number(editTarget.id.replace("manual_", ""));
        if (!Number.isFinite(index) || index < 0 || index >= manualParticipants.length) return;
        const current = manualParticipants[index];
        const base =
          typeof current === "string"
            ? { name: current }
            : { ...current };
        const updatedEntry = {
          ...base,
          note: safeNote,
          services: Object.keys(cleanServices).length > 0 ? cleanServices : null,
        };
        const nextManual = [...manualParticipants];
        nextManual[index] = updatedEntry;
        await updateDoc(doc(db, collectionName, rideId), { manualParticipants: nextManual });
      } else {
        await updateDoc(doc(db, collectionName, rideId, "participants", editTarget.id), {
          note: safeNote,
          ...(Object.keys(cleanServices).length > 0 ? { services: cleanServices } : {}),
        });
      }
    } finally {
      setJoinSaving(false);
      closeNoteModal();
    }
  };

  const handleJoin = async () => {
    if (!profile?.approved) {
      Alert.alert("Attenzione", "Il tuo profilo deve essere approvato per partecipare.");
      return;
    }
    setJoining(true);
    try {
      const userRef = doc(db, collectionName, rideId, "participants", userId!);

      // Prepare payload strictly according to firestore.rules
      // allowed keys: ['uid','name','displayName','nickname','note','createdAt','services']

      // 1. Check if doc exists (to distinguish CREATE vs UPDATE)
      const userSnap = await getDoc(userRef);
      const isUpdate = userSnap.exists();

      // 2. Resolve Names
      const publicMini = publicIndex[userId!] || await fetchPublicMini(userId!) || {};
      const name = buildPublicName(publicMini) || profile?.displayName || "Utente";
      const safeName = name.slice(0, 120);

      // NOTE: The security rule validParticipantCreate accesses 'note' without checking has('note').
      // Therefore we MUST allow 'note' in the payload, even if null.
      const safeNote = noteText ? noteText.trim().slice(0, 500) : null;

      // VALIDATION: Mandatory Service Selection
      if (ride.extraServices) {
        const missingServices = SERVICE_KEYS.filter(key => {
          const cfg = ride.extraServices?.[key];
          if (!cfg?.enabled) return false;
          // Must have a selection (yes or no)
          return !joinServices[key];
        });

        if (missingServices.length > 0) {
          // Get labels for clearer error
          const labels = missingServices.map(k => ride.extraServices?.[k]?.label || SERVICE_LABELS[k]).join(", ");
          Alert.alert("Scelta obbligatoria", `Devi indicare SI o NO per i seguenti servizi: ${labels}`);
          setJoining(false);
          return;
        }
      }

      // 3. Prepare Payloads strictly according to Active Rules
      // Allowed: ['uid','name','displayName','nickname','note','createdAt','services']
      // Forbidden: 'email','photoURL','role','signedAt'

      if (isUpdate) {
        // --- UPDATE ---
        const updatePayload: any = {
          note: safeNote,
        };

        // services (filter nulls to be clean, though rules allow null)
        if (joinServices && Object.values(joinServices).some(v => v !== null)) {
          // Ensure only valid keys are sent
          const cleanServices: any = {};
          if (joinServices.lunch) cleanServices.lunch = joinServices.lunch;
          if (joinServices.dinner) cleanServices.dinner = joinServices.dinner;
          if (joinServices.overnight) cleanServices.overnight = joinServices.overnight;
          if (Object.keys(cleanServices).length > 0) {
            updatePayload.services = cleanServices;
          }
        }

        console.warn("[RideDetails] Update Payload", JSON.stringify(updatePayload));
        await updateDoc(userRef, updatePayload);
      } else {
        // --- CREATE ---
        const createPayload: any = {
          uid: userId,
          createdAt: serverTimestamp(),
          note: safeNote, // REQUIRED to prevent rule crash
        };
        // Optionals
        if (safeName) createPayload.name = safeName;
        if (profile?.displayName) createPayload.displayName = profile.displayName.slice(0, 120);
        if ((profile as any)?.nickname) createPayload.nickname = (profile as any).nickname.slice(0, 120);

        // services
        if (joinServices && Object.values(joinServices).some(v => v !== null)) {
          const cleanServices: any = {};
          if (joinServices.lunch) cleanServices.lunch = joinServices.lunch;
          if (joinServices.dinner) cleanServices.dinner = joinServices.dinner;
          if (joinServices.overnight) cleanServices.overnight = joinServices.overnight;
          if (Object.keys(cleanServices).length > 0) {
            createPayload.services = cleanServices;
          }
        }

        console.warn("[RideDetails] Create Payload", JSON.stringify(createPayload));
        await setDoc(userRef, createPayload);
      }

      // Update denormalized counts on ride doc (optional but good for list headers)
      // We rely on cloud function usually, but let's do optimistic check if needed?

      Alert.alert("Partecipazione confermata", "Ti sei iscritto all'uscita!");
    } catch (e) {
      console.error("[RideDetails] Join failed", e);
      Alert.alert("Errore", "Impossibile iscriversi al momento. Verifica la tua connessione.");
    } finally {
      setJoining(false);
      closeNoteModal();
    }
  }; // Explicitly close handleJoin

  const handleSaveParticipation = async () => {
    if (editTarget) return handleUpdateParticipation();
    return handleJoin();
  };

  const handleLeave = async () => {
    if (isArchived || isCancelled) return;
    Alert.alert(
      "Rimuovere partecipante?",
      "Confermi la rimozione della tua iscrizione dall’evento?",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Rimuovi",
          style: "destructive",
          onPress: async () => {
            try {
              if (userId) {
                await deleteDoc(doc(db, collectionName, rideId, "participants", userId));
                Alert.alert("Fatto", "Non sei più tra i partecipanti.");
              }
            } catch (e) {
              Alert.alert("Errore", "Impossibile annullare iscrizione.");
            }
          },
        },
      ]
    );
  };

  // Admin/Guide actions on participants
  const handleRemoveParticipant = async (p: any) => {
    // RESTRICTION: Only Admin or Owner (isAdmin includes Owner permissions)
    if (!isAdmin) return;
    if (isArchived || isCancelled) return;
    const displayName = p.displayName || "partecipante";
    Alert.alert(
      "Rimuovere partecipante?",
      `Confermi la rimozione di ${displayName} dall’evento?`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Rimuovi",
          style: "destructive",
          onPress: async () => {
            try {
              if (p.type === "manual") {
                const index = Number(String(p.id).replace("manual_", ""));
                if (!Number.isFinite(index) || index < 0 || index >= manualParticipants.length) {
                  Alert.alert("Errore", "Partecipante manuale non trovato.");
                  return;
                }
                const nextManual = [...manualParticipants];
                nextManual.splice(index, 1);
                await updateDoc(doc(db, collectionName, rideId), {
                  manualParticipants: nextManual,
                });
              } else {
                await deleteDoc(doc(db, collectionName, rideId, "participants", p.id));
              }
            } catch (e) {
              Alert.alert("Errore", "Impossibile rimuovere il partecipante.");
            }
          },
        },
      ]
    );
  };

  const handleAddManual = () => {
    setManualName("");
    setManualNote("");
    setManualServices(buildSelectionFromServices());
    setManualModalVisible(true);
  };

  const handleConfirmManual = async () => {
    if (!manualName.trim()) {
      Alert.alert("Errore", "Inserisci almeno il nome.");
      return;
    }

    // VALIDATION: Mandatory Service Selection
    if (ride.extraServices) {
      const missingServices = SERVICE_KEYS.filter(key => {
        const cfg = ride.extraServices?.[key];
        if (!cfg?.enabled) return false;
        return !manualServices[key];
      });

      if (missingServices.length > 0) {
        const labels = missingServices.map(k => ride.extraServices?.[k]?.label || SERVICE_LABELS[k]).join(", ");
        Alert.alert("Scelta obbligatoria", `Devi indicare SI o NO per i servizi: ${labels}`);
        return;
      }
    }

    try {
      // Clean manual services
      const cleanServices: any = {};
      if (manualServices.lunch) cleanServices.lunch = manualServices.lunch;
      if (manualServices.dinner) cleanServices.dinner = manualServices.dinner;
      if (manualServices.overnight) cleanServices.overnight = manualServices.overnight;

      const createdAt = Timestamp.now();
      const manualId = `manual_${createdAt.toMillis()}_${Math.random().toString(36).slice(2, 8)}`;
      const newEntry = {
        name: manualName.trim(),
        note: manualNote.trim() || null,
        services: Object.keys(cleanServices).length > 0 ? cleanServices : null,
        addedBy: profile?.displayName || "Admin",
        manualId,
        createdAt,
        type: "manual",
      };

      const currentManual = ride.manualParticipants || [];
      await updateDoc(doc(db, collectionName, rideId), {
        manualParticipants: [...currentManual, newEntry],
      });
      setManualModalVisible(false);
    } catch (e) {
      Alert.alert("Errore", "Impossibile aggiungere manuale.");
    }
  };

  const handleCancelRide = async () => {
    Alert.alert(
      "Annulla Uscita",
      "Sei sicuro di voler ANNULLARE questa uscita? I partecipanti saranno avvisati.",
      [
        { text: "No", style: "cancel" },
        {
          text: "Sì, Annulla",
          style: "destructive",
          onPress: async () => {
            await updateDoc(doc(db, collectionName, rideId), { status: "cancelled" });
            Alert.alert("Uscita Annullata");
            // Here you might trigger a notification function
            await sendCancellationNotification();
          },
        },
      ]
    );
  };

  const handleRestoreRide = async () => {
    await updateDoc(doc(db, collectionName, rideId), { status: "active" });
    Alert.alert("Uscita Ripristinata");
  };

  const handleDeleteRide = async () => {
    Alert.alert("Elimina Definitive", "Questa azione è irreversibile!", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Elimina",
        style: "destructive",
        onPress: async () => {
          await deleteDoc(doc(db, collectionName, rideId));
          navigation.goBack();
        },
      },
    ]);
  };

  // Notification helper
  const sendCancellationNotification = async () => {
    try {
      // Create verify notification doc
      const newNotifRef = doc(collection(db, "notifications"));
      await setDoc(newNotifRef, {
        type: "ride_cancelled",
        rideId,
        title: ride.title,
        createdAt: serverTimestamp(),
        read: false,
        target: "all_participants", // Backend handles logic
      });
    } catch (e) {
      if (__DEV__) {
        console.log("Notification trigger failed", e);
      }
    }
  };

  const handleShare = async () => {
    try {
      const dateStr = ride.date ? format(ride.date.toDate(), "dd/MM/yyyy") : "";
      const msg = `🚴 Uscita BHI: ${ride.title}\n📅 ${dateStr}\n📍 ${ride.meetingPoint}\n\nPartecipa sull'app!`;
      await Share.share({ message: msg });
    } catch (error) {
      // ignore
    }
  };

  const handleAddToCalendar = async () => {
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status === "granted") {
        const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
        const defaultCalendar =
          calendars.find((cal) => cal.isPrimary) || calendars[0];
        if (defaultCalendar) {
          const startDate = ride.dateTime ? ride.dateTime.toDate() : ride.date.toDate();
          const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // +2h
          await Calendar.createEventAsync(defaultCalendar.id, {
            title: `🚴 ${ride.title}`,
            startDate,
            endDate,
            location: ride.meetingPoint,
            notes: ride.description || "",
          });
          Alert.alert("Successo", "Evento aggiunto al calendario!");
        } else {
          Alert.alert("Errore", "Nessun calendario trovato.");
        }
      } else {
        Alert.alert("Permesso negato", "Impossibile accedere al calendario.");
      }
    } catch (e) {
      Alert.alert("Errore", "Impossibile aggiungere evento.");
    }
  };

  const handleContactParticipant = (phoneNumber: string | null) => {
    if (!phoneNumber) return;

    // Ensure clean number for logic
    const cleanPhone = phoneNumber.replace(/\s+/g, "");

    const options = ["Apri WhatsApp", "Chiama", "Annulla"];
    const destructiveButtonIndex = -1;
    const cancelButtonIndex = 2;

    const executeAction = (index: number) => {
      if (index === 0) {
        // WhatsApp: remove '+' prefix
        const waNumber = cleanPhone.startsWith("+") ? cleanPhone.substring(1) : cleanPhone;
        const waUrl = `whatsapp://send?phone=${waNumber}`;

        Linking.openURL(waUrl).catch(() => {
          // Fallback
          const webUrl = `https://wa.me/${waNumber}`;
          Linking.openURL(webUrl).catch(() => {
            Alert.alert("Errore", "Impossibile aprire WhatsApp.");
          });
        });
      } else if (index === 1) {
        // Call: keep '+' prefix if present (E.164)
        const telUrl = `tel:${cleanPhone}`;
        Linking.openURL(telUrl).catch(() => {
          Alert.alert("Errore", "Impossibile effettuare la chiamata.");
        });
      }
    };

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex,
          destructiveButtonIndex,
          title: "Contatta partecipante",
        },
        (buttonIndex) => executeAction(buttonIndex)
      );
    } else {
      // Android simple alert/sheet equivalent
      Alert.alert(
        "Contatta partecipante",
        undefined,
        [
          { text: "Apri WhatsApp", onPress: () => executeAction(0) },
          { text: "Chiama", onPress: () => executeAction(1) },
          { text: "Annulla", style: "cancel" }
        ],
        { cancelable: true }
      );
    }
  };

  // ----------------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------------
  if (loading || !ride) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={UI.colors.primary} />
      </View>
    );
  }




  const dateLabel = ride.date
    ? format(ride.date.toDate(), "EEEE d MMMM yyyy", { locale: it })
    : "Data da definire";
  const timeLabel = ride.dateTime
    ? format(ride.dateTime.toDate(), "HH:mm")
    : "--:--";

  const isTrek = ride.kind === "trek";
  const isTrip = ride.kind === "trip";
  const tripData = ride.trip;

  let guideLabel =
    ride.guidaNames && ride.guidaNames.length > 0
      ? ride.guidaNames.join(", ")
      : ride.guidaName || "Da assegnare";

  if (isTrip && tripData?.Informazioni?.organizzatore) {
    guideLabel = tripData.Informazioni.organizzatore;
  }

  const bikeCategory = (!isTrek && !isTrip) ? getBikeCategoryLabel(ride) : "";
  const eventAccentColor = isTrek ? UI.colors.eventTrekking : isTrip ? UI.colors.eventTravel : UI.colors.eventCycling;
  const status = getRideStatus(ride); // active, cancelled, archived
  const sectionIcon = isTrek ? "hiking" : isTrip ? "bag-checked" : "bike";

  return (
    <Screen useNativeHeader={true} scroll={false} backgroundColor="#FDFCF8">
      {/* 
        Unified Header
        Back Button: Show
        Right Action: IF Admin -> Edit Icon 
      */}
      <ScreenHeader
        title={ride?.title ?? "Dettaglio Uscita"}
        subtitle={
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
            <Ionicons name="calendar-outline" size={14} color="#64748B" style={{ marginRight: 4 }} />
            <Text style={{ fontSize: 14, fontWeight: "500", color: "#64748B" }}>
              {dateLabel} • {timeLabel}
            </Text>
          </View>
        }
        showBack={true}
        backIconColor={eventAccentColor}
        headerIcon={sectionIcon}
        headerIconColor={eventAccentColor}
        titleNumberOfLines={3}
        titleAllowShrink={true}
        titleMinScale={0.5}
        rightAction={
          (isAdmin || isGuide) && (
            <TouchableOpacity onPress={() => navigation.navigate("CreateRide", { editMode: true, rideId, collectionName, kind })}>
              <Ionicons name="pencil" size={20} color="#1E293B" />
            </TouchableOpacity>
          )
        }
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {/* TOP CARD: Title, Badges, Main Info */}
        <View style={[styles.topCard, { borderLeftWidth: 4, borderLeftColor: eventAccentColor }]}>
          {/* Status Badge */}
          <View style={styles.banner}>
            <View style={styles.badgesRow}>
              <StatusBadge status={status} />
              {!isTrip && <DifficultyBadge level={ride.difficulty} />}
            </View>
          </View>

          <View style={{ padding: 16 }}>
            {/* Title & Date removed from here, moved to Header */}

            <View style={styles.infoGrid}>
              {/* Type - Conditionally Render */}
              {!isTrek && !isTrip && (
                <View style={styles.infoRow}>
                  <Ionicons name="bicycle-outline" size={18} color={UI.colors.action} />
                  <Text style={styles.infoText}>{bikeCategory}</Text>
                </View>
              )}
              {isTrek && (
                <>
                  {ride.trek?.elevation && (
                    <View style={styles.infoRow}>
                      <Ionicons name="trending-up" size={18} color={UI.colors.action} />
                      <Text style={styles.infoText}>Dislivello: <Text style={{ fontWeight: '600' }}>{ride.trek.elevation} m</Text></Text>
                    </View>
                  )}
                  {ride.trek?.length && (
                    <View style={styles.infoRow}>
                      <Ionicons name="resize" size={18} color={UI.colors.action} />
                      <Text style={styles.infoText}>Sviluppo: <Text style={{ fontWeight: '600' }}>{ride.trek.length} km</Text></Text>
                    </View>
                  )}
                </>
              )}
              {/* Trip Info */}
              {isTrip && tripData?.Tipologia && (
                <>
                  <View style={styles.infoRow}>
                    <Ionicons name="compass-outline" size={18} color={UI.colors.action} />
                    <Text style={styles.infoText}>{tripData.Tipologia.tipoViaggio || "Viaggio"}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="bus-outline" size={18} color={UI.colors.action} />
                    <Text style={styles.infoText}>{tripData.Tipologia.mezzoTrasporto || "Mezzo non spec."}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="time-outline" size={18} color={UI.colors.action} />
                    <Text style={styles.infoText}>{tripData.Tipologia.durataGiorni || "Durata non spec."}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="bed-outline" size={18} color={UI.colors.action} />
                    <Text style={styles.infoText}>{tripData.Tipologia.tipoPernotto || "Pernotto non spec."}</Text>
                  </View>
                </>
              )}
              {/* Location */}
              <View style={styles.infoRow}>
                <Ionicons name="location-outline" size={18} color={UI.colors.action} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoText}>{ride.meetingPoint}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      const query = encodeURIComponent(ride.meetingPoint);
                      const url = Platform.select({
                        ios: `maps:0,0?q=${query}`,
                        android: `geo:0,0?q=${query}`,
                      });
                      if (url) Linking.openURL(url);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}
                  >
                    <Text style={{ color: UI.colors.action, fontWeight: '700', fontSize: 13 }}>Apri mappa</Text>
                    <Ionicons name="open-outline" size={14} color={UI.colors.action} style={{ marginLeft: 2 }} />
                  </TouchableOpacity>
                </View>
              </View>
              {/* Guide/Organizer */}
              <View style={styles.infoRow}>
                <Ionicons name="person-outline" size={18} color={UI.colors.action} />
                <Text style={styles.infoText}>{isTrip ? "Organizzatore" : "Guida"}: <Text style={{ fontWeight: '600' }}>{guideLabel}</Text></Text>
              </View>

            </View>
          </View>
        </View>

        {/* MANDATORY GEAR */}
        {isTrek && ride.trek?.mandatoryGear && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Attrezzatura Obbligatoria</Text>
            <Text style={styles.descriptionText}>
              {ride.trek.mandatoryGear}
            </Text>
          </View>
        )}

        {/* DESCRIPTION */}
        {ride.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Descrizione</Text>
            {Platform.OS === "ios" ? (
              <TextInput
                value={ride.description}
                editable={false}
                multiline
                scrollEnabled={false}
                dataDetectorTypes={["link"]}
                style={[styles.descriptionText, { padding: 0, color: "#475569" }]}
              />
            ) : (
              <Text style={styles.descriptionText} selectable>
                {renderLinkedText(ride.description, handlePressLink)}
              </Text>
            )}
          </View>
        )}

        {/* EXTRA SERVICES SUMMARY */}
        {serviceStatsSummary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Riepilogo Servizi</Text>
            <View style={[styles.summaryCard, { borderLeftWidth: 4, borderLeftColor: eventAccentColor }]}>
              {serviceStatsSummary.keys.map(key => {
                const label = ride.extraServices?.[key]?.label || SERVICE_LABELS[key as RideServiceKey];
                const counts = serviceStatsSummary.stats[key];
                return (
                  <View key={key} style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>{label}</Text>
                    <View style={styles.summaryBadges}>
                      <View style={[styles.summaryBadge, { backgroundColor: "#dcfce7" }]}>
                        <Text style={[styles.summaryBadgeText, { color: "#166534" }]}>SI: {counts.yes}</Text>
                      </View>
                      <View style={[styles.summaryBadge, { backgroundColor: "#f1f5f9" }]}>
                        <Text style={[styles.summaryBadgeText, { color: "#64748b" }]}>NO: {counts.no}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* USER RESERVATION CARD (Unified Design) */}
        {selfParticipant && (
          <View style={styles.sectionTight}>
            <View
              style={[
                styles.unifiedSelfCard,
                isTrip && styles.unifiedSelfCardTrip,
                isTrek && styles.unifiedSelfCardTrek,
              ]}
            >
              {/* Header */}
              <View style={styles.unifiedHeader}>
                <Ionicons name="checkmark-circle" size={24} color={UI.colors.action} />
                <View>
                  <Text style={styles.unifiedTitle}>Sei prenotato come:</Text>
                  <Text style={styles.unifiedSubtitle}>
                    {selfParticipant.displayName} {selfParticipant.isMe && "(Tu)"}
                  </Text>
                </View>
              </View>

              {/* Note Box */}
              <View style={styles.noteBox}>
                <Text style={styles.noteLabel}>NOTA</Text>
                <Text style={[styles.noteText, !selfParticipant.note && styles.noteTextPlaceholder]}>
                  {selfParticipant.note ? selfParticipant.note.trim() : "Nessuna nota"}
                </Text>

                {/* Extra Services (Inline with Note block logic as requested "sotto la nota") */}
                {ride?.extraServices && (
                  <View style={styles.servicesBlock}>
                    {SERVICE_KEYS.filter((k) => ride.extraServices?.[k]?.enabled).map((key) => {
                      const enabled = selfParticipant.services?.[key] === "yes";
                      if (!enabled) return null; // Show only selected services? Request said "Pranzo: Sì", implying list.
                      const label = ride.extraServices?.[key]?.label || SERVICE_LABELS[key];
                      return (
                        <Text key={key} style={styles.serviceItem}>
                          {label}: Sì
                        </Text>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Actions */}
              <View style={styles.unifiedActions}>
                <TouchableOpacity
                  onPress={() => openEditModal(selfParticipant)}
                  style={styles.unifiedActionBtn}
                >
                  <Text style={styles.unifiedActionText}>Modifica nota e servizi</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleLeave}
                  style={[styles.unifiedActionBtn, styles.unifiedActionDestructive]}
                >
                  <Text style={styles.unifiedActionDestructiveText}>Non partecipo</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* PARTICIPANTS */}
        <View style={styles.section}>
          {/* Join/Leave Actions moved here */}
          {!userIsParticipant && !isArchived && !isCancelled && (
            <View style={{ marginBottom: 16 }}>
              {canJoin ? (
                <Pressable
                  style={[styles.bigButton, { backgroundColor: UI.colors.action }]}
                  onPress={openJoinModal}
                  disabled={joining}
                >
                  {joining ? <ActivityIndicator color="#fff" /> : <Text style={styles.bigButtonText}>Partecipa all'uscita</Text>}
                </Pressable>
              ) : (
                <View style={[styles.bigButton, { backgroundColor: "#f1f5f9", borderColor: "#e2e8f0" }]}>
                  <Text style={[styles.bigButtonText, { color: "#94a3b8" }]}>
                    {isFull ? "Lista Piena" : "Iscrizioni Chiuse"}
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>
              Partecipanti ({totalCount}{ride.maxParticipants ? `/${ride.maxParticipants}` : ""})
            </Text>
            {/* ONLY ADMIN/OWNER can add manual participants */}
            {(isAdmin) && !isArchived && !isCancelled && (
              <TouchableOpacity onPress={handleAddManual} style={styles.addManualBtn}>
                <Ionicons name="add-circle" size={20} color={UI.colors.action} />
                <Text style={styles.addManualText}>Aggiungi</Text>
              </TouchableOpacity>
            )}
          </View>

          {allParticipants.length === 0 ? (
            <Text style={styles.emptyText}>Nessun partecipante ancora.</Text>
          ) : (
            allParticipants.map((p, idx) => {
              const participantUid = p.uid || p.id;
              const phoneNumber = participantUid ? (phoneByUid[participantUid] ?? null) : null;
              const showPhone = isAdminOrOwner && !!phoneNumber && phoneNumber.startsWith("+");
              const showEdit = isAdmin && !isArchived && !isCancelled;
              const showRemove = isAdminOrOwner || p.isMe;
              const showActionsRow = showPhone || showEdit || showRemove;
              const phoneActionStyle = showEdit || showRemove ? { marginBottom: 6 } : null;
              const editActionStyle = showRemove ? { marginBottom: 6 } : null;
              console.log("[RideDetails] render participant", participantUid, showPhone, phoneNumber);
              return (
                <View
                  key={participantUid || p.id}
                  style={[styles.participantCard, idx === allParticipants.length - 1 && styles.participantCardLast]}
                >
                  <View style={styles.participantRow}>
                    <View style={styles.participantAvatar}>
                      {p.photoURL ? (
                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#ddd', overflow: 'hidden' }}>
                          {/* Image component would go here */}
                          <Text style={{ textAlign: 'center', lineHeight: 32 }}>Img</Text>
                        </View>
                      ) : (
                        <View style={[styles.avatarPlaceholder, p.type === "manual" && { backgroundColor: "#f1f5f9" }]}>
                          <Ionicons name={p.type === "manual" ? "person-add-outline" : "person"} size={14} color="#64748b" />
                        </View>
                      )}
                    </View>
                    <View style={styles.participantInfo}>
                      <Text style={styles.participantName}>
                        {p.displayName} {p.isMe && "(Tu)"}
                      </Text>
                      {/* Show Note if present */}
                      {p.note && (
                        <Text style={[styles.participantSub, { color: "#334155", fontStyle: "italic" }]}>
                          "{p.note}"
                        </Text>
                      )}
                      {/* Show Services if present */}
                      {p.services && (
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          {Object.keys(p.services).map(key => {
                            const val = p.services[key]; // "yes" or "no"
                            if (val !== "yes") return null;
                            const label = SERVICE_LABELS[key as RideServiceKey] || key;
                            return (
                              <View key={key} style={{ backgroundColor: "#dcfce7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ fontSize: 12, color: "#166534", fontWeight: "700" }}>{label}</Text>
                              </View>
                            );
                          })}
                        </View>
                      )}
                      {/* Show generic label if manual and nothing else */}
                      {p.type === "manual" && !p.note && !p.services && <Text style={styles.participantSub}>Registrato manualmente</Text>}
                    </View>
                    {showActionsRow && (
                      <View style={styles.participantActions}>
                        {/* Access to contact only if phoneNumber is present AND user is Admin/Owner */}
                        {showPhone && (
                          <TouchableOpacity
                            onPress={() => handleContactParticipant(phoneNumber)}
                            style={[{ padding: 4 }, phoneActionStyle]}
                            hitSlop={8}
                          >
                            <Ionicons name="call-outline" size={20} color={UI.colors.action} />
                          </TouchableOpacity>
                        )}

                        {showEdit && (
                          <Pressable
                            onPress={() => openEditModal({ ...p, type: p.type === "manual" ? "manual" : "user" })}
                            hitSlop={10}
                            style={[styles.editIconBtn, editActionStyle]}
                          >
                            <Ionicons name="pencil" size={18} color={UI.colors.action} />
                          </Pressable>
                        )}
                        {/* ONLY ADMIN/OWNER can remove others. Users can remove themselves (p.isMe). */}
                        {showRemove && (
                          <TouchableOpacity
                            onPress={() => (p.isMe ? handleLeave() : handleRemoveParticipant(p))}
                            style={{ padding: 4 }}
                            disabled={isArchived || isCancelled}
                          >
                            <Ionicons name="close-circle-outline" size={20} color="#ef4444" />
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>



        {/* MODALS */}
        <Modal
          visible={noteModalVisible}
          transparent
          animationType="fade"
          onRequestClose={closeNoteModal}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
            style={styles.modalWrap}
          >
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              <View style={[styles.modalCard, { gap: 12 }]}>
                <Text style={styles.modalTitle}>{editTarget ? "Modifica iscrizione" : "Partecipa all'Uscita"}</Text>
                <Text style={styles.modalSubtitle}>
                  {editTarget ? "Aggiorna nota e servizi extra." : `Vuoi aggiungere una nota per ${isTrip ? "l'organizzatore" : "la guida"}?`}
                </Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Es. Arrivo in ritardo, sono vegano..."
                  value={noteText}
                  onChangeText={setNoteText}
                  multiline
                  numberOfLines={3}
                />
                {SERVICE_KEYS.map((key) => {
                  const cfg = ride.extraServices?.[key];
                  if (!cfg?.enabled) return null;
                  const label = cfg.label || SERVICE_LABELS[key];
                  const isOn = joinServices[key] === "yes";
                  return (
                    <View key={key} style={styles.toggleRow}>
                      <Pressable
                        onPress={() => setServiceValue(key, !isOn, setJoinServices)}
                        hitSlop={10}
                        style={styles.toggleLabelPress}
                      >
                        <Text style={styles.toggleLabel}>{label}</Text>
                      </Pressable>
                      <View style={styles.toggleSwitchWrap}>
                        <Switch
                          value={isOn}
                          onValueChange={(nextValue) => setServiceValue(key, nextValue, setJoinServices)}
                          trackColor={{ false: "#CBD5E1", true: UI.colors.action }}
                          ios_backgroundColor="#CBD5E1"
                        />
                      </View>
                    </View>
                  );
                })}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    onPress={closeNoteModal}
                    style={styles.modalActionSecondary}
                  >
                    <Text style={styles.modalActionSecondaryText}>Annulla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSaveParticipation}
                    style={styles.modalActionPrimary}
                  >
                    <Text style={styles.modalActionPrimaryText}>{editTarget ? "Salva" : "Conferma"}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>

        <Modal
          visible={manualModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setManualModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
            style={styles.modalWrap}
          >
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              <View style={[styles.modalCard, { gap: 12 }]}>
                <Text style={styles.modalTitle}>Aggiungi Partecipante</Text>
                <Text style={styles.label}>Nome e Cognome *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Mario Rossi"
                  value={manualName}
                  onChangeText={setManualName}
                />
                <Text style={[styles.label, { marginTop: 12 }]}>Note (Opzionale)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Note..."
                  value={manualNote}
                  onChangeText={setManualNote}
                />
                {SERVICE_KEYS.map((key) => {
                  const cfg = ride.extraServices?.[key];
                  if (!cfg?.enabled) return null;
                  const label = cfg.label || SERVICE_LABELS[key];
                  const isOn = manualServices[key] === "yes";
                  return (
                    <View key={key} style={styles.toggleRow}>
                      <Pressable
                        onPress={() => setServiceValue(key, !isOn, setManualServices)}
                        hitSlop={10}
                        style={styles.toggleLabelPress}
                      >
                        <Text style={styles.toggleLabel}>{label}</Text>
                      </Pressable>
                      <View style={styles.toggleSwitchWrap}>
                        <Switch
                          value={isOn}
                          onValueChange={(nextValue) => setServiceValue(key, nextValue, setManualServices)}
                          trackColor={{ false: "#CBD5E1", true: UI.colors.action }}
                          ios_backgroundColor="#CBD5E1"
                        />
                      </View>
                    </View>
                  );
                })}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    onPress={() => {
                      setManualModalVisible(false);
                      setManualName("");
                      setManualNote("");
                    }}
                    style={styles.modalActionSecondary}
                  >
                    <Text style={styles.modalActionSecondaryText}>Annulla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleConfirmManual}
                    style={styles.modalActionPrimary}
                  >
                    <Text style={styles.modalActionPrimaryText}>Aggiungi</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>

        {/* SHARE & CALENDAR */}
        <View style={styles.actionGrid}>
          <TouchableOpacity style={styles.actionTile} onPress={handleShare}>
            <Ionicons name="share-social-outline" size={22} color={UI.colors.primary} />
            <Text style={styles.actionTileText}>Condividi</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionTile} onPress={handleAddToCalendar}>
            <Ionicons name="calendar-outline" size={22} color={UI.colors.primary} />
            <Text style={styles.actionTileText}>Salva in Calendario</Text>
          </TouchableOpacity>
        </View>

        {/* ADMIN DANGER ZONE */}
        {(isAdmin || isGuide) && (
          <View style={styles.adminZone}>
            <Text style={styles.adminTitle}>Gestione Amministratore</Text>
            {status === "cancelled" && (
              <TouchableOpacity style={styles.adminRow} onPress={handleRestoreRide}>
                <Ionicons name="refresh-circle" size={20} color="#f59e0b" />
                <Text style={[styles.adminRowText, { color: "#f59e0b" }]}>Ripristina Uscita</Text>
              </TouchableOpacity>
            )}
            {isAdmin && (
              <TouchableOpacity style={styles.adminRow} onPress={handleDeleteRide}>
                <Ionicons name="trash" size={20} color="#991b1b" />
                <Text style={[styles.adminRowText, { color: "#991b1b" }]}>Elimina Definitivamente</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Top Card
  topCard: {
    margin: 16,
    marginBottom: 20,
    backgroundColor: "#fff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 6,
    overflow: "hidden",
  },
  banner: { paddingVertical: 8, alignItems: "center", justifyContent: "center" },
  bannerText: { fontWeight: "800", fontSize: 13, letterSpacing: 1 },
  topCardContent: { paddingVertical: 24, paddingHorizontal: 22 },
  badgesRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%", paddingHorizontal: 4 },
  title: { fontSize: 24, fontWeight: "800", color: "#0F172A", marginBottom: 16, lineHeight: 30 },
  infoGrid: { gap: 12 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoText: { fontSize: 16, color: "#334155", fontWeight: "500", flex: 1 },

  // Sections
  section: { paddingHorizontal: 20, marginTop: 24 },
  sectionTight: { paddingHorizontal: 20, marginTop: 12 },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: "#1E293B" },
  descriptionText: { fontSize: 16, lineHeight: 24, color: "#475569" },
  editLink: { padding: 4 },
  editLinkText: { color: UI.colors.action, fontWeight: "700", fontSize: 13 },
  selfCard: { backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#e2e8f0", gap: 10 },
  selfRow: { flexDirection: "row", gap: 10 },
  selfLabel: { fontSize: 14, fontWeight: "700", color: "#475569", width: 120 },
  selfValue: { flex: 1, fontSize: 14, color: "#334155", fontWeight: "500" },
  selfServices: { flex: 1, gap: 4 },

  // Participants
  addManualBtn: { flexDirection: "row", alignItems: "center", gap: 4, padding: 4 },
  addManualText: { color: UI.colors.action, fontWeight: "700", fontSize: 13 },
  participantCard: {
    backgroundColor: UI.colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UI.colors.borderMuted,
    padding: 12,
    marginBottom: 8,
    ...UI.shadow.card,
  },
  participantCardLast: {
    marginBottom: 0,
  },
  participantRow: { flexDirection: "row", alignItems: "center" },
  participantAvatar: {},
  avatarPlaceholder: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#e2e8f0", alignItems: "center", justifyContent: "center" },
  participantInfo: { flex: 1, marginLeft: 12, minWidth: 0 },
  participantActions: { flexDirection: "column", alignItems: "center", justifyContent: "flex-start" },
  participantName: { fontSize: 15, fontWeight: "600", color: "#334155" },
  participantSub: { fontSize: 12, color: "#94a3b8" },
  emptyText: { color: "#94a3b8", fontStyle: "italic", marginTop: 4 },
  editIconBtn: { padding: 4 },

  // Buttons
  bigButton: {
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
    shadowColor: UI.colors.action,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  bigButtonText: { color: "#ffffff", fontWeight: "800", fontSize: 16 },

  // Action Grid
  actionGrid: { flexDirection: "row", gap: 12, paddingHorizontal: 16, marginTop: 24 },
  actionTile: { flex: 1, height: 92, backgroundColor: "#f8fafc", padding: 16, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: "#e2e8f0" },
  actionTileText: { fontWeight: "600", color: "#475569", fontSize: 13, textAlign: "center" },

  // Admin
  adminZone: { marginTop: 40, padding: 20, backgroundColor: "#fef2f2", borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  adminTitle: { fontSize: 14, fontWeight: "800", color: "#991b1b", marginBottom: 16, textTransform: "uppercase" },
  adminRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(153, 27, 27, 0.1)" },
  adminRowText: { fontSize: 15, fontWeight: "700" },

  // Modals
  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    borderRadius: 12,
    backgroundColor: "#fff",
    padding: 16,
  },
  modalScroll: { flex: 1, width: "100%" },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  modalSubtitle: { fontSize: 15, color: "#64748b", marginBottom: 8 },
  modalInput: { backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, fontSize: 16, color: "#334155", textAlignVertical: "top", minHeight: 80 },
  label: { fontSize: 14, fontWeight: "700", color: "#475569", marginBottom: 6 },
  input: { backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, fontSize: 16, color: "#334155" },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 4,
  },
  modalActionSecondary: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#e2e8f0",
  },
  modalActionSecondaryText: { color: "#1f2937", fontWeight: "700" },
  modalActionPrimary: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: UI.colors.primary,
  },
  modalActionPrimaryText: { color: "#fff", fontWeight: "800" },

  // Services
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#f8fafc", padding: 12, borderRadius: 12, marginTop: 10 },
  toggleLabelPress: { flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: "600", color: "#334155" },
  toggleSwitchWrap: { width: 52, alignItems: "flex-end" },

  // Summary
  summaryCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginTop: 12, borderWidth: 1, borderColor: "#e2e8f0" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  summaryLabel: { fontSize: 15, fontWeight: "600", color: "#334155" },
  summaryBadges: { flexDirection: "row", gap: 8 },
  summaryBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  summaryBadgeText: { fontSize: 12, fontWeight: "700" },

  // Unified Self Card
  unifiedSelfCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderLeftWidth: 6,
    borderLeftColor: UI.colors.action, // Default green
    padding: 16,
  },
  unifiedSelfCardTrip: {
    borderLeftColor: UI.colors.eventTravel, // Trip specific accent
  },
  unifiedSelfCardTrek: {
    borderLeftColor: UI.colors.eventTrekking,
  },
  unifiedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  unifiedTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
  },
  unifiedSubtitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#334155",
    marginTop: 2,
  },
  noteBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    marginBottom: 16,
  },
  noteLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  noteText: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 20,
    fontStyle: "italic",
  },
  noteTextPlaceholder: {
    color: "#94A3B8",
  },
  servicesBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    gap: 4,
  },
  serviceItem: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "500",
  },
  unifiedActions: {
    flexDirection: "row",
    gap: 12,
  },
  unifiedActionBtn: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  unifiedActionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
    textAlign: "center",
  },
  unifiedActionDestructive: {
    backgroundColor: "#FEF2F2",
  },
  unifiedActionDestructiveText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#DC2626",
    textAlign: "center",
  },
});
