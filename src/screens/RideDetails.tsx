// src/screens/RideDetails.tsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
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
  increment,
} from "firebase/firestore";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Screen, UI } from "../components/Screen";
import { PrimaryButton } from "../components/Button";
import { Ionicons } from "@expo/vector-icons";
import { StatusBadge } from "./calendar/StatusBadge";

// Tipi parametri di navigazione (adatta se usi un RootStack diverso)
type RootStackParamList = {
  RideDetails: { rideId: string; title?: string };
};

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
  guidaName?: string | null;
  createdBy: string;
  createdAt?: Timestamp | null;

  status?: "active" | "cancelled";
  archived?: boolean;
  archiveYear?: number | null;
  archiveMonth?: number | null;
  manualParticipants?: ManualParticipant[] | null;
};

type ManualParticipant = {
  id: string;
  name: string;
  note?: string | null;
  addedBy?: string | null;
  createdAt?: Timestamp | null;
  manual?: boolean;
  raw?: any;
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

  const [ride, setRide] = useState<Ride | null>(null);
  const [loadingRide, setLoadingRide] = useState(true);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loadingParts, setLoadingParts] = useState(true);

  const [isAdmin, setIsAdmin] = useState(false);

  // indice dei nomi pubblici per uid (da users_public)
  const [publicIndex, setPublicIndex] = useState<Record<string, PublicMini>>({});

  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [joinSaving, setJoinSaving] = useState(false);

  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [manualSaving, setManualSaving] = useState(false);

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
        const d = main.data() as any;
        return {
          firstName: d?.name ?? d?.firstName ?? d?.nome ?? null,
          lastName: d?.surname ?? d?.lastName ?? d?.cognome ?? null,
          displayName: d?.displayName ?? null,
          nickname: d?.nickname ?? null,
        };
      }
    } catch {}

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
    } catch {}

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

        const d = snap.data() as any;
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
            };
          })
          .filter(Boolean) as ManualParticipant[];

        const updatedCount =
          typeof d?.participantsCount === "number"
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
          guidaName: d?.guidaName ?? null,
          createdBy: d?.createdBy,
          createdAt: d?.createdAt ?? null,

          status: (d?.status as Ride["status"]) ?? "active",
          archived: !!d?.archived,
          archiveYear: d?.archiveYear ?? null,
          archiveMonth: d?.archiveMonth ?? null,
          manualParticipants,
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
          const x = d.data() as any;
          rows.push({
            id: d.id,
            uid: x?.uid,
            name: x?.name ?? "",
            note: x?.note ?? null,
            createdAt: x?.createdAt ?? null,
            manual: x?.manual === true,
            addedBy: x?.addedBy ?? null,
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

  const manualParticipantsList = useMemo<Participant[]>(() => {
    if (!ride?.manualParticipants || ride.manualParticipants.length === 0) return [];
    return ride.manualParticipants.map((mp) => ({
      id: mp.id,
      uid: null,
      name: mp.name,
      note: mp.note ?? null,
      createdAt: mp.createdAt ?? null,
      manual: true,
      manualRaw: (mp.raw ?? mp) as ManualParticipant,
      addedBy: mp.addedBy ?? null,
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
  // Prenotazione
  // ─────────────────────────────────────────
  const openNoteModal = useCallback(() => {
    setNoteText(myParticipant?.note ?? "");
    setNoteModalVisible(true);
  }, [myParticipant]);

  const closeNoteModal = useCallback(() => {
    if (joinSaving) return;
    setNoteModalVisible(false);
  }, [joinSaving]);

  const openManualModal = useCallback(() => {
    if (!isAdmin) return;
    if (ride?.archived) {
      Alert.alert("Non disponibile", "Uscita archiviata: sola visualizzazione.");
      return;
    }
    setManualName("");
    setManualNote("");
    setManualModalVisible(true);
  }, [isAdmin, ride?.archived]);

  const closeManualModal = useCallback(() => {
    if (manualSaving) return;
    setManualModalVisible(false);
    setManualName("");
    setManualNote("");
  }, [manualSaving]);

  const adjustParticipantsCount = useCallback(
    async (delta: number) => {
      if (!rideId || delta === 0) return;
      try {
        const rideRef = doc(db, "rides", rideId);
        const snap = await getDoc(rideRef);
        const current = snap.exists() ? (snap.data()?.participantsCount ?? 0) : 0;
        const next = Math.max(current + delta, 0);
        await updateDoc(rideRef, { participantsCount: next });
      } catch (e) {
        console.warn("adjustParticipantsCount", e);
      }
    },
    [rideId]
  );

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
      await setDoc(participantRef, {
        uid: u.uid,
        name: safeName,
        note: noteText.trim() || null,
        createdAt: prev.exists() ? prev.data()?.createdAt ?? serverTimestamp() : serverTimestamp(),
      });

      if (!prev.exists()) {
        await adjustParticipantsCount(1);
      }

      setNoteModalVisible(false);
      setNoteText("");
    } catch (e: any) {
      console.error("join error:", e);
      Alert.alert("Errore", e?.message ?? "Impossibile prenotarsi.");
    } finally {
      setJoinSaving(false);
    }
  }, [rideId, noteText, joinSaving, ride, combinedParticipants.length, publicIndex, fetchPublicMini, buildPublicName, adjustParticipantsCount]);

  useEffect(() => {
    setShowFullDescription(false);
  }, [rideId]);

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
      } as ManualParticipant;

      await updateDoc(doc(db, "rides", rideId), {
        manualParticipants: arrayUnion(entry),
      });
      await adjustParticipantsCount(1);
      setManualModalVisible(false);
      setManualName("");
      setManualNote("");
    } catch (e: any) {
      console.error("manual add error:", e);
      Alert.alert("Errore", e?.message ?? "Impossibile aggiungere il partecipante.");
    } finally {
      setManualSaving(false);
    }
  }, [isAdmin, manualSaving, manualName, manualNote, rideId, currentUid, adjustParticipantsCount, ride?.archived]);

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

  const isCancelled = ride?.status === "cancelled";
  const isArchived = !!ride?.archived;
  const isBookable =
    !!ride &&
    !isCancelled &&
    !isArchived &&
    !(
      typeof ride.maxParticipants === "number" &&
      combinedParticipants.length >= (ride.maxParticipants ?? 0)
    );

  const statusBadge = isArchived
    ? <StatusBadge text="Archiviata" icon="📦" bg="#E5E7EB" fg="#374151" />
    : isCancelled
    ? <StatusBadge text="Annullata" icon="✖" bg="#FEE2E2" fg="#991B1B" />
    : <StatusBadge text="Attiva" icon="✓" bg="#111" fg="#fff" />;

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

  const canSubmitManual = manualName.trim().length > 0;

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
      <Screen title={ride.title || "Uscita"} subtitle={whenText} scroll>
        {/* HEADER + TOOLBAR ADMIN */}
        <View style={{ gap: 8, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          {statusBadge}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: "#0F172A",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>👥 {participantsLabel}</Text>
          </View>
        </View>

        {isAdmin && (
          <View style={adminStyles.toolbar}>
            {isArchived ? (
              <>
                <PrimaryButton label="Ripristina" onPress={unarchive} style={{ backgroundColor: "#374151" }} />
                <PrimaryButton label="Elimina" onPress={deleteRideForever} style={{ backgroundColor: "#7C2D12" }} />
              </>
            ) : isCancelled ? (
              <>
                <PrimaryButton label="Riapri" onPress={reopenRide} style={{ backgroundColor: "#059669" }} />
                <PrimaryButton label="Archivia" onPress={archiveNow} style={{ backgroundColor: "#111827" }} />
                <PrimaryButton label="Elimina" onPress={deleteRideForever} style={{ backgroundColor: "#7C2D12" }} />
              </>
            ) : (
              <>
                <PrimaryButton label="Modifica" onPress={editRide} />
                <PrimaryButton label="Annulla" onPress={cancelRide} style={{ backgroundColor: "#DC2626" }} />
                <PrimaryButton label="Archivia" onPress={archiveNow} style={{ backgroundColor: "#111827" }} />
              </>
            )}
          </View>
        )}
      </View>

        {/* SCHEDA DETTAGLIO */}
        <View style={[styles.card, { marginHorizontal: 16 }]}>
        <Row label="Quando" value={whenText} />
        <Row label="Ritrovo" value={ride.meetingPoint || "—"} />

        {ride.link ? (
          <View style={styles.linkRow}>
            <Text style={styles.linkLabel}>Link</Text>
            <TouchableOpacity
              onPress={openMap}
              style={[styles.mapLinkBtn, { alignSelf: "auto" }]}
              accessibilityRole="button"
              accessibilityLabel="Apri mappa"
            >
              <Text style={styles.mapLinkText} numberOfLines={1}>Apri mappa</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Row label="Guida" value={ride.guidaName || "—"} />
        <Row label="Bici" value={bikesText} />
        <Row label="Difficoltà" value={ride.difficulty || "—"} />
        <Row label="Max partecipanti" value={maxText} />
        <Row
          label="Descrizione"
          value={ride.description?.trim() ? ride.description : "—"}
          multiline
          renderValue={() => {
            const descriptionText = ride.description?.trim();
            if (!descriptionText) return <Text style={{ color: "#666" }}>—</Text>;

            const approxLines = descriptionText.split(/\r?\n/).length;
            const shouldShowToggle =
              descriptionText.length > 400 || approxLines > 5;

            return (
              <View>
                <Text style={{ color: "#222" }} numberOfLines={showFullDescription || !shouldShowToggle ? undefined : 5}>
                  {descriptionText}
                </Text>
                {shouldShowToggle && (
                  <TouchableOpacity
                    onPress={() => setShowFullDescription((prev) => !prev)}
                    accessibilityRole="button"
                    style={{ marginTop: 6 }}
                  >
                    <Text style={{ color: UI.colors.primary, fontWeight: "600" }}>
                      {showFullDescription ? "Mostra meno..." : "Mostra di più..."}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      </View>

        {/* Prenotazione */}
        <View style={[styles.card, { marginHorizontal: 16, gap: 8 }]}>
        <Text style={styles.sectionTitle}>Prenotazione</Text>

        <Text style={{ color: "#1F2937" }}>
          Partecipanti: <Text style={{ fontWeight: "700" }}>{participantsLabel}</Text>
          {ride.maxParticipants == null ? " (nessun limite)" : ""}
        </Text>

        {isArchived && <Text style={{ color: "#6b7280" }}>Uscita archiviata: sola visualizzazione.</Text>}
        {isCancelled && <Text style={{ color: "#DC2626", fontWeight: "600" }}>Uscita annullata: le prenotazioni sono bloccate.</Text>}
        {!isBookable && !isArchived && !isCancelled && typeof ride.maxParticipants === "number" && (
          <Text style={{ color: "#DC2626" }}>Posti esauriti.</Text>
        )}

        {myParticipant ? (
          <>
            <Text style={{ color: "#0a0", fontWeight: "600" }}>
              Sei prenotato come: {formatCognomeNome(myParticipant.uid, myParticipant.name)}
            </Text>
            {myParticipant.note ? (
              <Text style={{ color: "#333" }}>Nota: {myParticipant.note}</Text>
            ) : (
              <Text style={{ color: "#666" }}>Nessuna nota</Text>
            )}

            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <PrimaryButton
                label="Modifica nota"
                onPress={openNoteModal}
                disabled={!isBookable}
              />
              <PrimaryButton
                label="Non Partecipo"
                onPress={leave}
                style={{ backgroundColor: isArchived || isCancelled ? "#94a3b8" : "#b00020" }}
                disabled={isArchived || isCancelled}
              />
            </View>
          </>
        ) : (
          <>
            <Text style={{ color: "#666" }}>Non sei ancora prenotato per questa uscita.</Text>
            <PrimaryButton label="Partecipa" onPress={openNoteModal} disabled={!isBookable} />
          </>
        )}
      </View>

        {/* Elenco partecipanti */}
        <View style={[styles.card, { marginHorizontal: 16 }]}>
        <Text style={styles.sectionTitle}>Elenco partecipanti</Text>
        {isAdmin && (
          <View style={{ marginBottom: 12 }}>
            <PrimaryButton
              label="Aggiungi manualmente"
              onPress={openManualModal}
              disabled={isArchived || isCancelled}
            />
          </View>
        )}
        {loadingParts ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ActivityIndicator />
            <Text>Carico partecipanti…</Text>
          </View>
        ) : combinedParticipants.length === 0 ? (
          <Text style={{ color: "#666" }}>Ancora nessun partecipante.</Text>
        ) : (
          <FlatList
            data={combinedParticipants}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item, index }) => (
              <View style={styles.participantRow}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontWeight: "600" }}>
                    {index + 1}. {formatCognomeNome(item.uid, item.name)}
                  </Text>
                  {item.manual && (
                    <Text style={styles.participantManualTag}>Inserito manualmente</Text>
                  )}
                  {item.note ? <Text style={styles.participantNote}>Nota: {item.note}</Text> : null}
                </View>
                {isAdmin && !isArchived && (
                  <TouchableOpacity
                    onPress={() => handleAdminRemove(item)}
                    style={styles.participantAdminBtn}
                    accessibilityLabel="Rimuovi partecipante"
                  >
                    <Ionicons name="trash-outline" size={18} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            )}
            scrollEnabled={false}
          />
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
        <View style={styles.modalWrap}>
          <View style={[styles.modalCard, { gap: 12 }]}>
            <Text style={styles.modalTitle}>Conferma partecipazione</Text>
            <Text style={{ color: "#475569" }}>
              Puoi aggiungere una nota per l'organizzatore (opzionale).
            </Text>
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
                  (joinSaving) && { opacity: 0.6 },
                ]}
                disabled={joinSaving}
              >
                <Text style={styles.modalActionPrimaryText}>
                  {joinSaving ? "Salvo…" : "Conferma"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={manualModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeManualModal}
      >
        <View style={styles.modalWrap}>
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
        </View>
      </Modal>
    </>
  );
}

// Badge semplice per stati
function Badge({ color, text }: { color: string; text: string }) {
  return (
    <View style={{ backgroundColor: color, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>{text}</Text>
    </View>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800", flexShrink: 1, paddingRight: 12 },
  card: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 14,
    backgroundColor: "#fff",
    marginTop: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  participantRow: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#fafafa",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  participantManualTag: {
    color: UI.colors.accentWarm,
    fontSize: 12,
    fontWeight: "700",
  },
  participantNote: {
    color: "#444",
  },
  participantAdminBtn: {
    backgroundColor: UI.colors.danger,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
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
    backgroundColor: "#111",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  mapLinkText: { color: "#fff", fontWeight: "700" },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  linkLabel: { fontWeight: "700" },
});

const adminStyles = StyleSheet.create({
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
