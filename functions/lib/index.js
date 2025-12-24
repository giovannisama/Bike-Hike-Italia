"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTestPush = exports.onBoardPostCreated = exports.onUserCreated = exports.backfillParticipantsCounts = exports.onRideManualParticipantsUpdated = exports.onParticipantWrite = exports.onRideUpdated = exports.onRideCreated = exports.healthCheck = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const expoPush_1 = require("./expoPush");
const userTokens_1 = require("./userTokens");
if (!admin.apps.length) {
    admin.initializeApp();
}
// -----------------------------
// Helpers: participants count
// -----------------------------
async function getParticipantsCount(rideRef) {
    const colRef = rideRef.collection("participants");
    if (typeof colRef.count === "function") {
        const snap = await colRef.count().get();
        return snap.data().count;
    }
    const snap = await colRef.get();
    return snap.size;
}
async function updateParticipantsCountsWithDelta(rideId, delta) {
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
        const baseSelf = typeof rideData.participantsCountSelf === "number"
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
        functions.logger.info(`[participantsCount] ride=${rideId} delta=${delta} self=${nextSelf} manual=${manualCount} total=${total}`);
    });
}
async function reconcileParticipantsCounts(rideId) {
    const db = admin.firestore();
    const rideRef = db.doc(`rides/${rideId}`);
    const selfCount = await getParticipantsCount(rideRef);
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
        const total = selfCount + manualCount;
        tx.update(rideRef, {
            participantsCountSelf: selfCount,
            participantsCountTotal: total,
        });
    });
}
async function refreshParticipantsTotalForManualChange(rideId) {
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
        const baseSelf = typeof rideData.participantsCountSelf === "number"
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
        functions.logger.info(`[participantsCount] ride=${rideId} manual=${manualCount} total=${total}`);
    });
}
// --------------------
// 1) Health check HTTP
// --------------------
exports.healthCheck = functions.https.onRequest((req, res) => {
    res.status(200).send("Functions ready");
});
// -----------------------------
// 2) Trigger su nuova "ride"
// -----------------------------
exports.onRideCreated = functions.firestore
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
    }
    catch (err) {
        functions.logger.error(`[participantsCount] init failed ride=${rideId}`, err);
    }
    const title = typeof data?.title === "string" && data.title.trim().length > 0
        ? data.title
        : "Uscita";
    const dateValue = data?.dateTime ?? data?.date;
    let dateLabel = null;
    if (dateValue?.toDate) {
        try {
            dateLabel = dateValue.toDate().toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
            });
        }
        catch {
            dateLabel = null;
        }
    }
    const { tokens: recipients, approvedUsersCount } = await (0, userTokens_1.fetchApprovedExpoTokens)({
        eventFlagField: "notificationsDisabledForCreatedRide",
    });
    functions.logger.info(`[onRideCreated] ${rideId} approved users=${approvedUsersCount}`);
    functions.logger.info(`[onRideCreated] ${rideId} tokens collected=${recipients.length}`);
    if (!recipients.length) {
        functions.logger.info(`[onRideCreated] ${rideId} no recipients`);
        return;
    }
    const body = dateLabel
        ? `È stata pubblicata una nuova uscita: ${title} (${dateLabel})`
        : `È stata pubblicata una nuova uscita: ${title}`;
    functions.logger.info(`[onRideCreated] ${rideId} sending push to ${recipients.length} tokens`);
    const results = await (0, expoPush_1.sendExpoPushNotification)({
        to: recipients,
        title: "Nuova uscita disponibile",
        body,
        data: { type: "ride", rideId },
    });
    results.forEach((result, index) => {
        functions.logger.info(`[onRideCreated] ${rideId} chunk ${index} status=${result.status} ok=${result.ok}`);
    });
});
// -----------------------------
// 3) Trigger su aggiornamento ride (cancellazione)
// -----------------------------
exports.onRideUpdated = functions.firestore
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
    const title = typeof after.title === "string" && after.title.trim().length > 0
        ? after.title
        : null;
    const body = title
        ? `L'uscita "${title}" è stata annullata.`
        : "Un'uscita è stata annullata.";
    const { tokens: recipients, approvedUsersCount } = await (0, userTokens_1.fetchApprovedExpoTokens)({
        eventFlagField: "notificationsDisabledForCancelledRide",
    });
    functions.logger.info(`[onRideUpdated] ${rideId} cancellation approved users=${approvedUsersCount}`);
    functions.logger.info(`[onRideUpdated] ${rideId} cancellation tokens collected=${recipients.length}`);
    if (!recipients.length) {
        functions.logger.info(`[onRideUpdated] ${rideId} cancellation no recipients`);
        return;
    }
    const results = await (0, expoPush_1.sendExpoPushNotification)({
        to: recipients,
        title: "Uscita annullata",
        body,
        data: { type: "rideCancelled", rideId },
    });
    results.forEach((result, index) => {
        functions.logger.info(`[onRideUpdated] ${rideId} cancel chunk ${index} status=${result.status} ok=${result.ok}`);
    });
});
// -----------------------------
// 3b) Trigger su partecipanti (conteggio)
// -----------------------------
exports.onParticipantWrite = functions.firestore
    .document("rides/{rideId}/participants/{uid}")
    .onWrite(async (change, context) => {
    const rideId = context.params.rideId;
    const beforeExists = change.before.exists;
    const afterExists = change.after.exists;
    const delta = !beforeExists && afterExists ? 1 : beforeExists && !afterExists ? -1 : 0;
    try {
        if (delta !== 0) {
            await updateParticipantsCountsWithDelta(rideId, delta);
        }
        await reconcileParticipantsCounts(rideId);
    }
    catch (err) {
        functions.logger.error(`[participantsCount] write failed ride=${rideId}`, err);
    }
});
exports.onRideManualParticipantsUpdated = functions.firestore
    .document("rides/{rideId}")
    .onUpdate(async (change, context) => {
    const rideId = context.params.rideId;
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const beforeCount = Array.isArray(before.manualParticipants)
        ? before.manualParticipants.length
        : 0;
    const afterCount = Array.isArray(after.manualParticipants)
        ? after.manualParticipants.length
        : 0;
    if (beforeCount === afterCount)
        return;
    try {
        await refreshParticipantsTotalForManualChange(rideId);
    }
    catch (err) {
        functions.logger.error(`[participantsCount] manual update failed ride=${rideId}`, err);
    }
});
// -----------------------------
// 3c) Backfill participants counts (admin-only)
// -----------------------------
exports.backfillParticipantsCounts = functions.https.onRequest(async (req, res) => {
    // ONE-SHOT endpoint disabled after stabilization (2025-12-24).
    res.status(410).json({ error: "gone" });
    return;
    // Backfill logic intentionally disabled.
});
// -----------------------------
// 4) Trigger su nuovo utente
// -----------------------------
exports.onUserCreated = functions.firestore
    .document("users/{uid}")
    .onCreate(async (snapshot, context) => {
    const uid = context.params.uid;
    const data = snapshot.data();
    if (!data) {
        functions.logger.info(`[onUserCreated] ${uid} missing data`);
        return;
    }
    if (data.disabled === true)
        return;
    if (data.approved !== false)
        return;
    const roleRaw = typeof data.role === "string" ? data.role.toLowerCase() : "member";
    // Non notifichiamo se è già owner/admin
    if (roleRaw === "owner" || roleRaw === "admin")
        return;
    const displayName = data.displayName ||
        [data.firstName, data.lastName].filter(Boolean).join(" ") ||
        data.email ||
        uid;
    const body = `Un nuovo utente è in attesa di approvazione: ${displayName}.`;
    const { tokens: ownerTokens, roleUsersCount: ownerUsersCount } = await (0, userTokens_1.fetchOwnerExpoTokens)({
        eventFlagField: "notificationsDisabledForPendingUser",
    });
    functions.logger.info(`[onUserCreated] new pending user=${uid} owners=${ownerUsersCount} tokens=${ownerTokens.length}`);
    if (!ownerTokens.length) {
        functions.logger.info(`[onUserCreated] ${uid} no owner tokens`);
        return;
    }
    const results = await (0, expoPush_1.sendExpoPushNotification)({
        to: ownerTokens,
        title: "Nuova registrazione in attesa",
        body,
        data: { type: "pendingUser", uid },
    });
    functions.logger.info(`[onUserCreated] pending profile=${uid} displayName=${displayName}`);
    results.forEach((result, index) => functions.logger.info(`[onUserCreated] ${uid} chunk ${index} status=${result.status} ok=${result.ok}`));
});
// -----------------------------
// 6) Trigger su nuova news in Bacheca
// -----------------------------
exports.onBoardPostCreated = functions.firestore
    .document("boardPosts/{postId}")
    .onCreate(async (snap, context) => {
    const data = snap.data() || {};
    const postId = snap.id;
    const title = "Nuova news in bacheca";
    const body = typeof data.title === "string" && data.title.trim().length > 0
        ? data.title.trim()
        : "Apri l'app per leggere la nuova comunicazione";
    const { tokens, approvedUsersCount } = await (0, userTokens_1.fetchApprovedExpoTokensForBoardPost)();
    functions.logger.info(`[onBoardPostCreated] ${postId} approved users=${approvedUsersCount} tokens=${tokens.length}`);
    if (!tokens.length) {
        functions.logger.info(`[onBoardPostCreated] ${postId} no recipients`);
        return;
    }
    const results = await (0, expoPush_1.sendExpoPushNotification)({
        to: tokens,
        title,
        body,
        data: { type: "boardPost", postId },
    });
    results.forEach((result, index) => {
        functions.logger.info(`[onBoardPostCreated] ${postId} chunk ${index} status=${result.status} ok=${result.ok}`);
    });
});
// ------------------------------------------
// 5) HTTP endpoint di test: sendTestPush
// ------------------------------------------
exports.sendTestPush = functions.https.onRequest(async (req, res) => {
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
        const results = await (0, expoPush_1.sendExpoPushNotification)({
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
    }
    catch (error) {
        functions.logger.error("[sendTestPush] error sending push", error);
        res.status(500).json({
            ok: false,
            error: "Internal error sending push",
        });
    }
});
