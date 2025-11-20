// Tipi centralizzati per i documenti principali in Firestore

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
  notificationsDisabledForPendingUser?: boolean;
  expoPushTokens?: string[];
  membershipCard?:
    | string
    | null
    | {
        base64?: string;
        updatedAt?: any;
      };
  medicalCertificate?: any;
  createdAt?: any;
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
  createdAt?: any;
  [key: string]: any;
}

export interface RideDoc {
  title?: string;
  meetingPoint?: string;
  description?: string | null;
  bikes?: string[] | null;
  date?: any;
  dateTime?: any;
  maxParticipants?: number | null;
  participantsCount?: number | null;
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
    createdAt?: any;
    services?: ParticipantServices | null;
    [key: string]: any;
  }> | null;
  extraServices?: {
    lunch?: { enabled?: boolean; label?: string | null };
    dinner?: { enabled?: boolean; label?: string | null };
    overnight?: { enabled?: boolean; label?: string | null };
    [key: string]: any;
  } | null;
  createdAt?: any;
  updatedAt?: any;
  [key: string]: any;
}

export interface ParticipantDoc {
  uid?: string;
  name?: string;
  displayName?: string;
  nickname?: string;
  note?: string | null;
  createdAt?: any;
  services?: ParticipantServices | null;
  [key: string]: any;
}
