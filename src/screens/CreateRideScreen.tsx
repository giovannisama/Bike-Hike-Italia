// src/screens/CreateRideScreen.tsx
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  Pressable,
  TouchableOpacity,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { auth, db } from "../firebase";
import {
  serverTimestamp,
  Timestamp,
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  setDoc,
  collection,
} from "firebase/firestore";
import { Screen, UI } from "../components/Screen";

const BIKE_TYPES = ["BDC", "Gravel", "MTB", "Enduro"] as const;
const DIFFICULTY_OPTIONS = [
  "Facile",
  "Medio/Moderato",
  "Difficile/Impegnativo",
  "Estremo",
] as const;

// Spaziatore verticale
const VSpace = ({ size = "md" as keyof typeof UI.spacing }) => (
  <View style={{ height: UI.spacing[size] }} />
);

// Tipi route (adatta se il tuo RootStack ha nomi diversi)
type RootStackParamList = {
  CreateRide: { rideId?: string } | undefined;
};

export default function CreateRideScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, "CreateRide">>();
  const rideId = route.params?.rideId;

  // ---------- stato admin ----------
  const [isAdmin, setIsAdmin] = useState(false);

  // ---------- campi uscita ----------
  const [title, setTitle] = useState("");
  const [guidaText, setGuidaText] = useState("");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [link, setLink] = useState(""); // opzionale
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(""); // YYYY-MM-DD
  const [time, setTime] = useState(""); // HH:MM
  const [bikes, setBikes] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<string>(""); // opzionale
  const [maxParticipants, setMaxParticipants] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [loadingPrefill, setLoadingPrefill] = useState<boolean>(!!rideId);

  // campi amministrativi (solo in edit)
  const [status, setStatus] = useState<"active" | "cancelled">("active");
  const [archived, setArchived] = useState<boolean>(false);

  // --------- util ---------
  const toggleBike = (b: string) =>
    setBikes((prev) =>
      prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]
    );

  const parseDateTime = (): Date | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
      return null;
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
    return isNaN(dt.getTime()) ? null : dt;
  };

  const isEdit = !!rideId;

  // ---------- leggi ruolo utente ----------
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const ref = doc(db, "users", uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const role = snap.exists() ? (snap.data() as any)?.role : null;
        setIsAdmin(role === "admin" || role === "owner");
      },
      () => setIsAdmin(false)
    );
    return () => unsub();
  }, []);

  // ---------- prefill in modalità EDIT ----------
  useEffect(() => {
    if (!rideId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "rides", rideId));
        if (!snap.exists()) {
          Alert.alert("Attenzione", "Uscita non trovata.");
          navigation.goBack();
          return;
        }
        const d = snap.data() as any;
        setTitle(d?.title ?? "");
        setGuidaText(
          Array.isArray(d?.guidaNames) && d.guidaNames.length
            ? d.guidaNames.join(", ")
            : (d?.guidaName ?? "")
        );
        setMeetingPoint(d?.meetingPoint ?? "");
        setLink(d?.link ?? "");
        setDescription(d?.description ?? "");
        setBikes(Array.isArray(d?.bikes) ? d.bikes : []);
        setDifficulty(d?.difficulty ?? "");
        // date/time
        const dt = (d?.dateTime || d?.date) as Timestamp | undefined;
        if (dt?.toDate) {
          const _d = dt.toDate();
          const yyyy = String(_d.getFullYear());
          const mm = String(_d.getMonth() + 1).padStart(2, "0");
          const dd = String(_d.getDate()).padStart(2, "0");
          const HH = String(_d.getHours()).padStart(2, "0");
          const MM = String(_d.getMinutes()).padStart(2, "0");
          setDate(`${yyyy}-${mm}-${dd}`);
          setTime(`${HH}:${MM}`);
        }
        setMaxParticipants(
          typeof d?.maxParticipants === "number" ? String(d.maxParticipants) : ""
        );
        setStatus((d?.status as any) === "cancelled" ? "cancelled" : "active");
        setArchived(!!d?.archived);
      } catch (e: any) {
        Alert.alert("Errore", e?.message ?? "Impossibile caricare i dati.");
      } finally {
        setLoadingPrefill(false);
      }
    })();
  }, [rideId, navigation]);

  // ---------- validazione semplice ----------
  const validate = useCallback(() => {
    const t = title.trim();
    const mp = meetingPoint.trim();

    if (!t) {
      Alert.alert("Titolo mancante", "Inserisci un titolo (es. Uscita Gravel).");
      return false;
    }
    if (t.length > 120) {
      Alert.alert("Titolo troppo lungo", "Massimo 120 caratteri.");
      return false;
    }
    if (!mp) {
      Alert.alert("Luogo mancante", "Inserisci il punto di ritrovo.");
      return false;
    }
    if (mp.length > 200) {
      Alert.alert("Luogo troppo lungo", "Massimo 200 caratteri.");
      return false;
    }

    const dt = parseDateTime();
    if (!dt) {
      Alert.alert(
        "Data/Ora non validi",
        "Controlla il formato di data (YYYY-MM-DD) e ora (HH:MM)."
      );
      return false;
    }

    if (
      maxParticipants.trim() !== "" &&
      (Number.isNaN(Number(maxParticipants)) || Number(maxParticipants) < 0)
    ) {
      Alert.alert(
        "Numero massimo non valido",
        "Lascia vuoto oppure inserisci un numero ≥ 0."
      );
      return false;
    }
    if (difficulty && !DIFFICULTY_OPTIONS.includes(difficulty as any)) {
      Alert.alert("Difficoltà non valida", "Seleziona un valore dall'elenco.");
      return false;
    }
    // bikes max 20 (come da rules)
    if (Array.isArray(bikes) && bikes.length > 20) {
      Alert.alert("Troppe tipologie bici", "Massimo 20 elementi.");
      return false;
    }
    return true;
  }, [title, meetingPoint, date, time, maxParticipants, difficulty, bikes]);

  // ---------- helper pulizia payload ----------
  function sanitizeCreatePayload(raw: any) {
    // trim stringhe
    const obj: Record<string, any> = { ...raw };
    const trimIfString = (v: any) => (typeof v === "string" ? v.trim() : v);

    Object.keys(obj).forEach((k) => {
      obj[k] = trimIfString(obj[k]);
    });

    // rimuovi chiavi con null/undefined per non rischiare validazioni inutili
    Object.keys(obj).forEach((k) => {
      if (obj[k] === null || obj[k] === undefined) delete obj[k];
    });

    return obj;
  }

  // ---------- salva ----------
  const onSave = async () => {
    if (!isAdmin) {
      Alert.alert("Permesso negato", "Solo l'amministratore può salvare.");
      return;
    }
    if (!auth.currentUser) {
      Alert.alert("Attendi", "Autenticazione in corso…");
      return;
    }
    if (!validate()) return;

    const dt = parseDateTime()!;
    const maxNum =
      maxParticipants.trim() === ""
        ? null
        : Number.isNaN(Number(maxParticipants))
        ? null
        : Number(maxParticipants);

    // guidaName (singolo) + guidaNames (lista) dai testi separati da virgola
    const names = guidaText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const guidaName = names.length > 0 ? names[0] : null;
    const guidaNames = names.length > 1 ? names : names.length === 1 ? [names[0]] : null;

    // costruisci payload compatibile rules
    const basePayload: Record<string, any> = {
      title: title.trim(),
      meetingPoint: meetingPoint.trim(),
      description: (description || "").trim() || null,
      bikes: Array.isArray(bikes) ? bikes.slice(0, 20) : [],
      dateTime: Timestamp.fromDate(dt), // ⬅️ OBBLIGATORIO timestamp
      date: Timestamp.fromDate(dt),     // opzionale ma ok come timestamp
      maxParticipants: maxNum,          // null o int >= 0
      createdBy: auth.currentUser.uid,  // ⬅️ string
      createdAt: serverTimestamp(),     // ⬅️ timestamp
      status: "active",                 // ⬅️ "active" | "cancelled"
      archived: false,                  // ⬅️ bool
      participantsCount: 0,             // ⬅️ int >= 0
      link: link.trim() ? link.trim() : null,
      difficulty: difficulty ? difficulty : null,
      guidaName: guidaName ?? null,
      guidaNames: guidaNames ?? null,   // lista o omessa
      // archiveYear/month verranno aggiunti solo in archivio
    };

    const payload = sanitizeCreatePayload(basePayload);

    setSaving(true);
    try {
      if (isEdit) {
        // UPDATE (solo campi ammessi dalle regole)
        await updateDoc(doc(db, "rides", rideId!), {
          ...payload,
          status,   // "active" | "cancelled"
          archived, // true | false
        });
        Alert.alert("Aggiornata", "Uscita modificata correttamente.");
      } else {
        // CREATE con setDoc su id generato (invece di addDoc)
        const ridesColl = collection(db, "rides");
        // genera id localmente (usa crypto.randomUUID se disponibile, altrimenti Firestore doc().id)
        const newId = (globalThis as any).crypto?.randomUUID?.() ?? doc(ridesColl).id;
        await setDoc(doc(db, "rides", newId), payload);
        Alert.alert("OK", "Uscita salvata!");
      }
      navigation.goBack();
    } catch (e: any) {
      console.error("Errore creazione/modifica ride:", e);
      // messaggio più parlante
      Alert.alert(
        "Errore",
        e?.message?.includes("Missing or insufficient permissions")
          ? "Permessi insufficienti secondo le regole Firestore. Verifica di essere ADMIN/OWNER e che tutti i campi rispettino lo schema (data/ora come Timestamp, title/meetingPoint non vuoti, ecc.)."
          : e?.message ?? "Impossibile salvare l’uscita."
      );
    } finally {
      setSaving(false);
    }
  };

  // ---------- azioni rapide admin ----------
  const toggleCancelled = async () => {
    if (!isEdit || !rideId) return;
    if (!isAdmin) return;
    try {
      const next = status === "active" ? "cancelled" : "active";
      await updateDoc(doc(db, "rides", rideId), { status: next });
      setStatus(next);
      Alert.alert("Fatto", next === "cancelled" ? "Uscita annullata." : "Uscita riaperta.");
    } catch (e: any) {
      Alert.alert("Errore", e?.message ?? "Impossibile aggiornare lo stato.");
    }
  };

  const toggleArchived = async () => {
    if (!isEdit || !rideId) return;
    if (!isAdmin) return;
    try {
      const next = !archived;
      const dateObj = parseDateTime() ?? new Date();
      const y = dateObj.getFullYear();
      const m = dateObj.getMonth() + 1;
      await updateDoc(doc(db, "rides", rideId), {
        archived: next,
        ...(next ? { archiveYear: y, archiveMonth: m } : { archiveYear: null, archiveMonth: null }),
      });
      setArchived(next);
      Alert.alert("Fatto", next ? "Uscita archiviata." : "Uscita ripristinata.");
    } catch (e: any) {
      Alert.alert("Errore", e?.message ?? "Impossibile aggiornare l'archivio.");
    }
  };

  // ---------- UI ----------
  const titleScreen = isEdit ? "Modifica Uscita" : "Crea Uscita";

  const adminWarning = !isAdmin ? "Solo l’amministratore può salvare o modificare un’uscita." : null;

  return (
    <Screen
      title={titleScreen}
      subtitle={isAdmin ? "Solo gli amministratori possono salvare" : "Compila i dettagli dell'uscita"}
      scroll={true}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: UI.spacing.md }}>
        {!!adminWarning && (
          <View style={styles.alertBox}>
            <Text style={styles.alertText}>{adminWarning}</Text>
          </View>
        )}

        <View style={styles.formBlock}>
          <Text style={styles.label}>Titolo *</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Uscita Gravel ai Colli Euganei"
            style={styles.input}
            autoCorrect
            autoCapitalize="sentences"
            returnKeyType="next"
            blurOnSubmit={false}
          />
        </View>

        <View style={styles.formBlock}>
          <Text style={styles.label}>Guida (testo libero)</Text>
          <TextInput
            value={guidaText}
            onChangeText={setGuidaText}
            placeholder="Es. Mario Rossi, Anna Verdi"
            style={styles.input}
          />
          <Text style={styles.helperText}>
            Puoi inserire più nomi separati da virgola. Il primo sarà mostrato come “guida principale”.
          </Text>
        </View>

        <View style={styles.formBlock}>
          <Text style={styles.label}>Tipo di bici</Text>
          <View style={styles.chipsWrap}>
            {BIKE_TYPES.map((b) => {
              const active = bikes.includes(b);
              return (
                <Pressable
                  key={b}
                  onPress={() => toggleBike(b)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{b}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.formBlock}>
          <Text style={styles.label}>Difficoltà</Text>
          <View style={styles.chipsWrap}>
            {DIFFICULTY_OPTIONS.map((opt) => {
              const active = difficulty === opt;
              return (
                <Pressable
                  key={opt}
                  onPress={() => setDifficulty(active ? "" : opt)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.formBlock}>
          <Text style={styles.label}>Data (YYYY-MM-DD) *</Text>
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="2025-10-10"
            keyboardType="default"
            autoCapitalize="none"
            style={styles.input}
          />
        </View>

        <View style={styles.formBlock}>
          <Text style={styles.label}>Ora (HH:MM) *</Text>
          <TextInput
            value={time}
            onChangeText={setTime}
            placeholder="08:30"
            keyboardType="default"
            autoCapitalize="none"
            style={styles.input}
          />
        </View>

        <View style={styles.formBlock}>
          <Text style={styles.label}>Luogo di ritrovo *</Text>
          <TextInput
            value={meetingPoint}
            onChangeText={setMeetingPoint}
            placeholder="Piazzale Roma"
            style={styles.input}
          />
        </View>

        <View style={styles.formBlock}>
          <Text style={styles.label}>Link posizione (opzionale)</Text>
          <TextInput
            value={link}
            onChangeText={setLink}
            placeholder="Incolla link Google Maps / Apple Maps / geo:"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
        </View>

        <View style={styles.formBlock}>
          <Text style={styles.label}>Descrizione</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Percorso gravel panoramico…"
            style={[styles.input, styles.textArea]}
            multiline
          />
        </View>

        <View style={styles.formBlock}>
          <Text style={styles.label}>Numero massimo partecipanti (opzionale)</Text>
          <TextInput
            value={maxParticipants}
            onChangeText={setMaxParticipants}
            placeholder="es. 12 (lascia vuoto per nessun limite)"
            keyboardType="number-pad"
            style={styles.input}
          />
        </View>

        {isEdit && isAdmin && (
          <View style={[styles.formBlock, { gap: UI.spacing.sm }]}>
            <Text style={styles.label}>Azioni amministrative</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: UI.spacing.sm }}>
              <Pressable
                onPress={toggleCancelled}
                style={[
                  styles.adminBtn,
                  status === "cancelled" && { backgroundColor: UI.colors.danger },
                ]}
              >
                <Text style={styles.adminBtnText}>
                  {status === "cancelled" ? "Riapri" : "Annulla"}
                </Text>
              </Pressable>
              <Pressable
                onPress={toggleArchived}
                style={[
                  styles.adminBtn,
                  archived && { backgroundColor: UI.colors.muted },
                ]}
              >
                <Text style={styles.adminBtnText}>
                  {archived ? "Ripristina" : "Archivia"}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.helperText}>
              Stato attuale: {status === "cancelled" ? "ANNULLATA" : "ATTIVA"}
              {archived ? " • ARCHIVIATA" : ""}
            </Text>
          </View>
        )}

        <View style={{ marginTop: UI.spacing.lg }}>
          <TouchableOpacity
            onPress={onSave}
            disabled={saving || !isAdmin || loadingPrefill}
            style={[
              styles.saveBtn,
              (saving || !isAdmin || loadingPrefill) && styles.saveBtnDisabled,
            ]}
          >
            <Text style={styles.saveBtnText}>
              {saving
                ? isEdit
                  ? "Aggiorno…"
                  : "Salvataggio…"
                : isEdit
                ? "💾 Salva modifiche"
                : "💾 Crea uscita"}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.mandatoryNote}>* Campi obbligatori</Text>

        <VSpace size="xl" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  formBlock: { gap: UI.spacing.xs },
  label: {
    fontWeight: "700",
    color: UI.colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: UI.radius.md,
    paddingHorizontal: UI.spacing.sm,
    paddingVertical: 12,
    backgroundColor: "#fff",
    fontSize: 16,
    color: UI.colors.text,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: "top",
  },
  helperText: {
    fontSize: 12,
    color: UI.colors.muted,
  },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: UI.spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: UI.radius.round,
    paddingHorizontal: UI.spacing.md,
    paddingVertical: UI.spacing.xs,
    backgroundColor: "#fff",
  },
  chipActive: {
    backgroundColor: UI.colors.primary,
    borderColor: UI.colors.primary,
  },
  chipText: { color: UI.colors.text, fontWeight: "600" },
  chipTextActive: { color: "#fff" },

  adminBtn: {
    backgroundColor: UI.colors.primary,
    paddingHorizontal: UI.spacing.md,
    paddingVertical: UI.spacing.xs,
    borderRadius: UI.radius.md,
  },
  adminBtnText: { color: "#fff", fontWeight: "700" },
  alertBox: {
    backgroundColor: UI.colors.warningBg,
    borderColor: UI.colors.warningBorder,
    borderWidth: 1,
    borderRadius: UI.radius.md,
    padding: UI.spacing.sm,
  },
  alertText: {
    color: "#7C2D12",
    fontWeight: "600",
  },
  saveBtn: {
    backgroundColor: UI.colors.accent,
    borderRadius: UI.radius.lg,
    paddingVertical: UI.spacing.sm,
    alignItems: "center",
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
  mandatoryNote: {
    fontSize: 12,
    color: UI.colors.muted,
    textAlign: "right",
  },
});
