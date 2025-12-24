// src/screens/RideDetails.tsx
import React, { useEffect, useMemo, useState, useCallback, useRef, useLayoutEffect } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActionSheetIOS,
} from "react-native";
import { RouteProp, useRoute, useNavigation } from "@react-navigation/native";
import { auth, db } from "../firebase";
import {
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
  setDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Screen, UI } from "../components/Screen";
import { PrimaryButton } from "../components/Button";
import { Ionicons } from "@expo/vector-icons";
import { StatusBadge } from "./calendar/StatusBadge";
import { getDifficultyMeta } from "../utils/rideDifficulty";
import { deriveGuideSummary } from "../utils/guideHelpers";
import { renderLinkedText } from "../utils/renderLinkedText";
import type { RootStackParamList } from "../navigation/types";
import type { ParticipantDoc, RideDoc, UserDoc } from "../types/firestore";

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

const ACTION_GREEN = "#22c55e";

type Ride = {
  title: string;
  meetingPoint: string;
  link?: string | null;
  description?: string | null;
  bikes?: string[];
  difficulty?: string | null;
  date?: Timestamp | null;
  dateTime?: Timestamp | null;
  maxParticipants?: number | null;
  participantsCount?: number;
  participantsCountSelf?: number;
  participantsCountTotal?: number;
  guidaName?: string | null;
  guidaNames?: string[] | null;
  createdBy: string;
  createdAt?: Timestamp | null;

  status?: "active" | "cancelled";
  archived?: boolean;
  archiveYear?: number | null;
  archiveMonth?: number | null;
  manualParticipants?: ManualParticipant[] | null;
  extraServices?: RideExtraServices | null;
};

type ManualParticipant = {
  id: string;
  name: string;
  note?: string | null;
  addedBy?: string | null;
  createdAt?: Timestamp | null;
  manual?: boolean;
  raw?: any;
  services?: RideServiceResponseMap | null;
};

type Participant = {
  id: string;
  uid?: string | null;
  name: string;
  note?: string | null;
  createdAt?: Timestamp | null;
  manual?: boolean;
  manualRaw?: ManualParticipant;
  addedBy?: string | null;
  services?: RideServiceResponseMap | null;
};

// Mini profilo pubblico per rendering elenco
type PublicMini = {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  nickname?: string | null;
};

