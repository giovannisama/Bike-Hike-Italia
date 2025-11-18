import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { sendExpoPushNotification } from "./expoPush";
import { fetchApprovedExpoTokens } from "./userTokens";

if (!admin.apps.length) {
  admin.initializeApp();
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
      await fetchApprovedExpoTokens();
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

    functions.logger.info(
      `[onRideCreated] ${rideId} sending push to ${recipients.length} tokens`
    );

    const body = dateLabel
      ? `È stata pubblicata una nuova uscita: ${title} (${dateLabel})`
      : `È stata pubblicata una nuova uscita: ${title}`;

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

// ------------------------------------------
// 3) HTTP endpoint di test: sendTestPush
// ------------------------------------------
export const sendTestPush = functions.https.onRequest(async (req, res) => {
  // CORS base per poter chiamare anche da browser se serve
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
