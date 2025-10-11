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
  getDocs,
} from "firebase/firestore";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Screen } from "../components/Screen";
import { PrimaryButton } from "../components/Button";

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
};

type Participant = {
  uid: string;
  name: string;
  note?: string | null;
  createdAt?: Timestamp | null;
};

// Mini profilo pubblico per rendering elenco
type PublicMini = {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  nickname?: string | null;
};

// Util: costruisci "Cognome, Nome" da profilo pubblico + fallback
function buildCognomeNomeFromPublic(
  p: { firstName?: string | null; lastName?: string | null; displayName?: string | null; nickname?: string | null },
  fallback?: string
): string {
  const fn = (p.firstName || "").trim();
  const ln = (p.lastName || "").trim();
  if (ln || fn) return `${ln}${ln && fn ? ", " : ""}${fn}`.trim();
  const dn = (p.displayName || "").trim();
  if (dn) {
    const parts = dn.split(/\s+/);
    if (parts.length >= 2) {
      const last = parts.pop() as string;
      const first = parts.join(" ");
      return `${last}, ${first}`;
    }
    return dn;
  }
  return (fallback || "Utente").trim();
}

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
  const [noteText, setNoteText] = useState("");
  const [joinSaving, setJoinSaving] = useState(false);

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
          participantsCount: d?.participantsCount ?? 0,
          guidaName: d?.guidaName ?? null,
          createdBy: d?.createdBy,
          createdAt: d?.createdAt ?? null,

          status: (d?.status as Ride["status"]) ?? "active",
          archived: !!d?.archived,
          archiveYear: d?.archiveYear ?? null,
          archiveMonth: d?.archiveMonth ?? null,
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
            uid: x?.uid,
            name: x?.name ?? "",
            note: x?.note ?? null,
            createdAt: x?.createdAt ?? null,
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
      .filter((uid) => uid && !publicIndex[uid]);

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

  const participantsCountLive = participants.length;
  const maxText =
    ride?.maxParticipants == null ? "Nessun limite" : String(ride.maxParticipants);

  const myParticipant = useMemo(
    () => participants.find((p) => p.uid === currentUid) || null,
    [participants, currentUid]
  );

  const formatCognomeNome = useCallback(
    (uid: string, fallback?: string) => {
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
        setIsAdmin(role === "admin");
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

  const cleanUpParticipants = useCallback(async () => {
    if (!rideId) return;
    Alert.alert(
      "Conferma",
      "Pulire i nomi dei partecipanti in questa uscita e aggiornare l'elenco?",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Pulisci",
          style: "destructive",
          onPress: async () => {
            try {
              // 1) Leggi tutti i partecipanti
              const partsSnap = await getDocs(collection(db, "rides", rideId, "participants"));
              const names: string[] = [];

              for (const docSnap of partsSnap.docs) {
                const data = docSnap.data() as any;
                const uid = data?.uid as string | undefined;

                // 2) Recupera mini profilo pubblico (riutilizza fetchPublicMini)
                let mini = uid ? publicIndex[uid] : undefined;
                if (!mini && uid) {
                  mini = await fetchPublicMini(uid);
                  setPublicIndex((prev) => ({ ...prev, [uid]: mini! }));
                }

                // 3) Calcola nome formattato
                const formatted = buildCognomeNomeFromPublic(mini || {}, data?.name)
                  .slice(0, 80);

                names.push(formatted);

                // 4) Aggiorna il documento participant (name + displayName)
                await updateDoc(doc(db, "rides", rideId, "participants", docSnap.id), {
                  name: formatted,
                  displayName: formatted,
                });
              }

              // 5) Aggiorna il documento ride con gli array per la UI legacy
              await updateDoc(doc(db, "rides", rideId), {
                participantsNames: names,
                participants: names,
              });

              Alert.alert("Fatto", "Elenco e partecipanti ripuliti.");
            } catch (e: any) {
              console.error("cleanup error:", e);
              Alert.alert("Errore", e?.message ?? "Impossibile completare la pulizia.");
            }
          },
        },
      ]
    );
  }, [rideId, publicIndex, fetchPublicMini]);

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
      participants.length >= (ride?.maxParticipants ?? 0)
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

      // ✍️ Scrivi SEMPRE il documento completo (compatibile con le regole di update)
      await setDoc(doc(db, "rides", rideId, "participants", u.uid), {
        uid: u.uid,
        name: safeName,
        note: noteText.trim() || null,
        createdAt: serverTimestamp(),
      });

      setNoteModalVisible(false);
      setNoteText("");
    } catch (e: any) {
      console.error("join error:", e);
      Alert.alert("Errore", e?.message ?? "Impossibile prenotarsi.");
    } finally {
      setJoinSaving(false);
    }
  }, [rideId, noteText, joinSaving, ride, participants.length, publicIndex, fetchPublicMini, buildPublicName]);

  const leave = useCallback(async () => {
    const u = auth.currentUser;
    if (!u || !rideId) return;

    Alert.alert("Conferma", "Vuoi cancellare la prenotazione?", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Sì, cancella",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "rides", rideId, "participants", u.uid));
          } catch (e: any) {
            console.error("leave error:", e);
            Alert.alert("Errore", e?.message ?? "Impossibile cancellare la prenotazione.");
          }
        },
      },
    ]);
  }, [rideId]);

  // ─────────────────────────────────────────
  // Flag derivati
  // ─────────────────────────────────────────
  const isCancelled = ride?.status === "cancelled";
  const isArchived = !!ride?.archived;
  const isBookable =
    !!ride &&
    !isCancelled &&
    !isArchived &&
    !(
      typeof ride.maxParticipants === "number" &&
      participants.length >= (ride.maxParticipants ?? 0)
    );

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
    <Screen title={ride.title || "Uscita"} subtitle={whenText} scroll>
      {/* HEADER + TOOLBAR ADMIN */}
      <View style={{ gap: 8, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          {isCancelled && <Badge color="#DC2626" text="ANNULLATA" />}
          {isArchived && <Badge color="#6B7280" text="ARCHIVIATA" />}
        </View>

        {isAdmin && (
          <View style={adminStyles.toolbar}>
            <PrimaryButton label="Modifica" onPress={editRide} />
            {isCancelled ? (
              <PrimaryButton label="Riapri" onPress={reopenRide} style={{ backgroundColor: "#059669" }} />
            ) : (
              <PrimaryButton label="Annulla" onPress={cancelRide} style={{ backgroundColor: "#DC2626" }} />
            )}
            {isArchived ? (
              <PrimaryButton label="Ripristina" onPress={unarchive} style={{ backgroundColor: "#374151" }} />
            ) : (
              <PrimaryButton label="Archivia" onPress={archiveNow} style={{ backgroundColor: "#111827" }} />
            )}
            <PrimaryButton label="Elimina" onPress={deleteRideForever} style={{ backgroundColor: "#7C2D12" }} />
            <PrimaryButton label="Pulisci" onPress={cleanUpParticipants} style={{ backgroundColor: "#0F766E" }} />
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
        <Row label="Descrizione" value={ride.description?.trim() ? ride.description : "—"} multiline />
      </View>

      {/* Prenotazione */}
      <View style={[styles.card, { marginHorizontal: 16, gap: 8 }]}>
        <Text style={styles.sectionTitle}>Prenotazione</Text>

        <Text>
          Partecipanti: <Text style={{ fontWeight: "700" }}>{participantsCountLive}</Text>
          {ride.maxParticipants != null ? ` / ${ride.maxParticipants}` : ""}
        </Text>

        {isArchived && <Text style={{ color: "#6b7280" }}>Uscita archiviata: sola visualizzazione.</Text>}
        {isCancelled && <Text style={{ color: "#DC2626", fontWeight: "600" }}>Uscita annullata: non prenotabile.</Text>}
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
              <PrimaryButton label="Modifica nota" onPress={openNoteModal} disabled={!isBookable} />
              <PrimaryButton label="Non Partecipo" onPress={leave} style={{ backgroundColor: "#b00020" }} />
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
        {loadingParts ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ActivityIndicator />
            <Text>Carico partecipanti…</Text>
          </View>
        ) : participants.length === 0 ? (
          <Text style={{ color: "#666" }}>Ancora nessun partecipante.</Text>
        ) : (
          <FlatList
            data={participants}
            keyExtractor={(item) => item.uid}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item, index }) => (
              <View style={styles.participantRow}>
                <Text style={{ fontWeight: "600" }}>
                  {index + 1}. {formatCognomeNome(item.uid, item.name)}
                </Text>
                {item.note ? <Text style={{ color: "#444" }}>Nota: {item.note}</Text> : null}
              </View>
            )}
            scrollEnabled={false}
          />
        )}
      </View>

      <View style={{ height: 24 }} />
    </Screen>
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
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontWeight: "700", marginBottom: 4 }}>{label}</Text>
      <Text style={{ color: "#222" }}>{multiline ? value : value}</Text>
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
  modalInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    minHeight: 80,
    textAlignVertical: "top",
    backgroundColor: "#fff",
  },
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
