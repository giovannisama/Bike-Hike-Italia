// functions/src/expoPush.ts
import * as functions from "firebase-functions";
import fetch from "node-fetch";
import { db } from "./firebaseAdmin";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_ACCESS_TOKEN =
  process.env.EXPO_ACCESS_TOKEN || functions.config().expo?.token || undefined;

export interface ExpoPushMessage {
  to: string | string[];
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
  sound?: string;
}

export interface ExpoPushResult {
  chunkSize: number;
  status: number;
  ok: boolean;
  responseText: string;
}

type ExpoPushTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?: string;
    [key: string]: unknown;
  };
};

type ExpoPushResponse = {
  data?: ExpoPushTicket[];
  errors?: Array<{
    code?: string;
    message?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

const CHUNK_SIZE = 100;

function normalizeTokens(to: string | string[]): string[] {
  const arr = Array.isArray(to) ? to : [to];
  return Array.from(
    new Set(
      arr.filter((tok) => typeof tok === "string" && tok.length > 0)
    )
  );
}

function makeHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (EXPO_ACCESS_TOKEN) {
    headers["Authorization"] = `Bearer ${EXPO_ACCESS_TOKEN}`;
  }
  return headers;
}

/**
 * Analizza la risposta di Expo per un chunk di token e:
 * - logga i risultati
 * - restituisce la lista dei token invalidi (DeviceNotRegistered, ecc.)
 */
function logExpoResponse(
  chunk: string[],
  status: number,
  rawText: string,
  parsed?: ExpoPushResponse
): string[] {
  if (!parsed) {
    console.log(
      `[expoPush] response (status ${status}) - non JSON: ${rawText.slice(
        0,
        500
      )}`
    );
    return [];
  }

  // Error globale
  if (parsed.errors && parsed.errors.length > 0) {
    console.error(
      `[expoPush] response has global errors (status ${status}):`,
      JSON.stringify(parsed.errors, null, 2)
    );
  }

  const tickets = parsed.data || [];
  if (!tickets.length) {
    console.log(
      `[expoPush] response (status ${status}) - no tickets, raw: ${rawText.slice(
        0,
        500
      )}`
    );
    return [];
  }

  let okCount = 0;
  let errorCount = 0;
  const invalidTokens: string[] = [];

  tickets.forEach((ticket, index) => {
    const token = chunk[index] || "(unknown token)";
    if (ticket.status === "ok") {
      okCount++;
      console.log(
        `[expoPush] ok for token ${token} (id: ${ticket.id || "no-id"})`
      );
    } else {
      errorCount++;
      const code = ticket.details?.error || "UnknownError";
      console.error(
        `[expoPush] error for token ${token} - code: ${code}, message: ${
          ticket.message || "no message"
        }`
      );

      // Token considerati non più validi da Expo/FCM
      if (
        code === "DeviceNotRegistered" ||
        code === "ExpoPushTokenNotRegistered" ||
        code === "InvalidCredentials"
      ) {
        invalidTokens.push(token);
      }
    }
  });

  console.log(
    `[expoPush] summary for chunk: ${okCount} ok, ${errorCount} error(s) (status ${status})`
  );

  if (invalidTokens.length > 0) {
    console.warn(
      "[expoPush] invalid tokens in this chunk:",
      JSON.stringify(invalidTokens)
    );
  }

  return invalidTokens;
}

/**
 * Rimuove i token invalidi dall'array users/{uid}.expoPushTokens
 * per tutti gli utenti che li contengono.
 */
async function removeInvalidTokensFromUsers(tokensToRemove: string[]): Promise<void> {
  const unique = Array.from(new Set(tokensToRemove));

  console.log(
    "[expoPush] removeInvalidTokensFromUsers - tokensToRemove:",
    JSON.stringify(unique)
  );

  if (!unique.length) return;

  for (const tok of unique) {
    try {
      console.log(`[expoPush] cleanup: cerco utenti con token ${tok}`);
      const snap = await db
        .collection("users")
        .where("expoPushTokens", "array-contains", tok)
        .get();

      if (snap.empty) {
        console.log(
          `[expoPush] cleanup: nessun utente trovato per token ${tok}`
        );
        continue;
      }

      const batch = db.batch();

      snap.docs.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const tokens = Array.isArray((data as any).expoPushTokens)
          ? (data as any).expoPushTokens as string[]
          : [];
        const filtered = tokens.filter((t) => t !== tok);

        console.log(
          `[expoPush] cleanup: rimuovo token ${tok} da user ${docSnap.id} (prima=${tokens.length}, dopo=${filtered.length})`
        );

        batch.update(docSnap.ref, { expoPushTokens: filtered });
      });

      await batch.commit();
      console.log(
        `[expoPush] cleanup: completata rimozione token ${tok} da ${snap.size} utente/i`
      );
    } catch (err) {
      console.error(
        `[expoPush] cleanup: errore rimuovendo token ${tok} dai profili utente:`,
        err
      );
    }
  }
}

export async function sendExpoPushNotification(
  message: ExpoPushMessage
): Promise<ExpoPushResult[]> {
  const tokens = normalizeTokens(message.to);
  if (!tokens.length) {
    console.warn("[expoPush] no tokens to send");
    return [];
  }

  const headers = makeHeaders();
  const results: ExpoPushResult[] = [];
  let allInvalidTokens: string[] = [];

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
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      let parsed: ExpoPushResponse | undefined;

      try {
        parsed = JSON.parse(text) as ExpoPushResponse;
      } catch {
        parsed = undefined;
      }

      const chunkResult: ExpoPushResult = {
        chunkSize: chunk.length,
        status: response.status,
        ok: response.ok,
        responseText: text,
      };

      if (response.ok) {
        const invalidFromChunk = logExpoResponse(
          chunk,
          response.status,
          text,
          parsed
        );
        if (invalidFromChunk && invalidFromChunk.length > 0) {
          allInvalidTokens = allInvalidTokens.concat(invalidFromChunk);
        }
      } else {
        console.error(
          `[expoPush] HTTP error for chunk (status ${response.status}); raw response: ${text.slice(
            0,
            500
          )}`
        );
        if (parsed) {
          const invalidFromChunk = logExpoResponse(
            chunk,
            response.status,
            text,
            parsed
          );
          if (invalidFromChunk && invalidFromChunk.length > 0) {
            allInvalidTokens = allInvalidTokens.concat(invalidFromChunk);
          }
        }
      }

      results.push(chunkResult);
    } catch (error) {
      console.error("[expoPush] request error", error);
      results.push({
        chunkSize: chunk.length,
        status: 0,
        ok: false,
        responseText: String(error),
      });
    }
  }

  if (allInvalidTokens.length > 0) {
    console.warn(
      "[expoPush] invalid tokens detected across all chunks:",
      JSON.stringify(allInvalidTokens)
    );
    try {
      await removeInvalidTokensFromUsers(allInvalidTokens);
    } catch (err) {
      console.error(
        "[expoPush] errore durante la pulizia dei token invalidi:",
        err
      );
    }
  }

  return results;
}