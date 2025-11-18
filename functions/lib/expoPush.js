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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendExpoPushNotification = sendExpoPushNotification;
const functions = __importStar(require("firebase-functions"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_ACCESS_TOKEN = process.env.EXPO_ACCESS_TOKEN || functions.config().expo?.token || undefined;
const CHUNK_SIZE = 100;
function normalizeTokens(to) {
    const arr = Array.isArray(to) ? to : [to];
    return Array.from(new Set(arr.filter((tok) => typeof tok === "string" && tok.length > 0)));
}
function makeHeaders() {
    const headers = {
        Accept: "application/json",
        "Content-Type": "application/json",
    };
    if (EXPO_ACCESS_TOKEN) {
        headers["Authorization"] = `Bearer ${EXPO_ACCESS_TOKEN}`;
    }
    return headers;
}
function logExpoResponse(chunk, status, rawText, parsed) {
    if (!parsed) {
        console.log(`[expoPush] response (status ${status}) - non JSON: ${rawText.slice(0, 500)}`);
        return;
    }
    // Error globale
    if (parsed.errors && parsed.errors.length > 0) {
        console.error(`[expoPush] response has global errors (status ${status}):`, JSON.stringify(parsed.errors, null, 2));
    }
    const tickets = parsed.data || [];
    if (!tickets.length) {
        console.log(`[expoPush] response (status ${status}) - no tickets, raw: ${rawText.slice(0, 500)}`);
        return;
    }
    let okCount = 0;
    let errorCount = 0;
    tickets.forEach((ticket, index) => {
        const token = chunk[index] || "(unknown token)";
        if (ticket.status === "ok") {
            okCount++;
            console.log(`[expoPush] ok for token ${token} (id: ${ticket.id || "no-id"})`);
        }
        else {
            errorCount++;
            const code = ticket.details?.error || "UnknownError";
            console.error(`[expoPush] error for token ${token} - code: ${code}, message: ${ticket.message || "no message"}`);
        }
    });
    console.log(`[expoPush] summary for chunk: ${okCount} ok, ${errorCount} error(s) (status ${status})`);
}
async function sendExpoPushNotification(message) {
    const tokens = normalizeTokens(message.to);
    if (!tokens.length) {
        console.warn("[expoPush] no tokens to send");
        return [];
    }
    const headers = makeHeaders();
    const results = [];
    for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
        const chunk = tokens.slice(i, i + CHUNK_SIZE);
        const payload = chunk.map((to) => ({
            to,
            title: message.title,
            body: message.body,
            data: message.data || undefined,
            sound: message.sound || "default",
        }));
        try {
            const response = await (0, node_fetch_1.default)(EXPO_PUSH_URL, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
            });
            const text = await response.text();
            let parsed;
            try {
                parsed = JSON.parse(text);
            }
            catch {
                parsed = undefined;
            }
            const chunkResult = {
                chunkSize: chunk.length,
                status: response.status,
                ok: response.ok,
                responseText: text,
            };
            if (response.ok) {
                logExpoResponse(chunk, response.status, text, parsed);
            }
            else {
                console.error(`[expoPush] HTTP error for chunk (status ${response.status}); raw response: ${text.slice(0, 500)}`);
                if (parsed) {
                    logExpoResponse(chunk, response.status, text, parsed);
                }
            }
            results.push(chunkResult);
        }
        catch (error) {
            console.error("[expoPush] request error", error);
            results.push({
                chunkSize: chunk.length,
                status: 0,
                ok: false,
                responseText: String(error),
            });
        }
    }
    return results;
}
