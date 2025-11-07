import * as ImageManipulator from "expo-image-manipulator";

type CompressParams = {
  uri: string;
  mimeType: "image/jpeg" | "image/png";
  maxSizeBytes?: number;
  initialWidth?: number | null;
  initialHeight?: number | null;
};

export type CompressedImage = {
  uri: string;
  mimeType: "image/jpeg" | "image/png";
  size: number;
  width?: number | null;
  height?: number | null;
  base64: string;
};

export type AutoCropRequest = {
  uri: string;
  width?: number | null;
  height?: number | null;
  formatHint?: ImageManipulator.SaveFormat;
};

export type AutoCropResult = {
  uri: string;
  width?: number | null;
  height?: number | null;
  base64?: string | null;
};

const estimateBase64Size = (base64?: string | null) => {
  if (!base64) return 0;
  const padding = (base64.match(/=*$/)?.[0]?.length ?? 0);
  return Math.ceil((base64.length * 3) / 4) - padding;
};

export async function compressImageToMaxSize({
  uri,
  mimeType,
  maxSizeBytes = 1_000_000,
  initialWidth,
  initialHeight,
}: CompressParams): Promise<CompressedImage> {
  const targetFormat =
    mimeType === "image/png" ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG;
  let currentFormat = targetFormat;
  let quality = currentFormat === ImageManipulator.SaveFormat.PNG ? 1 : 0.92;
  let iteration = 0;

  const runCompression = async () => {
    return ImageManipulator.manipulateAsync(
      uri,
      [],
      {
        compress: currentFormat === ImageManipulator.SaveFormat.PNG ? undefined : quality,
        format: currentFormat,
        base64: true,
      }
    );
  };

  let result = await runCompression();
  let size = estimateBase64Size(result.base64);

  while (size > maxSizeBytes && iteration < 6) {
    iteration += 1;
    if (currentFormat === ImageManipulator.SaveFormat.PNG) {
      currentFormat = ImageManipulator.SaveFormat.JPEG;
      quality = 0.85;
    } else {
      quality = Math.max(0.3, quality - 0.15);
    }
    result = await runCompression();
    size = estimateBase64Size(result.base64);
  }

  if (size > maxSizeBytes || !result.base64) {
    throw new Error("Impossibile comprimere l'immagine sotto 1 MB.");
  }

  return {
    uri: result.uri,
    mimeType: currentFormat === ImageManipulator.SaveFormat.PNG ? "image/png" : "image/jpeg",
    size,
    width: result.width ?? initialWidth ?? undefined,
    height: result.height ?? initialHeight ?? undefined,
    base64: result.base64,
  };
}

export async function autoCropDocument(_: AutoCropRequest): Promise<AutoCropResult | null> {
  // Placeholder for potential future smart-crop logic.
  // Returning null keeps the manual crop flow intact without introducing heavy dependencies.
  return null;
}
