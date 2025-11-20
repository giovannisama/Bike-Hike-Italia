import { db } from "./firebaseAdmin";

export type ApprovedTokensResult = {
  approvedUsersCount: number;
  tokens: string[];
};

type TokenFilterOptions = {
  /**
   * Nome del campo booleano nel documento utente che,
   * se === true, indica che l’utente ha DISABILITATO
   * quello specifico tipo di notifica.
   *
   * Esempi:
   *  - "notificationsDisabledForCreatedRide"
   *  - "notificationsDisabledForCancelledRide"
   *  - "notificationsDisabledForPendingUser"
   */
  eventFlagField?: string;
};

export async function fetchApprovedExpoTokens(
  options?: TokenFilterOptions
): Promise<ApprovedTokensResult> {
  const snapshot = await db
    .collection("users")
    .where("approved", "==", true)
    .get();

  const tokensSet = new Set<string>();
  const eventFlagField = options?.eventFlagField;

  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data() as any;

    // Utente disabilitato o notifiche globalmente disabilitate
    if (data.disabled === true) return;
    if (data.notificationsDisabled === true) return;

    // Se è specificato un flag per evento, escludiamo chi ha disattivato quel tipo
    if (eventFlagField && (data[eventFlagField] === true)) return;

    const tokens = Array.isArray(data.expoPushTokens)
      ? data.expoPushTokens
      : [];

    tokens.forEach((tok: unknown) => {
      if (typeof tok === "string" && tok.length > 0) {
        tokensSet.add(tok);
      }
    });
  });

  return {
    approvedUsersCount: snapshot.docs.length,
    tokens: Array.from(tokensSet),
  };
}

export type RoleTokensResult = {
  roleUsersCount: number;
  tokens: string[];
};

export async function fetchOwnerExpoTokens(
  options?: TokenFilterOptions
): Promise<RoleTokensResult> {
  const snapshot = await db
    .collection("users")
    .where("role", "==", "owner")
    .get();

  const tokensSet = new Set<string>();
  const eventFlagField = options?.eventFlagField;

  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data() as any;

    // Owner disabilitato o notifiche globalmente disabilitate
    if (data.disabled === true) return;
    if (data.notificationsDisabled === true) return;

    // Se è specificato un flag per evento, escludiamo chi ha disattivato quel tipo
    if (eventFlagField && (data[eventFlagField] === true)) return;

    const tokens = Array.isArray(data.expoPushTokens)
      ? data.expoPushTokens
      : [];

    tokens.forEach((tok: unknown) => {
      if (typeof tok === "string" && tok.length > 0) {
        tokensSet.add(tok);
      }
    });
  });

  return {
    roleUsersCount: snapshot.docs.length,
    tokens: Array.from(tokensSet),
  };
}