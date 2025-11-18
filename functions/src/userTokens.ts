import { db } from "./firebaseAdmin";

export type ApprovedTokensResult = {
  approvedUsersCount: number;
  tokens: string[];
};

export async function fetchApprovedExpoTokens(): Promise<ApprovedTokensResult> {
  const snapshot = await db
    .collection("users")
    .where("approved", "==", true)
    .get();

  const tokensSet = new Set<string>();

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (data.disabled === true) return;
    if (data.notificationsDisabled === true) return;

    const tokens = Array.isArray(data.expoPushTokens)
      ? data.expoPushTokens
      : [];

    tokens.forEach((tok) => {
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
