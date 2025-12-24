import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { sendExpoPushNotification } from "./expoPush";
import {
  fetchApprovedExpoTokens,
  fetchOwnerExpoTokens,
  fetchApprovedExpoTokensForBoardPost,
} from "./userTokens";

if (!admin.apps.length) {
  admin.initializeApp();
}

// -----------------------------
// Helpers: participants count
// -----------------------------
async function updateParticipantsCountsWithDelta(rideId: string, delta: number) {
  const db = admin.firestore();
  const rideRef = db.doc(`rides/${rideId}`);

  await db.runTransaction(async (tx) => {
    const rideSnap = await tx.get(rideRef);
    if (!rideSnap.exists) {
      functions.logger.info(`[participantsCount] ride missing: ${rideId}`);
      return;
    }

    const rideData = rideSnap.data() || {};
    const manualCount = Array.isArray(rideData.manualParticipants)
      ? rideData.manualParticipants.length
      : 0;

    const baseSelf =
      typeof rideData.participantsCountSelf === "number"
        ? rideData.participantsCountSelf
        : typeof rideData.participantsCountTotal === "number"
          ? rideData.participantsCountTotal - manualCount
          : typeof rideData.participantsCount === "number"
            ? rideData.participantsCount - manualCount
            : 0;

    const nextSelf = Math.max(baseSelf + delta, 0);
    const total = nextSelf + manualCount;

    tx.update(rideRef, {
      participantsCountSelf: nextSelf,
      participantsCountTotal: total,
    });

    functions.logger.info(
      `[participantsCount] ride=${rideId} delta=${delta} self=${nextSelf} manual=${manualCount} total=${total}`
    );
  });
}

async function refreshParticipantsTotalForManualChange(rideId: string) {
  const db = admin.firestore();
  const rideRef = db.doc(`rides/${rideId}`);

  await db.runTransaction(async (tx) => {
    const rideSnap = await tx.get(rideRef);
    if (!rideSnap.exists) {
      functions.logger.info(`[participantsCount] ride missing: ${rideId}`);
      return;
    }

    const rideData = rideSnap.data() || {};
    const manualCount = Array.isArray(rideData.manualParticipants)
      ? rideData.manualParticipants.length
      : 0;

    const baseSelf =
      typeof rideData.participantsCountSelf === "number"
        ? rideData.participantsCountSelf
        : typeof rideData.participantsCountTotal === "number"
          ? rideData.participantsCountTotal - manualCount
          : typeof rideData.participantsCount === "number"
            ? rideData.participantsCount - manualCount
            : 0;

    const nextSelf = Math.max(baseSelf, 0);
    const total = nextSelf + manualCount;

    tx.update(rideRef, {
      participantsCountSelf: nextSelf,
      participantsCountTotal: total,
    });

    functions.logger.info(
      `[participantsCount] ride=${rideId} manual=${manualCount} total=${total}`
    );
  });
}

// --------------------
// 1) Health check HTTP
// --------------------
export const healthCheck = functions.https.onRequest((req, res) => {
  res.status(200).send("Functions ready");
});