export default function RideDetails() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, "RideDetails">>();
  const rideId = route.params?.rideId;

  // Hide native stack header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  const [ride, setRide] = useState<Ride | null>(null);
  const [loadingRide, setLoadingRide] = useState(true);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loadingParts, setLoadingParts] = useState(true);

  const [isAdmin, setIsAdmin] = useState(false);

  // indice dei nomi pubblici per uid (da users_public)
  const [publicIndex, setPublicIndex] = useState<Record<string, PublicMini>>({});

  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [showAllParticipants, setShowAllParticipants] = useState(false); // NEW: Toggle per lista partecipanti
  const [noteText, setNoteText] = useState("");
  const [joinSaving, setJoinSaving] = useState(false);

  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [manualSaving, setManualSaving] = useState(false);

  const [joinServices, setJoinServices] = useState<RideServiceSelectionMap>(() => emptySelection());
  const [manualServices, setManualServices] = useState<RideServiceSelectionMap>(() => emptySelection());

  const currentUid = auth.currentUser?.uid || "";

  // 👉 serve per non mostrare l'alert quando la cancellazione è volontaria
  const isDeletingRef = useRef(false);

  // ─────────────────────────────────────────
  // Helpers: nome pubblico
  // ─────────────────────────────────────────
  const buildPublicName = useCallback((p: PublicMini): string => {
    const fn = (p.firstName || "").trim();
    const ln = (p.lastName || "").trim();
    const dn = (p.displayName || "").trim();

    // 1) Preferisci sempre Cognome, Nome se disponibili
    if (ln || fn) return `${ln}${ln && fn ? ", " : ""}${fn}`.trim();

    // 2) Se non abbiamo first/last, prova a ricavarli dal displayName
    if (dn) {
      const parts = dn.split(/\s+/);
      if (parts.length >= 2) {
        const last = parts.pop() as string;
        const first = parts.join(" ");
        return `${last}, ${first}`;
      }
      return dn; // una sola parola: mostrala così com'è
    }

    // 3) Fallback finale
    return "Utente";
  }, []);

  const fetchPublicMini = useCallback(async (uid: string): Promise<PublicMini> => {
    // 1) Prova dalla collezione principale users/{uid}
    try {
      const main = await getDoc(doc(db, "users", uid));
      if (main.exists()) {
        const d = main.data() as UserDoc;
        return {
          firstName: d?.name ?? d?.firstName ?? d?.nome ?? null,
          lastName: d?.surname ?? d?.lastName ?? d?.cognome ?? null,
          displayName: d?.displayName ?? null,
          nickname: d?.nickname ?? null,
        };
      }
    } catch { }

    // 2) Fallback su users_public/{uid}
    try {
      const snap = await getDoc(doc(db, "users_public", uid));
      if (snap.exists()) {
        const d = snap.data() as any;
        return {
          firstName: d?.firstName ?? null,
          lastName: d?.lastName ?? null,
          displayName: d?.displayName ?? null,
          nickname: d?.nickname ?? null,
        };
      }
    } catch { }

    // 3) Fallback finale: usa displayName di auth se presente
    return { displayName: auth.currentUser?.displayName ?? null };
  }, []);

  // ─────────────────────────────────────────
  // Carica ride
  // ─────────────────────────────────────────
  useEffect(() => {
    if (!rideId) return;

    const ref = doc(db, "rides", rideId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setRide(null);
          setLoadingRide(false);

          // Se il doc non esiste più:
          if (isDeletingRef.current) {
            isDeletingRef.current = false;
          }

          const nav: any = navigation;
          if (nav?.canGoBack?.()) nav.goBack();
          else nav?.replace?.("UsciteList");
          return;
        }

        const d = snap.data() as RideDoc | undefined;
        const rawManual = Array.isArray(d?.manualParticipants) ? d.manualParticipants : [];
        const manualParticipants: ManualParticipant[] = rawManual
          .map((mp: any): ManualParticipant | null => {
            const name = (mp?.name ?? "").toString().trim();
            if (!name) return null;
            return {
              id:
                typeof mp?.id === "string" && mp.id
                  ? mp.id
                  : `manual_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
              name,
              note: mp?.note ?? null,
              addedBy: mp?.addedBy ?? null,
              createdAt: mp?.createdAt ?? null,
              manual: true,
              raw: mp,
              services: (mp?.services as RideServiceResponseMap) ?? null,
            };
          })
          .filter(Boolean) as ManualParticipant[];

        const updatedCount =
          typeof d?.participantsCountTotal === "number"
            ? d.participantsCountTotal
            : typeof d?.participantsCount === "number"
              ? d.participantsCount
              : participants.length + manualParticipants.length;

        setRide({
          title: d?.title ?? "",
          meetingPoint: d?.meetingPoint ?? "",
          link: d?.link ?? null,
          description: d?.description ?? null,
          bikes: d?.bikes ?? [],
          difficulty: d?.difficulty ?? null,
          date: d?.date ?? null,
          dateTime: d?.dateTime ?? null,
          maxParticipants: d?.maxParticipants ?? null,
          participantsCount: updatedCount,
          participantsCountSelf:
            typeof d?.participantsCountSelf === "number" ? d.participantsCountSelf : null,
          participantsCountTotal:
            typeof d?.participantsCountTotal === "number" ? d.participantsCountTotal : null,
          guidaName: d?.guidaName ?? null,
          guidaNames: Array.isArray(d?.guidaNames) ? d.guidaNames : null,
          createdBy: d?.createdBy,
          createdAt: d?.createdAt ?? null,

          status: (d?.status as Ride["status"]) ?? "active",
          archived: !!d?.archived,
          archiveYear: d?.archiveYear ?? null,
          archiveMonth: d?.archiveMonth ?? null,
          manualParticipants,
          extraServices: (d?.extraServices as RideExtraServices) ?? null,
        });
        setLoadingRide(false);
      },
      (err) => {
        console.error("Errore ride:", err);
        setLoadingRide(false);
        Alert.alert("Errore", "Impossibile caricare i dettagli dell’uscita.");
      }
    );

    return () => unsub();
  }, [rideId, navigation]);

  // ─────────────────────────────────────────
  // Carica partecipanti (ordinati per createdAt)
  // ─────────────────────────────────────────
  useEffect(() => {
    if (!rideId) return;
    const qy = query(
      collection(db, "rides", rideId, "participants"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const rows: Participant[] = [];
        snap.forEach((d) => {
          const x = d.data() as ParticipantDoc;
          rows.push({
            id: d.id,
            uid: x?.uid,
            name: x?.name ?? "",
            note: x?.note ?? null,
            createdAt: x?.createdAt ?? null,
            manual: x?.manual === true,
            addedBy: x?.addedBy ?? null,
            services: (x?.services as RideServiceResponseMap) ?? null,
          });
        });
        setParticipants(rows);
        setLoadingParts(false);
      },
      (err) => {
        console.error("Errore participants:", err);
        setLoadingParts(false);
      }
    );
    return () => unsub();
  }, [rideId]);

  // ─────────────────────────────────────────
  // Lookup nomi pubblici (users_public)
  // ─────────────────────────────────────────
  useEffect(() => {
    const missing = participants
      .map((p) => p.uid)
      .filter((uid): uid is string => typeof uid === "string" && !!uid && !publicIndex[uid]);

    if (missing.length === 0) return;

    (async () => {
      try {
        const entries = await Promise.all(
          missing.map(async (uid) => {
            const mini = await fetchPublicMini(uid);
            return [uid, mini] as const;
          })
        );

        setPublicIndex((prev) => {
          const next = { ...prev };
          for (const [uid, mini] of entries) next[uid] = mini;
          return next;
        });
      } catch (e) {
        console.warn("Lookup users_public fallita:", e);
      }
    })();
  }, [participants, publicIndex, fetchPublicMini]);

  // ─────────────────────────────────────────
  // Formattazioni
  // ─────────────────────────────────────────
  const whenText = useMemo(() => {
    if (!ride) return "—";
    const ts = ride.dateTime || ride.date;
    if (!ts) return "—";
    try {
      return format(ts.toDate(), "EEEE d MMMM yyyy 'alle' HH:mm", { locale: it });
    } catch {
      return "—";
    }
  }, [ride]);

  const bikesText = useMemo(() => {
    if (!ride?.bikes || ride.bikes.length === 0) return "—";
    return ride.bikes.join(", ");
  }, [ride]);

  const guideSummary = useMemo(
    () =>
      deriveGuideSummary({
        guidaName: ride?.guidaName,
        guidaNames: ride?.guidaNames ?? undefined,
      }),
    [ride?.guidaName, ride?.guidaNames]
  );
  const guideFullText = guideSummary.all.length > 0 ? guideSummary.all.join("; ") : "—";

  const manualParticipantsList = useMemo<Participant[]>(() => {
    if (!ride?.manualParticipants || ride.manualParticipants.length === 0) return [];
    return ride.manualParticipants.map((mp, idx) => ({
      id: mp.id ?? `manual_${idx}`,
      uid: null,
      name: mp.name,
      note: mp.note ?? null,
      createdAt: mp.createdAt ?? null,
      manual: true,
      manualRaw: (mp.raw ?? mp) as ManualParticipant,
      addedBy: mp.addedBy ?? null,
      services: (mp.services as RideServiceResponseMap) ?? null,
    }));
  }, [ride?.manualParticipants]);

  const combinedParticipants = useMemo(() => {
    const merged = [...participants, ...manualParticipantsList];
    return merged.sort((a, b) => {
      const aTs = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : 0;
      const bTs = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : 0;
      if (aTs === bTs) return a.name.localeCompare(b.name);
      return aTs - bTs;
    });
  }, [participants, manualParticipantsList]);

  const serviceQuestions = useMemo<RideServiceKey[]>(
    () => SERVICE_KEYS.filter((key) => ride?.extraServices?.[key]?.enabled),
    [ride?.extraServices]
  );
  const serviceSummary = useMemo(() => {
    const result: Record<RideServiceKey, { yes: number; no: number }> = {
      lunch: { yes: 0, no: 0 },
      dinner: { yes: 0, no: 0 },
      overnight: { yes: 0, no: 0 },
    };

    if (!ride?.extraServices) return result;

    combinedParticipants.forEach((participant) => {
      SERVICE_KEYS.forEach((key) => {
        if (!ride.extraServices?.[key]?.enabled) return;
        const answer = participant.services?.[key];
        if (answer === "yes") result[key].yes += 1;
        else if (answer === "no") result[key].no += 1;
      });
    });

    return result;
  }, [combinedParticipants, ride?.extraServices]);

  const getServiceLabel = useCallback(
    (key: RideServiceKey) => ride?.extraServices?.[key]?.label?.trim() || SERVICE_LABELS[key],
    [ride?.extraServices]
  );

  const isServiceSelectionComplete = useMemo(
    () => serviceQuestions.every((key) => {
      const answer = joinServices[key];
      return answer === "yes" || answer === "no";
    }),
    [serviceQuestions, joinServices]
  );

  const isManualServiceSelectionComplete = useMemo(
    () => serviceQuestions.every((key) => {
      const answer = manualServices[key];
      return answer === "yes" || answer === "no";
    }),
    [serviceQuestions, manualServices]
  );

  const maxText =
    ride?.maxParticipants == null ? "Nessun limite" : String(ride.maxParticipants);

  const myParticipant = useMemo(
    () => combinedParticipants.find((p) => p.uid === currentUid) || null,
    [combinedParticipants, currentUid]
  );


  const formatCognomeNome = useCallback(
    (uid?: string | null, fallback?: string) => {
      if (!uid) {
        return fallback?.trim() || "Ospite";
      }
      const p = publicIndex[uid];
      if (p) {
        const ln = (p.lastName || "").trim();
        const fn = (p.firstName || "").trim();
        const dn = (p.displayName || "").trim();

        // 1) Se abbiamo cognome/nome pubblici → usa sempre "Cognome, Nome"
        if (ln || fn) return `${ln}${ln && fn ? ", " : ""}${fn}`;

        // 2) In assenza, rispetta SEMPRE il fallback passato (participant.name)
        if (fallback && fallback.trim()) return fallback.trim();

        // 3) Prova a ricavare da displayName (mai preferire nickname)
        if (dn) {
          const parts = dn.split(/\s+/);
          if (parts.length >= 2) {
            const last = parts.pop() as string;
            const first = parts.join(" ");
            return `${last}, ${first}`;
          }
          return dn;
        }
      }
      // 4) Fallback finale
      return fallback?.trim() || "Utente";
    },
    [publicIndex]
  );

  // ─────────────────────────────────────────
  // Ruolo admin
  // ─────────────────────────────────────────
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setIsAdmin(false);
      return;
    }
    const userRef = doc(db, "users", uid);
    const unsub = onSnapshot(
      userRef,
      (snap) => {
        const role = snap.exists() ? (snap.data() as any)?.role : null;
        setIsAdmin(role === "admin" || role === "owner");
      },
      () => setIsAdmin(false)
    );
    return () => unsub();
  }, [rideId]);

  // ─────────────────────────────────────────
  // Apri mappa
  // ─────────────────────────────────────────
  const openMap = useCallback(async () => {
    const raw = ride?.link?.trim();
    if (!raw) return;
    const isUrl = /^https?:\/\//i.test(raw) || /^geo:/i.test(raw);
    const url = isUrl
      ? raw
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(raw)}`;

    try {
      const can = await Linking.canOpenURL(url);
      if (!can) {
        Alert.alert("Impossibile aprire la mappa", "Il link sembra non valido.");
        return;
      }
      Linking.openURL(url);
    } catch {
      Alert.alert("Errore", "Non sono riuscito ad aprire la mappa.");
    }
  }, [ride?.link]);

  // ─────────────────────────────────────────
  // Admin actions
  // ─────────────────────────────────────────
  const editRide = useCallback(() => {
    navigation.navigate("CreateRide", { rideId });
  }, [navigation, rideId]);

  const cancelRide = useCallback(async () => {
    if (!rideId) return;
    try {
      await updateDoc(doc(db, "rides", rideId), { status: "cancelled" });
      Alert.alert("Ok", "Uscita annullata.");
    } catch (e: any) {
      Alert.alert("Errore", e?.message ?? "Impossibile annullare l'uscita.");
    }
  }, [rideId]);

  const reopenRide = useCallback(async () => {
    if (!rideId) return;
    try {
      await updateDoc(doc(db, "rides", rideId), { status: "active" });
      Alert.alert("Ok", "Uscita riaperta.");
    } catch (e: any) {
      Alert.alert("Errore", e?.message ?? "Impossibile riaprire l'uscita.");
    }
  }, [rideId]);

  const archiveNow = useCallback(async () => {
    if (!rideId) return;
    try {
      const snap = await getDoc(doc(db, "rides", rideId));
      const d = snap.data() as any;
      const date = d?.dateTime?.toDate ? d.dateTime.toDate() : new Date();
      const y = date.getFullYear();
      const m = date.getMonth() + 1;
      await updateDoc(doc(db, "rides", rideId), {
        archived: true,
        archiveYear: y,
        archiveMonth: m,
      });
      Alert.alert("Ok", "Uscita archiviata.");
    } catch (e: any) {
      Alert.alert("Errore", e?.message ?? "Impossibile archiviare l'uscita.");
    }
  }, [rideId]);

  const unarchive = useCallback(async () => {
    if (!rideId) return;
    try {
      await updateDoc(doc(db, "rides", rideId), { archived: false });
      Alert.alert("Ok", "Uscita ripristinata dall'archivio.");
    } catch (e: any) {
      Alert.alert("Errore", e?.message ?? "Impossibile ripristinare l'uscita.");
    }
  }, [rideId]);

  const deleteRideForever = useCallback(async () => {
    if (!rideId) return;
    Alert.alert("Conferma", "Cancellare definitivamente l'uscita?", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Sì, elimina",
        style: "destructive",
        onPress: async () => {
          try {
            // 👉 segna che la cancellazione è intenzionale
            isDeletingRef.current = true;
            await deleteDoc(doc(db, "rides", rideId));
            // niente navigate: ci pensa il listener a tornare indietro
          } catch (e: any) {
            isDeletingRef.current = false;
            Alert.alert("Errore", e?.message ?? "Impossibile eliminare l'uscita.");
          }
        },
      },
    ]);
  }, [rideId]);

  // ─────────────────────────────────────────
  // Derivazioni Stato (Moved up for scope access)
  // ─────────────────────────────────────────
  const isCancelled = ride?.status === "cancelled";
  const isArchived = !!ride?.archived;
  const isBookable = !isCancelled && !isArchived;

  // ─────────────────────────────────────────
  // Admin Menu Handler
  // ─────────────────────────────────────────
  const showAdminMenu = useCallback(() => {
    if (!ride) return;

    // Opzioni base
    // const options = ["Annulla"]; // unused
    // const destructiveButtonIndex = isArchived || isCancelled ? -1 : 2; // unused
    // Let's build explicit lists based on state

    // ACTION SHEET OPTIONS
    // 0: Cancel (Dismiss)

    if (Platform.OS === 'ios') {
      const iosOptions = ["Chiudi"];
      const iosActions: (() => void)[] = [() => { }];

      if (isArchived) {
        // Ripristina, Elimina
        iosOptions.push("Ripristina da Archivio", "Elimina Definitivamente");
        iosActions.push(unarchive, deleteRideForever);
      } else if (isCancelled) {
        // Riapri, Archivia, Elimina
        iosOptions.push("Riapri Uscita", "Archivia", "Elimina Definitivamente");
        iosActions.push(reopenRide, archiveNow, deleteRideForever);
      } else {
        // Modifica, Annulla, Archivia, Elimina (Requested)
        iosOptions.push("Modifica Dettagli", "Annulla Uscita", "Archivia Uscita", "Elimina Definitivamente");
        iosActions.push(editRide, cancelRide, archiveNow, deleteRideForever);
      }

      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: iosOptions,
          cancelButtonIndex: 0,
          destructiveButtonIndex: iosOptions.indexOf("Elimina Definitivamente") > -1 ? iosOptions.indexOf("Elimina Definitivamente") : iosOptions.indexOf("Annulla Uscita"),
          title: "Gestione Uscita",
        },
        (buttonIndex) => {
          if (buttonIndex > 0) {
            iosActions[buttonIndex]();
          }
        }
      );
    } else {
      // Android: Simple Alert with buttons doesn't support many options well.
      // Using Alert with 3 buttons max or multiple alerts is bad.
      // Better to keep a simple "Edit" button visible maybe, or just use a basic Alert menu.
      // For now, let's use a chain of alerts or a simple 3-btn Alert for key actions.
      // "Modifica" is key. "Altro" -> menu.

      // FALLBACK: Simplified Android Menu via Alert is clunky. 
      // User asked for "Menu ...". 
      // Let's render a simple native Alert with options if possible, but React Native Alert only supports 3 buttons.
      // We will show the most relevant actions.

      const buttons: any[] = [{ text: "Chiudi", style: "cancel" }];

      if (isArchived) {
        buttons.push({ text: "Ripristina", onPress: unarchive });
        buttons.push({ text: "Elimina", onPress: deleteRideForever, style: "destructive" });
      } else if (isCancelled) {
        buttons.push({ text: "Riapri", onPress: reopenRide });
        buttons.push({ text: "Elimina", onPress: deleteRideForever, style: "destructive" });
        // Archivia missing in 3-btn limit?
      } else {
        buttons.push({ text: "Modifica", onPress: editRide });
        buttons.push({
          text: "Gestisci...", onPress: () => {
            Alert.alert("Altre Azioni", "Scegli azione", [
              { text: "Annulla Uscita", onPress: cancelRide, style: "destructive" },
              { text: "Archivia", onPress: archiveNow },
              { text: "Elimina", onPress: deleteRideForever, style: "destructive" },
              { text: "Chiudi", style: "cancel" }
            ]);
          }
        });
      }

      Alert.alert("Gestione Uscita", undefined, buttons);
    }
  }, [ride, isArchived, isCancelled, editRide, cancelRide, archiveNow, unarchive, deleteRideForever, reopenRide]);

  // ─────────────────────────────────────────
  // Prenotazione
  // ─────────────────────────────────────────
  const openNoteModal = useCallback(() => {
    setNoteText(myParticipant?.note ?? "");
    const next = emptySelection();
    serviceQuestions.forEach((key) => {
      const prevChoice = myParticipant?.services?.[key];
      next[key] = prevChoice === "yes" || prevChoice === "no" ? prevChoice : null;
    });
    setJoinServices(next);
    setNoteModalVisible(true);
  }, [myParticipant, serviceQuestions]);

  const closeNoteModal = useCallback(() => {
    if (joinSaving) return;
    setNoteModalVisible(false);
    setJoinServices(emptySelection());
  }, [joinSaving]);

  const openManualModal = useCallback(() => {
    if (!isAdmin) return;
    if (ride?.archived) {
      Alert.alert("Non disponibile", "Uscita archiviata: sola visualizzazione.");
      return;
    }
    setManualName("");
    setManualNote("");
    setManualServices(emptySelection());
    setManualModalVisible(true);
  }, [isAdmin, ride?.archived]);

  const closeManualModal = useCallback(() => {
    if (manualSaving) return;
    setManualModalVisible(false);
    setManualName("");
    setManualNote("");
    setManualServices(emptySelection());
  }, [manualSaving]);

  const adjustParticipantsCount = useCallback(
    async (delta: number) => {
      if (!rideId || delta === 0) return;
      // Count is server-managed via Cloud Functions (participantsCountSelf/Total).
      return;
    },
    [rideId]
  );

  // TODO: handler di join/nota lungo; valutare estrazione in helper dedicato per leggibilità/test.
  const confirmJoin = useCallback(async () => {
    if (joinSaving) return;
    const u = auth.currentUser;
    if (!u) {
      Alert.alert("Attendi", "Autenticazione in corso…");
      return;
    }
    if (!rideId) return;

    if (ride?.archived) {
      Alert.alert("Non prenotabile", "Uscita archiviata: sola visualizzazione.");
      return;
    }
    if (ride?.status === "cancelled") {
      Alert.alert("Non prenotabile", "Uscita annullata dall'amministratore.");
      return;
    }
    if (
      typeof ride?.maxParticipants === "number" &&
      combinedParticipants.length >= (ride?.maxParticipants ?? 0)
    ) {
      Alert.alert("Posti esauriti", "Non è più possibile iscriversi a questa uscita.");
      return;
    }

    const missingService = serviceQuestions.find((key) => {
      if (!ride?.extraServices?.[key]?.enabled) return false;
      const answer = joinServices[key];
      return answer !== "yes" && answer !== "no";
    });

    if (missingService) {
      Alert.alert("Attenzione", `Indica se aderirai a ${getServiceLabel(missingService)}.`);
      return;
    }

    const servicesPayload: RideServiceResponseMap = {};
    serviceQuestions.forEach((key) => {
      const answer = joinServices[key];
      if (answer === "yes" || answer === "no") {
        servicesPayload[key] = answer;
      }
    });

    try {
      setJoinSaving(true);

      // 🔎 prendi il nome pubblico da users_public/{uid} (fallback displayName)
      let publicMini = publicIndex[u.uid];
      if (!publicMini) {
        publicMini = await fetchPublicMini(u.uid);
        setPublicIndex((prev) => ({ ...prev, [u.uid]: publicMini! }));
      }
      const publicName = buildPublicName(publicMini).trim();
      const safeName = publicName.slice(0, 80);

      const participantRef = doc(db, "rides", rideId, "participants", u.uid);
      const prev = await getDoc(participantRef);

      // ✍️ Scrivi SEMPRE il documento completo (compatibile con le regole di update)
      const participantData: Record<string, any> = {
        uid: u.uid,
        name: safeName,
        note: noteText.trim() || null,
        createdAt: prev.exists() ? prev.data()?.createdAt ?? serverTimestamp() : serverTimestamp(),
      };

      if (serviceQuestions.length > 0) {
        participantData.services = Object.keys(servicesPayload).length > 0 ? servicesPayload : null;
      }

      await setDoc(participantRef, participantData);

      if (!prev.exists()) {
        await adjustParticipantsCount(1);
      }

      setNoteModalVisible(false);
      setNoteText("");
      setJoinServices(emptySelection());
    } catch (e: any) {
      console.error("join error:", e);
      Alert.alert("Errore", e?.message ?? "Impossibile prenotarsi.");
    } finally {
      setJoinSaving(false);
    }
  }, [
    rideId,
    noteText,
    joinSaving,
    ride,
    combinedParticipants.length,
    publicIndex,
    fetchPublicMini,
    buildPublicName,
    adjustParticipantsCount,
    joinServices,
    serviceQuestions,
    getServiceLabel,
  ]);

  useEffect(() => {
    setShowFullDescription(false);
  }, [rideId]);

  // TODO: gestione aggiunta manuale partecipanti corposa; valutare estrazione in helper/hook specifico.
  const confirmManualAdd = useCallback(async () => {
    if (!isAdmin || manualSaving) return;
    if (ride?.archived) {
      Alert.alert("Non disponibile", "Uscita archiviata: sola visualizzazione.");
      return;
    }
    const label = manualName.trim().replace(/\s+/g, " ");
    if (!label) {
      Alert.alert("Attenzione", "Inserisci un nome valido.");
      return;
    }
    if (!rideId) return;

    const missingService = serviceQuestions.find((key) => {
      if (!ride?.extraServices?.[key]?.enabled) return false;
      const answer = manualServices[key];
      return answer !== "yes" && answer !== "no";
    });

    if (missingService) {
      Alert.alert("Attenzione", `Indica se il partecipante aderisce a ${getServiceLabel(missingService)}.`);
      return;
    }

    const servicesPayload: RideServiceResponseMap = {};
    serviceQuestions.forEach((key) => {
      const answer = manualServices[key];
      if (answer === "yes" || answer === "no") {
        servicesPayload[key] = answer;
      }
    });

    try {
      setManualSaving(true);
      const entryId = `manual_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      const entry = {
        id: entryId,
        name: label.slice(0, 80),
        note: manualNote.trim() ? manualNote.trim() : null,
        manual: true,
        addedBy: currentUid || null,
        createdAt: Timestamp.now(),
        services: serviceQuestions.length > 0 && Object.keys(servicesPayload).length > 0 ? servicesPayload : null,
      } as ManualParticipant;

      await updateDoc(doc(db, "rides", rideId), {
        manualParticipants: arrayUnion(entry),
      });
      await adjustParticipantsCount(1);
      setManualModalVisible(false);
      setManualName("");
      setManualNote("");
      setManualServices(emptySelection());
    } catch (e: any) {
      console.error("manual add error:", e);
      Alert.alert("Errore", e?.message ?? "Impossibile aggiungere il partecipante.");
    } finally {
      setManualSaving(false);
    }
  }, [
    isAdmin,
    manualSaving,
    manualName,
    manualNote,
    rideId,
    currentUid,
    adjustParticipantsCount,
    ride?.archived,
    serviceQuestions,
    manualServices,
    getServiceLabel,
  ]);

  const leave = useCallback(async () => {
    const u = auth.currentUser;
    if (!u || !rideId) return;

    if (ride?.archived) {
      Alert.alert("Non disponibile", "Uscita archiviata: non puoi modificare la prenotazione.");
      return;
    }

    Alert.alert("Conferma", "Vuoi cancellare la prenotazione?", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Sì, cancella",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "rides", rideId, "participants", u.uid));
            await adjustParticipantsCount(-1);
          } catch (e: any) {
            console.error("leave error:", e);
            Alert.alert("Errore", e?.message ?? "Impossibile cancellare la prenotazione.");
          }
        },
      },
    ]);
  }, [rideId, adjustParticipantsCount, ride?.archived]);



  const statusBadge = isArchived
    ? (
      <View style={[styles.chipBase, { backgroundColor: "#E5E7EB" }]}>
        <Text style={[styles.chipText, { color: "#374151" }]}>📦 Archiviata</Text>
      </View>
    )
    : isCancelled
      ? (
        <View style={[styles.chipBase, { backgroundColor: "#FEE2E2" }]}>
          <Text style={[styles.chipText, { color: "#991B1B" }]}>✖ Annullata</Text>
        </View>
      )
      : (
        <View style={[styles.chipBase, { backgroundColor: "#111" }]}>
          <Text style={[styles.chipText, { color: "#fff" }]}>✓ Attiva</Text>
        </View>
      );

  const participantsLabel = ride?.maxParticipants != null
    ? `${combinedParticipants.length}/${ride.maxParticipants}`
    : `${combinedParticipants.length}`;

  const handleAdminRemove = useCallback(
    (participant: Participant) => {
      if (!isAdmin || !rideId) return;
      if (ride?.archived) {
        Alert.alert("Non disponibile", "Uscita archiviata: sola visualizzazione.");
        return;
      }
      if (isCancelled) {
        Alert.alert("Non disponibile", "Uscita annullata: non puoi modificare la lista partecipanti.");
        return;
      }
      const label = formatCognomeNome(participant.uid ?? "", participant.name);

      Alert.alert(
        "Rimuovere partecipante?",
        label,
        [
          { text: "Annulla", style: "cancel" },
          {
            text: "Rimuovi",
            style: "destructive",
            onPress: async () => {
              try {
                if (participant.manual) {
                  if (!participant.manualRaw) return;
                  await updateDoc(doc(db, "rides", rideId), {
                    manualParticipants: arrayRemove(participant.manualRaw),
                  });
                  await adjustParticipantsCount(-1);
                } else {
                  await deleteDoc(doc(db, "rides", rideId, "participants", participant.id));
                  await adjustParticipantsCount(-1);
                }
              } catch (e: any) {
                console.error("admin remove participant", e);
                Alert.alert("Errore", e?.message ?? "Impossibile rimuovere il partecipante.");
              }
            },
          },
        ]
      );
    },
    [isAdmin, rideId, formatCognomeNome, adjustParticipantsCount, ride?.archived, isCancelled]
  );

  const canSubmitManual = manualName.trim().length > 0 && isManualServiceSelectionComplete;

  // ─────────────────────────────────────────
  // Rendering
  // ─────────────────────────────────────────
  if (loadingRide) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Carico dettagli uscita…</Text>
      </View>
    );
  }

  if (!ride) {
    return (
      <View style={styles.center}>
        <Text>Uscita non trovata.</Text>
      </View>
    );
  }



  return (
    <>
      <Screen
        // Title/Subtitle props ignored by useNativeHeader={true}, handled manually below
        title={undefined}
        subtitle={undefined}
        scroll={true}
        useNativeHeader={true}
        backgroundColor="#FDFCF8"
      >

        {/* STITCH HEADER + CHIPS + ACTIONS */}
        {/* STITCH HEADER BLOCK (Top Bar) */}
        <View style={styles.headerBlock}>
          <View style={styles.headerRow}>
            {/* Back Btn - Icon Only (Consistent with UsciteList) */}
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{ marginRight: 8, padding: 4 }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="arrow-back" size={24} color="#1E293B" />
            </TouchableOpacity>

            <View style={{ flex: 1 }} />

            {/* Admin Actions */}
            {isAdmin && (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                {/* Show Edit Pencil only if active */}
                {!isArchived && !isCancelled && (
                  <TouchableOpacity
                    onPress={editRide}
                    style={{ padding: 4 }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="pencil-sharp" size={22} color="#1E293B" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={showAdminMenu}
                  style={{ padding: 4 }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="ellipsis-horizontal-circle" size={30} color="#1E293B" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* STITCH HEADER INFO SECTION (Below Top Bar) */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 }}>
          <Text style={styles.headerTitle}>{ride.title || "Uscita"}</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 12 }}>
            <Ionicons name="calendar-outline" size={18} color="#64748B" style={{ marginRight: 6 }} />
            <Text style={styles.headerSubtitle}>{whenText}</Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            {statusBadge}
            <View style={[styles.chipBase, { backgroundColor: "#0F172A" }]}>
              <Text style={[styles.chipText, { color: "#FFF" }]}>👥 {participantsLabel}</Text>
            </View>
          </View>
        </View>

        {/* Removed Legacy Toolbar Block */}




        {/* CARD HIGHLIGHT "LA TUA PRENOTAZIONE" */}
        <View style={[styles.card, styles.highlightCard, { marginHorizontal: 16, marginTop: 8 }]}>
          {/* Header della card prenotazione */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <View style={[styles.checkCircle, myParticipant ? { backgroundColor: ACTION_GREEN } : { backgroundColor: "#cbd5e1" }]}>
              <Ionicons name="checkmark" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.highlightTitle}>
                {myParticipant ? "La tua prenotazione" : "Non sei prenotato"}
              </Text>
              {myParticipant && (
                <Text style={{ color: "#1e293b", marginTop: 2 }}>
                  Sei prenotato come: <Text style={{ fontWeight: '700' }}>{formatCognomeNome(myParticipant.uid, myParticipant.name)}</Text>
                </Text>
              )}
              <Text style={{ color: "#475569", marginTop: 2, fontStyle: myParticipant?.note ? 'normal' : 'italic' }}>
                Nota: {myParticipant?.note || "Nessuna nota"}
              </Text>

              {/* Riepilogo Servizi (Sub-box) */}
              {myParticipant && serviceQuestions.length > 0 && (
                <View style={styles.myServicesBox}>
                  {serviceQuestions.map((key) => {
                    const answer = myParticipant.services?.[key];
                    return (
                      <Text key={key} style={styles.myServicesText}>
                        • {SERVICE_LABELS[key]}: {answer === "yes" ? "Sì" : answer === "no" ? "No" : "—"}
                      </Text>
                    );
                  })}
                </View>
              )}
            </View>
          </View>

          {/* Warnings: Archived/Cancelled/Full */}
          {isArchived && <Text style={{ color: "#6b7280", marginBottom: 8 }}>Uscita archiviata: sola visualizzazione.</Text>}
          {isCancelled && <Text style={{ color: "#DC2626", fontWeight: "600", marginBottom: 8 }}>Uscita annullata.</Text>}
          {!isBookable && !isArchived && !isCancelled && typeof ride.maxParticipants === "number" && (
            <Text style={{ color: "#DC2626", marginBottom: 8 }}>Posti esauriti.</Text>
          )}

          {/* Actions */}
          <View style={{ gap: 8 }}>
            {myParticipant ? (
              <>
                <PrimaryButton
                  label="Modifica nota"
                  onPress={openNoteModal}
                  disabled={!isBookable}
                />
                <TouchableOpacity
                  onPress={leave}
                  disabled={isArchived || isCancelled}
                  style={{
                    backgroundColor: "#F1F5F9",
                    borderRadius: 12,
                    paddingVertical: 12,
                    alignItems: 'center',
                    marginTop: 4
                  }}
                >
                  <Text style={{ color: "#475569", fontWeight: '700' }}>Non Partecipo</Text>
                </TouchableOpacity>
              </>
            ) : (
              <PrimaryButton
                label="Partecipa all'uscita"
                onPress={openNoteModal}
                disabled={!isBookable}
                style={{ backgroundColor: ACTION_GREEN }} // Green join button
              />
            )}
          </View>
        </View>

        {/* CARD DETTAGLI (Stitch Uniformed Layout) */}
        <View style={[styles.card, { marginHorizontal: 16 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 8 }}>
            <Ionicons name="information-circle" size={24} color={ACTION_GREEN} />
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Dettagli Uscita</Text>
          </View>

          {/* Ritrovo */}
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="location-outline" size={14} color="#94a3b8" />
                <Text style={styles.gridLabel}>RITROVO</Text>
              </View>
              {ride.link && (
                <TouchableOpacity onPress={openMap} style={{ flexDirection: 'row', alignItems: 'center' }} hitSlop={10}>
                  <Text style={{ color: ACTION_GREEN, fontWeight: '600', fontSize: 13, marginRight: 4, textDecorationLine: 'underline' }}>Apri mappa</Text>
                  <Ionicons name="open-outline" size={14} color={ACTION_GREEN} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.gridValue}>{ride.meetingPoint || "—"}</Text>
          </View>

          <View style={styles.divider} />

          {/* Row: Guida | Bici */}
          <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Ionicons name="person-outline" size={14} color="#94a3b8" />
                <Text style={styles.gridLabel}>GUIDA</Text>
              </View>
              <Text style={styles.gridValue}>{guideFullText}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Ionicons name="bicycle-outline" size={14} color="#94a3b8" />
                <Text style={styles.gridLabel}>BICI</Text>
              </View>
              <Text style={styles.gridValue}>{bikesText}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Row: Difficoltà | Max */}
          <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Ionicons name="bar-chart-outline" size={14} color="#94a3b8" />
                <Text style={styles.gridLabel}>DIFFICOLTÀ</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: getDifficultyMeta(ride.difficulty).color,
                }} />
                <Text style={styles.gridValue}>{getDifficultyMeta(ride.difficulty).label}</Text>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Ionicons name="people-outline" size={14} color="#94a3b8" />
                <Text style={styles.gridLabel}>MAX PART.</Text>
              </View>
              <Text style={styles.gridValue}>{maxText}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Row: Quando */}
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Ionicons name="calendar-clear-outline" size={14} color="#94a3b8" />
              <Text style={styles.gridLabel}>QUANDO</Text>
            </View>
            <Text style={styles.gridValue}>{whenText}</Text>
          </View>
        </View>

        {/* CARD DESCRIZIONE (Separata) */}
        <View style={[styles.card, { marginHorizontal: 16, padding: 16 }]}>
          <Text style={styles.sectionTitle}>Descrizione</Text>
          <Row
            label=""
            value={ride.description?.trim() ? ride.description : "—"}
            multiline
            renderValue={() => {
              const descriptionText = ride.description?.trim();
              if (!descriptionText) return <Text style={{ color: "#666" }}>—</Text>;

              const approxLines = descriptionText.split(/\r?\n/).length;
              /* Removed Toggle Logic per request "Nessuna troncatura" */

              return (
                <View>
                  {Platform.OS === "ios" ? (
                    <TextInput
                      value={descriptionText}
                      editable={false}
                      multiline
                      scrollEnabled={false}
                      contextMenuHidden={false}
                      dataDetectorTypes={["link"]}
                      style={{ color: "#222", padding: 0, fontSize: 15, lineHeight: 24 }}
                    />
                  ) : (
                    <Text
                      style={{ color: "#222", fontSize: 15, lineHeight: 24 }}
                      selectable
                    >
                      {renderLinkedText(descriptionText)}
                    </Text>
                  )}

                </View>
              );
            }}
          />
        </View>

        {/* Elenco partecipanti */}
        {/* TODO: blocco elenco partecipanti (lista + azioni admin) candidabile a sottocomponente riusabile. */}
        {serviceQuestions.length > 0 && (
          <View style={[styles.card, { marginHorizontal: 16, marginBottom: 16, padding: 16 }]}>
            <Text style={styles.sectionTitle}>Servizi extra</Text>
            <View style={{ gap: 10, marginTop: 8 }}>
              {serviceQuestions.map((key) => (
                <View
                  key={key}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ color: "#111827", fontWeight: "600" }}>
                    {getServiceLabel(key)}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: ACTION_GREEN,
                        }}
                      />
                      <Text style={{ color: "#111827", fontWeight: "600" }}>
                        {serviceSummary[key].yes} Sì
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: "#94A3B8",
                        }}
                      />
                      <Text style={{ color: "#64748B", fontWeight: "600" }}>
                        {serviceSummary[key].no} No
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* CARD PARTECIPANTI (Stitch Preview + Expanded) */}
        <View style={[styles.card, { marginHorizontal: 16, marginBottom: 32 }]}>
          <View style={{ marginBottom: 16 }}>
            {/* ROW 1: Title + Toggle */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
                Partecipanti ({combinedParticipants.length})
              </Text>

              {/* Show All Toggle */}
              {combinedParticipants.length > 5 && (
                <TouchableOpacity onPress={() => setShowAllParticipants(!showAllParticipants)} hitSlop={10}>
                  <Text style={{ color: ACTION_GREEN, fontWeight: '700', fontSize: 13 }}>
                    {showAllParticipants ? "Nascondi" : "Mostra tutti"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* ROW 2: Admin Add CTA (Below title) */}
            {isAdmin && (
              <TouchableOpacity
                onPress={openManualModal}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 8,
                  alignSelf: 'flex-start'
                }}
                hitSlop={10}
              >
                <View style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: ACTION_GREEN,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Ionicons name="add" size={16} color="#ffffff" />
                </View>
                <Text style={{ color: ACTION_GREEN, fontWeight: '600', fontSize: 14 }}>
                  Aggiungi
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {loadingParts ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator color={UI.colors.primary} />
              <Text style={styles.participantPlaceholder}>Carico partecipanti…</Text>
            </View>
          ) : combinedParticipants.length === 0 ? (
            <Text style={styles.participantPlaceholder}>Ancora nessun partecipante.</Text>
          ) : (
            <>
              <FlatList
                data={showAllParticipants ? combinedParticipants : combinedParticipants.slice(0, 5)}
                keyExtractor={(item) => item.id}
                ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                renderItem={({ item, index }) => (
                  <View style={styles.participantRow}>
                    {/* Avatar Placeholder */}
                    <View style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: '#f8fafc',
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 2
                    }}>
                      <Ionicons name="person" size={16} color="#64748b" />
                    </View>

                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.participantName}>
                        {formatCognomeNome(item.uid, item.name)}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                        {item.manual && (
                          <Text style={styles.participantManualTag}>MANUALE</Text>
                        )}
                        {/* Guide Badge (se combacia con guidaName) */}
                        {(ride?.guidaName && item.name.includes(ride.guidaName)) || (ride?.guidaNames?.some(g => item.name.includes(g))) ? (
                          <View style={{ backgroundColor: '#dcfce7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ fontSize: 10, color: ACTION_GREEN, fontWeight: '700' }}>GUIDA</Text>
                          </View>
                        ) : null}

                        {item.note && (
                          <Text style={styles.participantNote}>
                            {item.note}
                          </Text>
                        )}
                      </View>


                      {serviceQuestions.length > 0 && (
                        (() => {
                          const answered = serviceQuestions.filter((key) => {
                            const answer = item.services?.[key];
                            return answer === "yes" || answer === "no";
                          });
                          if (answered.length === 0) return null;
                          return (
                            <View style={styles.serviceChipRow}>
                              {answered.map((key) => {
                                const answer = item.services?.[key];
                                if (answer !== "yes" && answer !== "no") return null;
                                return (
                                  <View
                                    key={key}
                                    style={[
                                      styles.serviceChip,
                                      answer === "yes" ? styles.serviceChipYes : styles.serviceChipNo,
                                    ]}
                                  >
                                    <Text style={styles.serviceChipText}>
                                      {SERVICE_LABELS[key]}: {answer === "yes" ? "Sì" : "No"}
                                    </Text>
                                  </View>
                                );
                              })}
                            </View>
                          );
                        })()
                      )}
                    </View>

                    {/* Trash Action */}
                    {isAdmin && !isArchived && (
                      <TouchableOpacity
                        onPress={() => handleAdminRemove(item)}
                        style={styles.participantAdminBtn}
                        accessibilityLabel="Rimuovi partecipante"
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="trash" size={16} color={UI.colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                scrollEnabled={false}
              />

              {/* Footer in collapsed state */}
              {!showAllParticipants && combinedParticipants.length > 5 && (
                <TouchableOpacity
                  onPress={() => setShowAllParticipants(true)}
                  style={{ marginTop: 12, paddingVertical: 8, alignItems: 'center' }}
                  hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
                >
                  <Text style={{ color: '#22c55e', fontWeight: '700', fontSize: 13 }}>
                    + altri {combinedParticipants.length - 5} partecipanti
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        <View style={{ height: 24 }} />
      </Screen>

      <Modal
        visible={noteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeNoteModal}
      >
        <KeyboardAvoidingView
          enabled={Platform.OS === "ios"}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
          style={styles.modalWrap}
        >
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={[
              styles.modalScrollContent,
              Platform.OS === "android" && styles.modalScrollContentAndroid,
            ]}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View style={[styles.modalCard, { gap: 12 }]}>
              <Text style={styles.modalTitle}>Conferma partecipazione</Text>
              <Text style={{ color: "#475569" }}>
                Puoi aggiungere una nota per l'organizzatore (opzionale).
              </Text>
              {serviceQuestions.length > 0 && (
                <View style={styles.serviceModalBlock}>
                  <Text style={styles.serviceBlockTitle}>Servizi extra</Text>
                  <Text style={styles.serviceHelperText}>Rispondi per ciascun servizio abilitato.</Text>
                  {serviceQuestions.map((key) => {
                    const current = joinServices[key];
                    return (
                      <View key={key} style={styles.serviceQuestionRow}>
                        <Text style={styles.serviceQuestionLabel}>{getServiceLabel(key)}</Text>
                        <View style={styles.serviceQuestionButtons}>
                          {(["yes", "no"] as RideServiceChoice[]).map((choice) => (
                            <TouchableOpacity
                              key={choice}
                              onPress={() =>
                                setJoinServices((prev) => ({ ...prev, [key]: choice }))
                              }
                              style={[
                                styles.serviceOptionBtn,
                                current === choice && styles.serviceOptionBtnActive,
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel={`${getServiceLabel(key)}: ${choice === "yes" ? "Sì" : "No"
                                }`}
                            >
                              <Text
                                style={[
                                  styles.serviceOptionText,
                                  current === choice && styles.serviceOptionTextActive,
                                ]}
                              >
                                {choice === "yes" ? "Sì" : "No"}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    );
                  })}
                  {!isServiceSelectionComplete && (
                    <Text style={styles.serviceHelper}>Rispondi a tutte le domande per proseguire.</Text>
                  )}
                </View>
              )}
              <TextInput
                value={noteText}
                onChangeText={setNoteText}
                style={styles.modalInput}
                placeholder="Nota (opzionale)"
                multiline
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={closeNoteModal}
                  style={styles.modalActionSecondary}
                  disabled={joinSaving}
                >
                  <Text style={styles.modalActionSecondaryText}>Annulla</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={confirmJoin}
                  style={[
                    styles.modalActionPrimary,
                    (joinSaving || !isServiceSelectionComplete) && { opacity: 0.6 },
                  ]}
                  disabled={joinSaving || !isServiceSelectionComplete}
                >
                  <Text style={styles.modalActionPrimaryText}>
                    {joinSaving ? "Salvo…" : "Conferma"}
                  </Text>
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
        onRequestClose={closeManualModal}
      >
        <KeyboardAvoidingView
          enabled={Platform.OS === "ios"}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
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
              <Text style={styles.modalTitle}>Aggiungi partecipante manuale</Text>
              <TextInput
                value={manualName}
                onChangeText={setManualName}
                style={styles.modalField}
                placeholder="Nome e cognome"
                autoCapitalize="words"
              />
              <TextInput
                value={manualNote}
                onChangeText={setManualNote}
                style={styles.modalInput}
                placeholder="Nota (opzionale)"
                multiline
              />
              {serviceQuestions.length > 0 && (
                <View style={styles.serviceModalBlock}>
                  <Text style={styles.serviceBlockTitle}>Servizi extra</Text>
                  <Text style={styles.serviceHelperText}>Segnala le scelte del partecipante.</Text>
                  {serviceQuestions.map((key) => {
                    const current = manualServices[key];
                    return (
                      <View key={key} style={styles.serviceQuestionRow}>
                        <Text style={styles.serviceQuestionLabel}>{getServiceLabel(key)}</Text>
                        <View style={styles.serviceQuestionButtons}>
                          {(["yes", "no"] as RideServiceChoice[]).map((choice) => (
                            <TouchableOpacity
                              key={choice}
                              onPress={() =>
                                setManualServices((prev) => ({ ...prev, [key]: choice }))
                              }
                              style={[
                                styles.serviceOptionBtn,
                                current === choice && styles.serviceOptionBtnActive,
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel={`${getServiceLabel(key)}: ${choice === "yes" ? "Sì" : "No"
                                }`}
                            >
                              <Text
                                style={[
                                  styles.serviceOptionText,
                                  current === choice && styles.serviceOptionTextActive,
                                ]}
                              >
                                {choice === "yes" ? "Sì" : "No"}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    );
                  })}
                  {!isManualServiceSelectionComplete && (
                    <Text style={styles.serviceHelper}>Compila tutte le risposte per procedere.</Text>
                  )}
                </View>
              )}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={closeManualModal}
                  style={styles.modalActionSecondary}
                  disabled={manualSaving}
                >
                  <Text style={styles.modalActionSecondaryText}>Annulla</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={confirmManualAdd}
                  style={[
                    styles.modalActionPrimary,
                    (!canSubmitManual || manualSaving) && { opacity: 0.6 },
                  ]}
                  disabled={!canSubmitManual || manualSaving}
                >
                  <Text style={styles.modalActionPrimaryText}>
                    {manualSaving ? "Salvo…" : "Aggiungi"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// Riga standard della scheda
function Row({
  label,
  value,
  multiline,
  renderValue,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  renderValue?: () => React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontWeight: "700", marginBottom: 4 }}>{label}</Text>
      {renderValue ? (
        renderValue()
      ) : (
        <Text style={{ color: "#222" }}>{multiline ? value : value}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // HEADER CUSTOM
  headerBlock: {
    marginBottom: 0, // removed bottom margin to glue with content if needed, but 16 is fine
    marginTop: Platform.OS === 'ios' ? 24 : 8,
    gap: 16,
    paddingHorizontal: 16, // Added padding since removed from Screen? Screen has padding usually.
    // Screen component has padding: UI.spacing.lg (20/16). 
    // If wrapping View has marginHorizontal, double check.
    // Let's assume Screen wrapper padding exists. 
    // Actually, Screen implementation: padding: UI.spacing.lg.
    // So internal elements don't need marginHorizontal 16 if they want to be aligned.
    // BUT the cards have marginHorizontal 16 in original code.
    // Let's keep consistency.
  },
  chipBase: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  participantChip: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: "#0F172A",
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlightCard: {
    borderColor: ACTION_GREEN,
    backgroundColor: "#f0fdf4", // Light green tint
    borderWidth: 1,
  },
  showAllBtn: {
    paddingVertical: 12,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    marginTop: 8,
  },
  showAllBtnText: {
    color: UI.colors.primary,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: "#f1f5f9",
    marginVertical: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start", // Ensure top alignment
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1E293B",
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#64748B",
    marginTop: 2,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800", flexShrink: 1, paddingRight: 12 },
  card: {
    borderRadius: 24, // Rounder Stitch cards
    padding: 20,
    backgroundColor: "#fff",
    marginTop: 16,
    // Stitch soft shadow
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },

  // NEW STITCH STYLES
  highlightTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
  checkCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  gridLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 0, // removed bottom margin to allow container control
  },
  gridValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1e293b",
    lineHeight: 20,
  },
  participantManualTag: {
    color: UI.colors.accentWarm,
    fontSize: 10,
    fontWeight: "800",
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // END NEW STYLES

  sectionTitle: { fontSize: 18, fontWeight: "800", marginBottom: 16, color: "#0f172a" },
  participantRow: {
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  participantName: {
    fontWeight: "700",
    color: "#334155",
    fontSize: 15,
  },
  participantNote: {
    color: "#64748b",
    fontSize: 13.5,
    fontStyle: "italic",
    lineHeight: 20,
    marginTop: 4,
    width: '100%',
  },
  participantPlaceholder: {
    color: "#94a3b8",
    fontStyle: "italic",
  },
  participantAdminBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(220, 38, 38, 0.1)', // Light danger red
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.2)',
    marginTop: 2,
  },
  serviceSummaryBox: {
    marginTop: 4,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    gap: 4,
  },
  serviceSummaryText: {
    color: "#1f2937",
    fontWeight: "600",
  },
  serviceBlockTitle: {
    fontWeight: "700",
    color: "#0f172a",
  },
  // ... other styles preserved
  serviceModalBlock: {
    gap: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#f8fafc",
  },
  serviceHelperText: {
    fontSize: 12,
    color: "#64748b",
  },
  serviceQuestionRow: {
    gap: 8,
  },
  serviceQuestionLabel: {
    fontWeight: "600",
    color: "#0f172a",
  },
  serviceQuestionButtons: {
    flexDirection: "row",
    gap: 8,
  },
  serviceOptionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cbd5f5",
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  serviceOptionBtnActive: {
    borderColor: UI.colors.primary,
    backgroundColor: UI.colors.primary,
  },
  serviceOptionText: {
    fontWeight: "600",
    color: "#1f2937",
  },
  serviceOptionTextActive: {
    color: "#fff",
  },
  serviceHelper: {
    color: "#b91c1c",
    fontSize: 12,
  },
  myServicesBox: {
    marginTop: 8,
    gap: 4,
  },
  myServicesText: {
    color: "#1f2937",
  },
  serviceChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  serviceChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  serviceChipYes: {
    backgroundColor: "#dcfce7",
  },
  serviceChipNo: {
    backgroundColor: "#fee2e2",
  },
  serviceChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0f172a",
  },
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
  modalScrollContentAndroid: {
    justifyContent: "flex-start",
    paddingBottom: 24,
  },
  modalTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  modalField: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    fontSize: 16,
    color: UI.colors.text,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    minHeight: 80,
    textAlignVertical: "top",
    backgroundColor: "#fff",
  },
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
  mapLinkBtn: {
    backgroundColor: "#0F172A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  mapLinkText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  linkRow: {
    marginBottom: 0,
  },
  linkLabel: { display: 'none' }, // hidden in Stitch
});

const adminStyles = StyleSheet.create({
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
