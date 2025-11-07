import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, Timestamp, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

export type MedicalCertificateType = "semplice" | "agonistico";

export type MedicalCertificateRecord = {
  type: MedicalCertificateType;
  expiresAt: Date | null;
  alertDays: number;
  imageBase64: string | null;
  mimeType: "image/jpeg" | "image/png" | null;
  size?: number | null;
  width?: number | null;
  height?: number | null;
  rotation?: number | null;
  snoozedUntil?: Date | null;
  updatedAt?: Date | null;
  uploadedAt?: Date | null;
};

type FirestoreCertificateDoc = {
  type?: MedicalCertificateType;
  expiresAt?: Timestamp | null;
  alertDays?: number;
  imageBase64?: string | null;
  mimeType?: "image/jpeg" | "image/png" | null;
  size?: number | null;
  width?: number | null;
  height?: number | null;
  rotation?: number | null;
  snoozedUntil?: Timestamp | null;
  updatedAt?: Timestamp | null;
  uploadedAt?: Timestamp | null;
};

export type UploadCertificateParams = {
  base64: string;
  mimeType: "image/jpeg" | "image/png";
  type: MedicalCertificateType;
  expiresAt: Date;
  alertDays: number;
  size?: number;
  width?: number | null;
  height?: number | null;
};

export type UpdateCertificateMetadata = {
  type?: MedicalCertificateType;
  expiresAt?: Date;
  alertDays?: number;
  rotation?: number | null;
  snoozedUntil?: Date | null;
};

const CERT_DOC = (uid: string) => doc(db, "users", uid, "medicalCertificate", "metadata");

const parseTimestamp = (ts?: Timestamp | null): Date | null => (ts?.toDate?.() ?? null);

const normalizeRecord = (snapshot: FirestoreCertificateDoc | null | undefined): MedicalCertificateRecord | null => {
  if (!snapshot) return null;
  const type = snapshot.type ?? null;
  if (type !== "semplice" && type !== "agonistico") return null;
  return {
    type,
    expiresAt: parseTimestamp(snapshot.expiresAt),
    alertDays: typeof snapshot.alertDays === "number" ? snapshot.alertDays : 30,
    imageBase64: snapshot.imageBase64 ?? null,
    mimeType: snapshot.mimeType ?? null,
    size: snapshot.size ?? null,
    width: snapshot.width ?? null,
    height: snapshot.height ?? null,
    rotation: snapshot.rotation ?? 0,
    snoozedUntil: parseTimestamp(snapshot.snoozedUntil),
    updatedAt: parseTimestamp(snapshot.updatedAt),
    uploadedAt: parseTimestamp(snapshot.uploadedAt),
  };
};

export default function useMedicalCertificate() {
  const uid = auth.currentUser?.uid ?? null;
  const [loading, setLoading] = useState<boolean>(!!uid);
  const [certificate, setCertificate] = useState<MedicalCertificateRecord | null>(null);

  useEffect(() => {
    if (!uid) {
      setCertificate(null);
      setLoading(false);
      return;
    }

    const certDocRef = CERT_DOC(uid);
    const unsub = onSnapshot(
      certDocRef,
      (snap) => {
        setCertificate(normalizeRecord(snap.data() as FirestoreCertificateDoc));
        setLoading(false);
      },
      () => {
        setCertificate(null);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [uid]);

  const uploadCertificate = useCallback(
    async ({ base64, mimeType, type, expiresAt, alertDays, size, width, height }: UploadCertificateParams) => {
      if (!uid) throw new Error("Utente non autenticato");
      const docRef = CERT_DOC(uid);

      await setDoc(
        docRef,
        {
          type,
          expiresAt: Timestamp.fromDate(expiresAt),
          alertDays,
          imageBase64: base64,
          mimeType,
          size: size ?? null,
          width: width ?? null,
          height: height ?? null,
          rotation: 0,
          snoozedUntil: null,
          updatedAt: serverTimestamp(),
          uploadedAt: serverTimestamp(),
        },
        { merge: true }
      );
    },
    [uid]
  );

  const updateMetadata = useCallback(
    async ({ type, expiresAt, alertDays, rotation, snoozedUntil }: UpdateCertificateMetadata) => {
      if (!uid) throw new Error("Utente non autenticato");
      const docRef = CERT_DOC(uid);
      const payload: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };
      if (type) payload.type = type;
      if (typeof alertDays === "number" && Number.isFinite(alertDays)) payload.alertDays = alertDays;
      if (expiresAt) payload.expiresAt = Timestamp.fromDate(expiresAt);
      if (typeof rotation === "number") payload.rotation = ((rotation % 360) + 360) % 360;
      if (rotation === null) payload.rotation = 0;
      if (snoozedUntil) {
        payload.snoozedUntil = Timestamp.fromDate(snoozedUntil);
      } else if (snoozedUntil === null) {
        payload.snoozedUntil = null;
      }

      await updateDoc(docRef, payload);
    },
    [uid]
  );

  const deleteCertificate = useCallback(async () => {
    if (!uid) throw new Error("Utente non autenticato");
    const docRef = CERT_DOC(uid);
    await deleteDoc(docRef);
  }, [uid]);

  return useMemo(
    () => ({
      loading,
      certificate,
      uploadCertificate,
      updateMetadata,
      deleteCertificate,
    }),
    [certificate, deleteCertificate, loading, updateMetadata, uploadCertificate]
  );
}
