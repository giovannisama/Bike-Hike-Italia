import { differenceInCalendarDays } from "date-fns/differenceInCalendarDays";
import { MedicalCertificateRecord } from "../hooks/useMedicalCertificate";

export type CertificateStatus =
  | { kind: "missing"; daysRemaining: null }
  | { kind: "valid" | "warning" | "expired"; daysRemaining: number | null };

export const getCertificateStatus = (
  certificate: MedicalCertificateRecord | null
): CertificateStatus => {
  if (!certificate) return { kind: "missing", daysRemaining: null };
  if (!certificate.expiresAt) return { kind: "valid", daysRemaining: null };

  const now = new Date();
  const daysRemaining = differenceInCalendarDays(certificate.expiresAt, now);
  if (daysRemaining < 0) return { kind: "expired", daysRemaining };

  const threshold = certificate.alertDays ?? 30;
  if (daysRemaining <= threshold) {
    return { kind: "warning", daysRemaining };
  }
  return { kind: "valid", daysRemaining };
};
