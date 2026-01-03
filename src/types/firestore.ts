// Tipi centralizzati per i documenti principali in Firestore
import type { Timestamp } from "firebase/firestore";

export type FirestoreTimestamp = Timestamp;

export type ParticipantServices = Partial<
  Record<"lunch" | "dinner" | "overnight", "yes" | "no" | null | undefined>
>;

export interface UserDoc {
  uid?: string;
  email?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  role?: "admin" | "member" | "owner" | boolean | string;
  approved?: boolean | string | number;
  disabled?: boolean | string | number;
  notificationsDisabled?: boolean;
  notificationsDisabledForCreatedRide?: boolean;
  notificationsDisabledForCancelledRide?: boolean;
  notificationsDisabledForCreatedTrek?: boolean;
  notificationsDisabledForCancelledTrek?: boolean;
  notificationsDisabledForCreatedSocial?: boolean;
  notificationsDisabledForCancelledSocial?: boolean;
  notificationsDisabledForPendingUser?: boolean;
  notificationsDisabledForBoardPost?: boolean;
  enabledSections?: string[];
  expoPushTokens?: string[];
  membershipCard?:
  | string
  | null
  | {
    base64?: string;
    updatedAt?: FirestoreTimestamp | null;
  };
  medicalCertificate?: any;
  createdAt?: FirestoreTimestamp | null;
  [key: string]: any;
}

export interface PublicUserDoc {
  displayName?: string;
  firstName?: string | null;
  lastName?: string | null;
  nickname?: string | null;
  role?: string | null;
  approved?: boolean | null;
  disabled?: boolean | null;
  email?: string | null;
  createdAt?: FirestoreTimestamp | null;
  [key: string]: any;
}

export interface RideDoc {
  title?: string;
  meetingPoint?: string;
  description?: string | null;
  bikes?: string[] | null;
  date?: FirestoreTimestamp | null;
  dateTime?: FirestoreTimestamp | null;
  maxParticipants?: number | null;
  participantsCount?: number | null;
  participantsCountSelf?: number | null;
  participantsCountTotal?: number | null;
  kind?: "ride" | "trek" | "trip";
  trek?: TrekData | null;
  trip?: TripData | null;
  status?: string;
  archived?: boolean;
  archiveYear?: number | null;
  archiveMonth?: number | null;
  guidaName?: string | null;
  guidaNames?: string[] | null;
  link?: string | null;
  difficulty?: string | null;
  manualParticipants?: Array<{
    id?: string;
    name?: string;
    note?: string | null;
    manual?: boolean;
    addedBy?: string | null;
    createdAt?: FirestoreTimestamp | null;
    services?: ParticipantServices | null;
    [key: string]: any;
  }> | null;
  extraServices?: {
    lunch?: { enabled?: boolean; label?: string | null };
    dinner?: { enabled?: boolean; label?: string | null };
    overnight?: { enabled?: boolean; label?: string | null };
    [key: string]: any;
  } | null;
  createdAt?: FirestoreTimestamp | null;
  updatedAt?: FirestoreTimestamp | null;
  [key: string]: any;
}

export interface TrekData {
  difficulty?: "Facile" | "Medio" | "Impegnativo" | "Estremo" | null;
  elevation?: number | string | null;
  length?: number | string | null; // Sviluppo planimetrico
  mandatoryGear?: string | null;
}

export interface TrekDoc extends RideDoc {
  kind: "trek";
  trek: TrekData;
}

export interface TripData {
  Tipologia?: {
    tipoViaggio?: string | null;
    mezzoTrasporto?: string | null;
    durataGiorni?: string | null;
    tipoPernotto?: string | null;
  };
  Informazioni?: {
    organizzatore?: string | null;
    titoloEvento?: string | null;
  };
  QuandoeDove?: {
    data?: FirestoreTimestamp | null;
    ora?: string | null;
    luogoRitrovo?: string | null;
    linkPosizione?: string | null;
  };
  Descrizione?: {
    descrizione?: string | null;
  };
  Partecipanti?: {
    maxPartecipanti?: number | null;
  };
  ServiziExtra?: {
    pranzo?: boolean;
    cena?: boolean;
    pernotto?: boolean;
  };
}

export interface TripDoc extends RideDoc {
  kind: "trip";
  trip: TripData;
}

export interface ParticipantDoc {
  uid?: string;
  name?: string;
  displayName?: string;
  nickname?: string;
  note?: string | null;
  createdAt?: FirestoreTimestamp | null;
  services?: ParticipantServices | null;
  [key: string]: any;
}

export type ExtraServiceState = { enabled: boolean; label: string | null };

export interface SocialEventDoc {
  title?: string;
  meetingPlaceText?: string;
  meetingMapUrl?: string | null;
  organizerName?: string | null;
  description?: string | null;
  startAt?: FirestoreTimestamp | null;
  status?: "active" | "cancelled" | "archived";
  extraServices?: {
    lunch?: ExtraServiceState;
    dinner?: ExtraServiceState;
  } | null;
  createdAt?: FirestoreTimestamp | null;
  updatedAt?: FirestoreTimestamp | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  [key: string]: any;
}
