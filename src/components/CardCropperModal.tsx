import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import type { Action as ImageManipulatorAction } from "expo-image-manipulator";
import { UI } from "./Screen";

type CropRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type CropResult = {
  uri: string;
  width: number;
  height: number;
  base64?: string | null;
};

type CardCropperModalProps = {
  visible: boolean;
  imageUri: string | undefined;
  onCancel: () => void;
  onConfirm: (result: CropResult) => void;
};

const MIN_RECT_SIZE = 80;

export function CardCropperModal({ visible, imageUri, onCancel, onConfirm }: CardCropperModalProps) {
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [loading, setLoading] = useState(false);

  const startRectRef = useRef<CropRect | null>(null);

  useEffect(() => {
    if (!visible || !imageUri) return;
    setLoading(false);
    Image.getSize(
      imageUri,
      (width, height) => {
        setImageSize({ width, height });
      },
      () => {
        setImageSize(null);
      }
    );
  }, [visible, imageUri]);

  useEffect(() => {
    if (!imageSize) return;
    const { width: winW, height: winH } = Dimensions.get("window");
    const horizontalPadding = 32;
    const maxWidth = winW - horizontalPadding * 2;
    const maxHeight = winH * 0.6;
    let width = maxWidth;
    let height = (imageSize.height / imageSize.width) * width;
    if (height > maxHeight) {
      height = maxHeight;
      width = (imageSize.width / imageSize.height) * height;
    }
    setDisplaySize({ width, height });

    const marginX = width * 0.08;
    const marginY = height * 0.08;
    setCropRect({
      left: marginX,
      top: marginY,
      right: width - marginX,
      bottom: height - marginY,
    });
  }, [imageSize]);

  useEffect(() => {
    if (!visible) {
      setImageSize(null);
      setDisplaySize(null);
      setCropRect(null);
    }
  }, [visible]);

  const clampRect = useCallback(
    (candidate: CropRect): CropRect => {
      if (!displaySize) return candidate;
      const minWidth = MIN_RECT_SIZE;
      const minHeight = MIN_RECT_SIZE;
      let { left, top, right, bottom } = candidate;

      left = Math.max(0, Math.min(left, displaySize.width));
      top = Math.max(0, Math.min(top, displaySize.height));
      right = Math.max(0, Math.min(right, displaySize.width));
      bottom = Math.max(0, Math.min(bottom, displaySize.height));

      if (right - left < minWidth) {
        const mid = (left + right) / 2;
        left = Math.max(0, mid - minWidth / 2);
        right = Math.min(displaySize.width, left + minWidth);
        left = right - minWidth;
      }

      if (bottom - top < minHeight) {
        const mid = (top + bottom) / 2;
        top = Math.max(0, mid - minHeight / 2);
        bottom = Math.min(displaySize.height, top + minHeight);
        top = bottom - minHeight;
      }

      if (left < 0) {
        right = Math.min(displaySize.width, right - left);
        left = 0;
      }
      if (right > displaySize.width) {
        left = Math.max(0, left - (right - displaySize.width));
        right = displaySize.width;
      }
      if (top < 0) {
        bottom = Math.min(displaySize.height, bottom - top);
        top = 0;
      }
      if (bottom > displaySize.height) {
        top = Math.max(0, top - (bottom - displaySize.height));
        bottom = displaySize.height;
      }

      return { left, top, right, bottom };
    },
    [displaySize]
  );

  const updateRect = useCallback(
    (next: CropRect) => {
      setCropRect(clampRect(next));
    },
    [clampRect]
  );

  const createCornerResponder = useCallback(
    (corner: "tl" | "tr" | "bl" | "br") =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          if (cropRect) startRectRef.current = { ...cropRect };
        },
        onPanResponderMove: (_, gesture) => {
          if (!startRectRef.current || !displaySize) return;
          const base = startRectRef.current;
          if (corner === "tl") {
            const left = Math.min(base.right - MIN_RECT_SIZE, Math.max(0, base.left + gesture.dx));
            const top = Math.min(base.bottom - MIN_RECT_SIZE, Math.max(0, base.top + gesture.dy));
            updateRect({ ...base, left, top });
          } else if (corner === "tr") {
            const right = Math.max(base.left + MIN_RECT_SIZE, Math.min(displaySize.width, base.right + gesture.dx));
            const top = Math.min(base.bottom - MIN_RECT_SIZE, Math.max(0, base.top + gesture.dy));
            updateRect({ ...base, right, top });
          } else if (corner === "bl") {
            const left = Math.min(base.right - MIN_RECT_SIZE, Math.max(0, base.left + gesture.dx));
            const bottom = Math.max(base.top + MIN_RECT_SIZE, Math.min(displaySize.height, base.bottom + gesture.dy));
            updateRect({ ...base, left, bottom });
          } else if (corner === "br") {
            const right = Math.max(base.left + MIN_RECT_SIZE, Math.min(displaySize.width, base.right + gesture.dx));
            const bottom = Math.max(base.top + MIN_RECT_SIZE, Math.min(displaySize.height, base.bottom + gesture.dy));
            updateRect({ ...base, right, bottom });
          }
        },
        onPanResponderRelease: () => {
          startRectRef.current = null;
        },
      }),
    [cropRect, updateRect]
  );

  const moveResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2,
        onPanResponderGrant: () => {
          if (cropRect) startRectRef.current = { ...cropRect };
        },
        onPanResponderMove: (_, gesture) => {
          if (!startRectRef.current || !displaySize) return;
          const base = startRectRef.current;
          let nextLeft = base.left + gesture.dx;
          let nextTop = base.top + gesture.dy;
          let nextRight = base.right + gesture.dx;
          let nextBottom = base.bottom + gesture.dy;

          const width = base.right - base.left;
          const height = base.bottom - base.top;

          if (nextLeft < 0) {
            nextRight -= nextLeft;
            nextLeft = 0;
          }
          if (nextRight > displaySize.width) {
            const overflow = nextRight - displaySize.width;
            nextLeft -= overflow;
            nextRight = displaySize.width;
          }
          if (nextTop < 0) {
            nextBottom -= nextTop;
            nextTop = 0;
          }
          if (nextBottom > displaySize.height) {
            const overflow = nextBottom - displaySize.height;
            nextTop -= overflow;
            nextBottom = displaySize.height;
          }

          updateRect({ left: nextLeft, top: nextTop, right: nextRight, bottom: nextBottom });
        },
        onPanResponderRelease: () => {
          startRectRef.current = null;
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [cropRect, displaySize, updateRect]
  );

  const topLeftResponder = useMemo(() => createCornerResponder("tl"), [createCornerResponder]);
  const topRightResponder = useMemo(() => createCornerResponder("tr"), [createCornerResponder]);
  const bottomLeftResponder = useMemo(() => createCornerResponder("bl"), [createCornerResponder]);
  const bottomRightResponder = useMemo(() => createCornerResponder("br"), [createCornerResponder]);

  const createEdgeResponder = useCallback(
    (edge: "top" | "bottom" | "left" | "right") =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          if (cropRect) startRectRef.current = { ...cropRect };
        },
        onPanResponderMove: (_, gesture) => {
          if (!startRectRef.current || !displaySize) return;
          const base = startRectRef.current;
          if (edge === "top") {
            const top = Math.min(base.bottom - MIN_RECT_SIZE, Math.max(0, base.top + gesture.dy));
            updateRect({ ...base, top });
          } else if (edge === "bottom") {
            const bottom = Math.max(base.top + MIN_RECT_SIZE, Math.min(displaySize.height, base.bottom + gesture.dy));
            updateRect({ ...base, bottom });
          } else if (edge === "left") {
            const left = Math.min(base.right - MIN_RECT_SIZE, Math.max(0, base.left + gesture.dx));
            updateRect({ ...base, left });
          } else if (edge === "right") {
            const right = Math.max(base.left + MIN_RECT_SIZE, Math.min(displaySize.width, base.right + gesture.dx));
            updateRect({ ...base, right });
          }
        },
        onPanResponderRelease: () => {
          startRectRef.current = null;
        },
      }),
    [cropRect, updateRect]
  );

  const topEdgeResponder = useMemo(() => createEdgeResponder("top"), [createEdgeResponder]);
  const bottomEdgeResponder = useMemo(() => createEdgeResponder("bottom"), [createEdgeResponder]);
  const leftEdgeResponder = useMemo(() => createEdgeResponder("left"), [createEdgeResponder]);
  const rightEdgeResponder = useMemo(() => createEdgeResponder("right"), [createEdgeResponder]);

  const handleConfirm = useCallback(async () => {
    if (!cropRect || !displaySize || !imageSize || !imageUri) return;
    try {
      setLoading(true);
      const originX = Math.max(0, Math.round((cropRect.left / displaySize.width) * imageSize.width));
      const originY = Math.max(0, Math.round((cropRect.top / displaySize.height) * imageSize.height));
      const width = Math.min(
        imageSize.width - originX,
        Math.round(((cropRect.right - cropRect.left) / displaySize.width) * imageSize.width)
      );
      const height = Math.min(
        imageSize.height - originY,
        Math.round(((cropRect.bottom - cropRect.top) / displaySize.height) * imageSize.height)
      );

      let actions: ImageManipulatorAction[] = [
        { crop: { originX, originY, width, height } },
      ];

      const maxEdge = Math.max(width, height);
      if (maxEdge > 1400) {
        const scale = 1400 / maxEdge;
        actions.push({
          resize: {
            width: Math.round(width * scale),
            height: Math.round(height * scale),
          },
        });
      }

      let compressQuality = 0.7;
      let attempt = 0;
      let result = await ImageManipulator.manipulateAsync(
        imageUri,
        actions,
        { compress: compressQuality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      while (result.base64 && result.base64.length > 380000 && attempt < 3) {
        compressQuality = Math.max(0.4, compressQuality - 0.1);
        result = await ImageManipulator.manipulateAsync(
          result.uri,
          [],
          { compress: compressQuality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        attempt += 1;
      }

      if (result.base64 && result.base64.length > 400000) {
        Alert.alert(
          "Immagine troppo grande",
          "Riduci un po' la foto (ingrandisci il ritaglio) oppure riprova scattando da più vicino. La tessera non può superare ~300 KB."
        );
        setLoading(false);
        return;
      }

      onConfirm({
        uri: result.uri,
        width: result.width,
        height: result.height,
        base64: result.base64 ?? null,
      });
    } catch (error) {
      console.error("Errore crop tessera:", error);
    } finally {
      setLoading(false);
    }
  }, [cropRect, displaySize, imageSize, imageUri, onConfirm]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Ritaglia la tessera</Text>
          <Text style={styles.subtitle}>
            Trascina gli angoli per selezionare solo la tessera. Puoi trascinare anche il rettangolo per riposizionarlo.
          </Text>
          {!imageSize || !displaySize || !cropRect ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator />
            </View>
          ) : (
            <View style={[styles.imageWrapper, { width: displaySize.width, height: displaySize.height }]}>
              <Image
                source={{ uri: imageUri }}
                style={{ width: displaySize.width, height: displaySize.height, borderRadius: 12 }}
              />

              <View
                style={[
                  styles.overlay,
                  { width: displaySize.width, height: displaySize.height },
                ]}
                pointerEvents="none"
              >
                <View style={[styles.dim, { height: cropRect.top }]} />
                <View style={{ flexDirection: "row" }}>
                  <View style={[styles.dim, { width: cropRect.left, height: cropRect.bottom - cropRect.top }]} />
                  <View style={[styles.cropArea, { width: cropRect.right - cropRect.left, height: cropRect.bottom - cropRect.top }]} />
                  <View style={[styles.dim, { width: displaySize.width - cropRect.right, height: cropRect.bottom - cropRect.top }]} />
                </View>
                <View style={[styles.dim, { height: displaySize.height - cropRect.bottom }]} />
              </View>

              <View
                style={[
                  styles.cropBorder,
                  {
                    left: cropRect.left,
                    top: cropRect.top,
                    width: cropRect.right - cropRect.left,
                    height: cropRect.bottom - cropRect.top,
                  },
                ]}
                {...moveResponder.panHandlers}
              >
                <View style={styles.guides} pointerEvents="none">
                  <View style={[styles.guideVertical, { left: "33.33%" }]} />
                  <View style={[styles.guideVertical, { left: "66.66%" }]} />
                  <View style={[styles.guideHorizontal, { top: "33.33%" }]} />
                  <View style={[styles.guideHorizontal, { top: "66.66%" }]} />
                </View>
                <View style={[styles.edge, styles.edgeTop]} {...topEdgeResponder.panHandlers} />
                <View style={[styles.edge, styles.edgeBottom]} {...bottomEdgeResponder.panHandlers} />
                <View style={[styles.edge, styles.edgeLeft]} {...leftEdgeResponder.panHandlers} />
                <View style={[styles.edge, styles.edgeRight]} {...rightEdgeResponder.panHandlers} />
                <View style={[styles.handle, styles.handleTL]} {...topLeftResponder.panHandlers} />
                <View style={[styles.handle, styles.handleTR]} {...topRightResponder.panHandlers} />
                <View style={[styles.handle, styles.handleBL]} {...bottomLeftResponder.panHandlers} />
                <View style={[styles.handle, styles.handleBR]} {...bottomRightResponder.panHandlers} />
              </View>
            </View>
          )}
          <View style={styles.actions}>
            <TouchableOpacity onPress={onCancel} style={[styles.actionButton, styles.cancel]}>
              <Text style={styles.cancelText}>Annulla</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={loading || !cropRect}
              style={[styles.actionButton, styles.confirm, loading && { opacity: 0.7 }]}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>Applica</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    padding: 16,
  },
  sheet: {
    backgroundColor: "#0F172A",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  subtitle: {
    color: "#CBD5F5",
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
  },
  loadingBox: {
    width: 200,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 40,
  },
  imageWrapper: {
    marginTop: 20,
    overflow: "visible",
    borderRadius: 12,
    backgroundColor: "#000",
  },
  overlay: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  dim: {
    backgroundColor: "rgba(15,23,42,0.55)",
  },
  cropArea: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",
  },
  cropBorder: {
    position: "absolute",
    borderWidth: 2,
    borderColor: UI.colors.accentWarm,
  },
  guides: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  guideVertical: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
    left: "33%",
  },
  guideHorizontal: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
    top: "33%",
  },
  handle: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: UI.colors.accentWarm,
    borderWidth: 2,
    borderColor: "#fff",
  },
  handleTL: {
    left: -12,
    top: -12,
  },
  handleTR: {
    right: -12,
    top: -12,
  },
  handleBL: {
    left: -12,
    bottom: -12,
  },
  handleBR: {
    right: -12,
    bottom: -12,
  },
  edge: {
    position: "absolute",
    backgroundColor: "transparent",
  },
  edgeTop: {
    top: -10,
    left: 24,
    right: 24,
    height: 20,
  },
  edgeBottom: {
    bottom: -10,
    left: 24,
    right: 24,
    height: 20,
  },
  edgeLeft: {
    left: -10,
    top: 24,
    bottom: 24,
    width: 20,
  },
  edgeRight: {
    right: -10,
    top: 24,
    bottom: 24,
    width: 20,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  actionButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  cancel: {
    backgroundColor: "#1E293B",
  },
  cancelText: {
    color: "#E2E8F0",
    fontWeight: "600",
  },
  confirm: {
    backgroundColor: UI.colors.secondary,
  },
  confirmText: {
    color: "#fff",
    fontWeight: "800",
  },
});
