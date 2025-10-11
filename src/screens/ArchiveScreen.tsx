// src/screens/ArchiveScreen.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  SectionList,
} from "react-native";
import { Screen, Hero } from "../components/Screen";
import { PillButton } from "../components/Button";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { format } from "date-fns";
import { it } from "date-fns/locale";

type Ride = {
  id: string;
  title: string;
  meetingPoint: string;
  dateTime?: Timestamp | null;
  status?: "active" | "cancelled";
  difficulty?: string | null;
};

type Section = { title: string; data: Ride[] };

const YEARS_BACK = 6; // quanti anni indietro vuoi mostrare nel filtro

export default function ArchiveScreen() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [items, setItems] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);

  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = now.getFullYear(); y >= now.getFullYear() - YEARS_BACK; y--) {
      arr.push(y);
    }
    return arr;
  }, [now]);

  useEffect(() => {
    setLoading(true);

    const start = new Date(year, 0, 1, 0, 0, 0, 0);
    const end = new Date(year + 1, 0, 1, 0, 0, 0, 0);

    // Query: tutte le uscite con dateTime nell’anno selezionato (discendente)
    const q = query(
      collection(db, "rides"),
      where("dateTime", ">=", Timestamp.fromDate(start)),
      where("dateTime", "<", Timestamp.fromDate(end)),
      orderBy("dateTime", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: Ride[] = [];
        snap.forEach((d) => {
          const x = d.data() as any;
          rows.push({
            id: d.id,
            title: x?.title ?? "",
            meetingPoint: x?.meetingPoint ?? "",
            dateTime: x?.dateTime ?? null,
            status: x?.status ?? "active",
            difficulty: x?.difficulty ?? null,
          });
        });
        setItems(rows);
        setLoading(false);
      },
      (err) => {
        console.error("Archivio errore:", err);
        setItems([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [year]);

  // Raggruppa per mese (titolo es. "Ottobre 2025")
  const sections: Section[] = useMemo(() => {
    const buckets = new Map<string, Ride[]>();
    for (const r of items) {
      const dt = r.dateTime?.toDate?.();
      const key = dt ? format(dt, "MMMM yyyy", { locale: it }) : "Senza data";
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(r);
    }
    // ordina le sezioni per data discendente secondo l’ordine già dato dai dati
    const out: Section[] = [];
    for (const [title, data] of buckets.entries()) {
      out.push({ title, data });
    }
    // mantieni l’ordine mesi secondo la prima occorrenza in items (già DESC)
    const orderIndex = (title: string) =>
      items.findIndex((r) => {
        const dt = r.dateTime?.toDate?.();
        return title === (dt ? format(dt, "MMMM yyyy", { locale: it }) : "Senza data");
      });
    out.sort((a, b) => orderIndex(a.title) - orderIndex(b.title));
    return out;
  }, [items]);

  const renderYearPills = () => (
    <View style={styles.pills}>
      {years.map((y) => (
        <PillButton
          key={y}
          label={String(y)}
          active={y === year}
          onPress={() => setYear(y)}
        />
      ))}
    </View>
  );

  const renderItem = ({ item }: { item: Ride }) => {
    const dt = item.dateTime?.toDate?.();
    const when = dt ? format(dt, "EEE d MMM • HH:mm", { locale: it }) : "—";
    const isCancelled = item.status === "cancelled";

    return (
      <View style={styles.card}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              style={[
                styles.title,
                isCancelled && { textDecorationLine: "line-through", color: "#991B1B" },
              ]}
              numberOfLines={1}
            >
              {item.title || "Uscita"}
            </Text>
            {isCancelled && (
              <View style={styles.cancelPill}>
                <Text style={styles.cancelPillText}>Annullata</Text>
              </View>
            )}
          </View>
          <Text style={styles.row}>
            <Text style={styles.label}>Quando: </Text>
            <Text style={styles.value}>{when}</Text>
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Ritrovo: </Text>
            <Text style={styles.value} numberOfLines={1}>
              {item.meetingPoint || "—"}
            </Text>
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Difficoltà: </Text>
            <Text style={styles.value}>{item.difficulty || "—"}</Text>
          </Text>
        </View>
      </View>
    );
  };

  return (
    <Screen useNativeHeader={true} scroll={false}>
      <View style={{ flex: 1 }}>
        <Hero title={`Archivio ${year}`} subtitle="Uscite passate per mese" />
        {/* Filtro Anno */}
        {renderYearPills()}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={{ marginTop: 8 }}>Carico archivio…</Text>
          </View>
        ) : sections.length === 0 ? (
          <View style={styles.center}>
            <Text>Nessuna uscita trovata per il {year}.</Text>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            renderSectionHeader={({ section }) => (
              <Text style={styles.sectionHeader}>{section.title}</Text>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            SectionSeparatorComponent={() => <View style={{ height: 16 }} />}
            contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  sectionHeader: {
    fontSize: 14,
    fontWeight: "800",
    color: "#374151",
    marginBottom: 6,
    marginTop: 12,
    textTransform: "capitalize", // per "ottobre" -> "ottobre"
  },

  card: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
  },
  title: { fontSize: 16, fontWeight: "700", marginBottom: 2, color: "#111" },
  row: { marginTop: 2 },
  label: { fontWeight: "700", color: "#222" },
  value: { color: "#333" },

  // Pill Annullata
  cancelPill: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  cancelPillText: { color: "#991B1B", fontWeight: "800", fontSize: 12 },

  // Year pills
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
  },
});
