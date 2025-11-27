"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchApprovedExpoTokens = fetchApprovedExpoTokens;
exports.fetchOwnerExpoTokens = fetchOwnerExpoTokens;
exports.fetchApprovedExpoTokensForBoardPost = fetchApprovedExpoTokensForBoardPost;
const firebaseAdmin_1 = require("./firebaseAdmin");
async function fetchApprovedExpoTokens(options) {
    const snapshot = await firebaseAdmin_1.db
        .collection("users")
        .where("approved", "==", true)
        .get();
    const tokensSet = new Set();
    const eventFlagField = options?.eventFlagField;
    snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        // Utente disabilitato o notifiche globalmente disabilitate
        if (data.disabled === true)
            return;
        if (data.notificationsDisabled === true)
            return;
        // Se è specificato un flag per evento, escludiamo chi ha disattivato quel tipo
        if (eventFlagField && (data[eventFlagField] === true))
            return;
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
async function fetchOwnerExpoTokens(options) {
    const snapshot = await firebaseAdmin_1.db
        .collection("users")
        .where("role", "==", "owner")
        .get();
    const tokensSet = new Set();
    const eventFlagField = options?.eventFlagField;
    snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        // Owner disabilitato o notifiche globalmente disabilitate
        if (data.disabled === true)
            return;
        if (data.notificationsDisabled === true)
            return;
        // Se è specificato un flag per evento, escludiamo chi ha disattivato quel tipo
        if (eventFlagField && (data[eventFlagField] === true))
            return;
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
        roleUsersCount: snapshot.docs.length,
        tokens: Array.from(tokensSet),
    };
}
// Variante dedicata per le notifiche BoardPost (Bacheca)
async function fetchApprovedExpoTokensForBoardPost() {
    return fetchApprovedExpoTokens({
        eventFlagField: "notificationsDisabledForBoardPost",
    });
}
