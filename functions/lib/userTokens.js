"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchApprovedExpoTokens = fetchApprovedExpoTokens;
const firebaseAdmin_1 = require("./firebaseAdmin");
async function fetchApprovedExpoTokens() {
    const snapshot = await firebaseAdmin_1.db
        .collection("users")
        .where("approved", "==", true)
        .get();
    const tokensSet = new Set();
    snapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data.disabled === true)
            return;
        if (data.notificationsDisabled === true)
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
