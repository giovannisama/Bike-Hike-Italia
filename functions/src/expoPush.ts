import * as functions from "firebase-functions";
import fetch from "node-fetch";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_ACCESS_TOKEN =
  process.env.EXPO_ACCESS_TOKEN || functions.config().expo?.token || undefined;

export interface ExpoPushMessage {
  to: string | string[];
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
  sound?: string;
  channelId?: string; // opzionale: se non passato, usiamo "default"
}

export interface ExpoPushResult {
  chunkSize: number;
  status: number;
  ok: boolean;
  responseText: string;
}

const CHUNK_SIZE = 100;

function normalizeTokens(to: string | string[]): string[] {
  const arr = Array.isArray(to) ? to : [to];
  return Array.from(
    new Set(
      arr.filter((tok) => typeof tok === "string" && tok.length > 0)
    )
  );
}

function makeHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (EXPO_ACCESS_TOKEN) {
    headers["Authorization"] = `Bearer ${EXPO_ACCESS_TOKEN}`;
  }
  return headers;
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

function logExpoResponse(
  chunk: string[],
  status: number,
  rawText: string,
  parsed?: ExpoPushResponse
) {
  if (!parsed) {
    console.log(
      `[expoPush] response (status ${status}) - non JSON: ${rawText.slice(
        0,
        500
      )}`
    );
    return;
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
    return;
  }

  let okCount = 0;
  let errorCount = 0;

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
    }
  });

  console.log(
    `[expoPush] summary for chunk: ${okCount} ok, ${errorCount} error(s) (status ${status})`
  );
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

  for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
    const chunk = tokens.slice(i, i + CHUNK_SIZE);

    const payload = chunk.map((to) => ({
      to,
      title: message.title,
      body: message.body,
      data: message.data || undefined,
      sound: message.sound || "default",
      channelId: message.channelId || "default", // 👈 canale impostato
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
        logExpoResponse(chunk, response.status, text, parsed);
      } else {
        console.error(
          `[expoPush] HTTP error for chunk (status ${response.status}); raw response: ${text.slice(
            0,
            500
          )}`
        );
        if (parsed) {
          logExpoResponse(chunk, response.status, text, parsed);
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

  return results;
}