// -----------------------------
// 2) Trigger su nuova "ride"
// -----------------------------
export const onRideCreated = functions.firestore
  .document("rides/{rideId}")
  .onCreate(async (snapshot, context) => {
    const rideId = context.params.rideId;
    const data = snapshot.data();
    const manualCount = Array.isArray(data?.manualParticipants)
      ? data.manualParticipants.length
      : 0;
    try {
      await snapshot.ref.update({
        participantsCountSelf: 0,
        participantsCountTotal: manualCount,
      });
    } catch (err) {
      functions.logger.error(`[participantsCount] init failed ride=${rideId}`, err);
    }
    const title =
      typeof data?.title === "string" && data.title.trim().length > 0
        ? data.title
        : "Uscita";

    const dateValue = data?.dateTime ?? data?.date;
    let dateLabel: string | null = null;
    if (dateValue?.toDate) {
      try {
        dateLabel = dateValue.toDate().toLocaleDateString("it-IT", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
      } catch {
        dateLabel = null;
      }
    }

    const { tokens: recipients, approvedUsersCount } =
      await fetchApprovedExpoTokens({
        eventFlagField: "notificationsDisabledForCreatedRide",
      });

    functions.logger.info(
      `[onRideCreated] ${rideId} approved users=${approvedUsersCount}`
    );
    functions.logger.info(
      `[onRideCreated] ${rideId} tokens collected=${recipients.length}`
    );

    if (!recipients.length) {
      functions.logger.info(`[onRideCreated] ${rideId} no recipients`);
      return;
    }

    const body = dateLabel
      ? `È stata pubblicata una nuova uscita: ${title} (${dateLabel})`
      : `È stata pubblicata una nuova uscita: ${title}`;

    functions.logger.info(
      `[onRideCreated] ${rideId} sending push to ${recipients.length} tokens`
    );

    const results = await sendExpoPushNotification({
      to: recipients,
      title: "Nuova uscita disponibile",
      body,
      data: { type: "ride", rideId },
    });

    results.forEach((result, index) => {
      functions.logger.info(
        `[onRideCreated] ${rideId} chunk ${index} status=${result.status} ok=${result.ok}`
      );
    });
  });

// -----------------------------
// 3) Trigger su aggiornamento ride (cancellazione)
// -----------------------------
export const onRideUpdated = functions.firestore
  .document("rides/{rideId}")
  .onUpdate(async (change, context) => {
    const rideId = context.params.rideId;
    const before = change.before.data();
    const after = change.after.data();

    if (!before || !after) {
      functions.logger.info(`[onRideUpdated] ${rideId} missing snapshot data`);
      return;
    }

    const prevStatus = typeof before.status === "string" ? before.status : "active";
    const nextStatus = typeof after.status === "string" ? after.status : "active";

    // Trigger solo quando lo stato passa a "cancelled"
    if (prevStatus === "cancelled" || nextStatus !== "cancelled") {
      return;
    }

    const title =
      typeof after.title === "string" && after.title.trim().length > 0
        ? after.title
        : null;

    const body = title
      ? `L'uscita "${title}" è stata annullata.`
      : "Un'uscita è stata annullata.";

    const { tokens: recipients, approvedUsersCount } =
      await fetchApprovedExpoTokens({
        eventFlagField: "notificationsDisabledForCancelledRide",
      });

    functions.logger.info(
      `[onRideUpdated] ${rideId} cancellation approved users=${approvedUsersCount}`
    );
    functions.logger.info(
      `[onRideUpdated] ${rideId} cancellation tokens collected=${recipients.length}`
    );

    if (!recipients.length) {
      functions.logger.info(`[onRideUpdated] ${rideId} cancellation no recipients`);
      return;
    }

    const results = await sendExpoPushNotification({
      to: recipients,
      title: "Uscita annullata",
      body,
      data: { type: "rideCancelled", rideId },
    });

    results.forEach((result, index) => {
      functions.logger.info(
        `[onRideUpdated] ${rideId} cancel chunk ${index} status=${result.status} ok=${result.ok}`
      );
    });
  });

// -----------------------------
// 3b) Trigger su partecipanti (conteggio)
// -----------------------------
export const onParticipantWrite = functions.firestore
  .document("rides/{rideId}/participants/{uid}")
  .onWrite(async (change, context) => {
    const rideId = context.params.rideId as string;
    const beforeExists = change.before.exists;
    const afterExists = change.after.exists;
    const delta = !beforeExists && afterExists ? 1 : beforeExists && !afterExists ? -1 : 0;
    if (delta === 0) return;
    try {
      await updateParticipantsCountsWithDelta(rideId, delta);
    } catch (err) {
      functions.logger.error(`[participantsCount] write failed ride=${rideId}`, err);
    }
  });

export const onRideManualParticipantsUpdated = functions.firestore
  .document("rides/{rideId}")
  .onUpdate(async (change, context) => {
    const rideId = context.params.rideId as string;
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const beforeCount = Array.isArray(before.manualParticipants)
      ? before.manualParticipants.length
      : 0;
    const afterCount = Array.isArray(after.manualParticipants)
      ? after.manualParticipants.length
      : 0;
    if (beforeCount === afterCount) return;
    try {
      await refreshParticipantsTotalForManualChange(rideId);
    } catch (err) {
      functions.logger.error(`[participantsCount] manual update failed ride=${rideId}`, err);
    }
  });

// -----------------------------
// 4) Trigger su nuovo utente
// -----------------------------
export const onUserCreated = functions.firestore
  .document("users/{uid}")
  .onCreate(async (snapshot, context) => {
    const uid = context.params.uid as string;
    const data = snapshot.data() as any;
    if (!data) {
      functions.logger.info(`[onUserCreated] ${uid} missing data`);
      return;
    }

    if (data.disabled === true) return;
    if (data.approved !== false) return;

    const roleRaw =
      typeof data.role === "string" ? data.role.toLowerCase() : "member";
    // Non notifichiamo se è già owner/admin
    if (roleRaw === "owner" || roleRaw === "admin") return;

    const displayName =
      data.displayName ||
      [data.firstName, data.lastName].filter(Boolean).join(" ") ||
      data.email ||
      uid;

    const body = `Un nuovo utente è in attesa di approvazione: ${displayName}.`;

    const { tokens: ownerTokens, roleUsersCount: ownerUsersCount } =
      await fetchOwnerExpoTokens({
        eventFlagField: "notificationsDisabledForPendingUser",
      });

    functions.logger.info(
      `[onUserCreated] new pending user=${uid} owners=${ownerUsersCount} tokens=${ownerTokens.length}`
    );

    if (!ownerTokens.length) {
      functions.logger.info(`[onUserCreated] ${uid} no owner tokens`);
      return;
    }

    const results = await sendExpoPushNotification({
      to: ownerTokens,
      title: "Nuova registrazione in attesa",
      body,
      data: { type: "pendingUser", uid },
    });

    functions.logger.info(
      `[onUserCreated] pending profile=${uid} displayName=${displayName}`
    );

    results.forEach((result, index) =>
      functions.logger.info(
        `[onUserCreated] ${uid} chunk ${index} status=${result.status} ok=${result.ok}`
      )
    );
  });

// -----------------------------
// 6) Trigger su nuova news in Bacheca
// -----------------------------
export const onBoardPostCreated = functions.firestore
  .document("boardPosts/{postId}")
  .onCreate(async (snap, context) => {
    const data = snap.data() || {};
    const postId = snap.id;

    const title = "Nuova news in bacheca";
    const body =
      typeof data.title === "string" && data.title.trim().length > 0
        ? data.title.trim()
        : "Apri l'app per leggere la nuova comunicazione";

    const { tokens, approvedUsersCount } = await fetchApprovedExpoTokensForBoardPost();

    functions.logger.info(
      `[onBoardPostCreated] ${postId} approved users=${approvedUsersCount} tokens=${tokens.length}`
    );

    if (!tokens.length) {
      functions.logger.info(`[onBoardPostCreated] ${postId} no recipients`);
      return;
    }

    const results = await sendExpoPushNotification({
      to: tokens,
      title,
      body,
      data: { type: "boardPost", postId },
    });

    results.forEach((result, index) => {
      functions.logger.info(
        `[onBoardPostCreated] ${postId} chunk ${index} status=${result.status} ok=${result.ok}`
      );
    });
  });

// ------------------------------------------
// 5) HTTP endpoint di test: sendTestPush
// ------------------------------------------
export const sendTestPush = functions.https.onRequest(async (req, res) => {
  // CORS base per poter chiamare anche da browser if serve
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Only POST allowed" });
    return;
  }

  try {
    const { to, title, body, data, sound } = req.body || {};

    if (!to || !title || !body) {
      res.status(400).json({
        error: "Missing required fields: 'to', 'title', 'body'",
      });
      return;
    }

    functions.logger.info("[sendTestPush] request body", {
      to,
      title,
      body,
      data,
      sound,
    });

    const results = await sendExpoPushNotification({
      to,
      title,
      body,
      data: data ?? null,
      sound: sound ?? "default",
    });

    functions.logger.info("[sendTestPush] push results", {
      chunkCount: results.length,
      results,
    });

    res.status(200).json({
      ok: true,
      message: "Test push sent (check Functions logs for details)",
    });
  } catch (error) {
    functions.logger.error("[sendTestPush] error sending push", error);
    res.status(500).json({
      ok: false,
      error: "Internal error sending push",
    });
  }
});
