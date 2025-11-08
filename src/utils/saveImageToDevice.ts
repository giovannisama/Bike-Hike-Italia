import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";

type SaveImageToDeviceOptions = {
  base64?: string | null;
  uri?: string | null;
  mimeType?: string | null;
  suggestedFileName?: string;
};

const DEFAULT_FILENAME = "documento-bike-and-hike";

async function ensureMediaLibraryPermission() {
  const current = await MediaLibrary.getPermissionsAsync();
  if (current.granted) return;

  const request = await MediaLibrary.requestPermissionsAsync();
  if (!request.granted) {
    throw new Error("Per salvare il file devi consentire l'accesso alla libreria foto.");
  }
}

function extractFromDataUri(uri: string | null | undefined) {
  if (!uri || !uri.startsWith("data:")) return { mime: null, base64: null };
  const match = uri.match(/^data:(.*?);base64,(.*)$/);
  if (!match) return { mime: null, base64: null };
  const [, mime, data] = match;
  return { mime: mime || null, base64: data || null };
}

export async function saveImageToDevice({
  base64,
  uri,
  mimeType,
  suggestedFileName,
}: SaveImageToDeviceOptions): Promise<void> {
  if (!base64 && !uri) {
    throw new Error("Nessuna immagine disponibile da salvare.");
  }

  await ensureMediaLibraryPermission();

  let workingUri: string | null = null;
  let cleanupPath: string | null = null;
  let effectiveMime = mimeType ?? null;

  if (!base64 && uri?.startsWith("data:")) {
    const parsed = extractFromDataUri(uri);
    base64 = parsed.base64;
    effectiveMime = effectiveMime ?? parsed.mime;
  }

  if (base64) {
    const extension = effectiveMime === "image/png" ? "png" : "jpg";
    const fileName = `${suggestedFileName || DEFAULT_FILENAME}-${Date.now()}.${extension}`;
    const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!cacheDir) {
      throw new Error("Impossibile trovare una cartella temporanea sul dispositivo.");
    }
    workingUri = `${cacheDir}${fileName}`;
    cleanupPath = workingUri;
    await FileSystem.writeAsStringAsync(workingUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } else if (uri) {
    workingUri = uri;
  }

  if (!workingUri) {
    throw new Error("Impossibile preparare il file per il download.");
  }

  try {
    await MediaLibrary.saveToLibraryAsync(workingUri);
  } finally {
    if (cleanupPath) {
      await FileSystem.deleteAsync(cleanupPath, { idempotent: true }).catch(() => undefined);
    }
  }
}
