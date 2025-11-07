import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, Image, Modal, Pressable, StyleSheet, Text } from "react-native";
import { GestureHandlerRootView, PanGestureHandler, PinchGestureHandler, State } from "react-native-gesture-handler";

const viewport = Dimensions.get("window");

type ZoomableImageModalProps = {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
  rotationDeg?: number;
};

const AnimatedImage = Animated.createAnimatedComponent(Image);

export function ZoomableImageModal({ visible, uri, onClose, rotationDeg = 0 }: ZoomableImageModalProps) {
  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const scaledValue = useMemo(() => Animated.multiply(baseScale, pinchScale), [baseScale, pinchScale]);
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const lastScaleRef = useRef(1);
  const lastPanRef = useRef({ x: 0, y: 0 });
  const [canPan, setCanPan] = useState(false);
  const pinchRef = useRef<PinchGestureHandler>(null);
  const panRef = useRef<PanGestureHandler>(null);

  const resetTransforms = useCallback(() => {
    lastScaleRef.current = 1;
    baseScale.setValue(1);
    pinchScale.setValue(1);
    lastPanRef.current = { x: 0, y: 0 };
    pan.setValue({ x: 0, y: 0 });
    pan.setOffset({ x: 0, y: 0 });
    setCanPan(false);
  }, [baseScale, pan, pinchScale]);

  useEffect(() => {
    if (!visible) resetTransforms();
  }, [visible, resetTransforms]);

  const handlePinchEvent = useMemo(
    () => Animated.event([{ nativeEvent: { scale: pinchScale } }], { useNativeDriver: true }),
    [pinchScale]
  );

  const handlePinchStateChange = useCallback(
    (event: any) => {
      const { state, scale } = event.nativeEvent;
      if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
        lastScaleRef.current = Math.min(Math.max(lastScaleRef.current * scale, 1), 4);
        baseScale.setValue(lastScaleRef.current);
        pinchScale.setValue(1);
        if (lastScaleRef.current <= 1.01) {
          lastPanRef.current = { x: 0, y: 0 };
          pan.setValue({ x: 0, y: 0 });
          pan.setOffset({ x: 0, y: 0 });
        }
        setCanPan(lastScaleRef.current > 1.01);
      } else if (state === State.BEGAN) {
        pinchScale.setValue(1);
      }
    },
    [baseScale, pan, pinchScale]
  );

  const handlePanEvent = useMemo(
    () => Animated.event([{ nativeEvent: { translationX: pan.x, translationY: pan.y } }], { useNativeDriver: true }),
    [pan.x, pan.y]
  );

  const handlePanStateChange = useCallback(
    (event: any) => {
      const { state, translationX, translationY } = event.nativeEvent;
      if (state === State.BEGAN) {
        pan.setOffset(lastPanRef.current);
        pan.setValue({ x: 0, y: 0 });
      } else if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
        lastPanRef.current = {
          x: lastPanRef.current.x + translationX,
          y: lastPanRef.current.y + translationY,
        };
        pan.setOffset(lastPanRef.current);
        pan.setValue({ x: 0, y: 0 });
      }
    },
    [pan]
  );

  if (!uri) return null;

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Animated.View style={styles.backdrop}>
        <Pressable
          style={styles.closeButton}
          onPress={() => {
            resetTransforms();
            onClose();
          }}
        >
          <Text style={styles.closeText}>Chiudi</Text>
        </Pressable>
        <PanGestureHandler
          ref={panRef}
          simultaneousHandlers={pinchRef}
          onGestureEvent={handlePanEvent}
          onHandlerStateChange={handlePanStateChange}
          minPointers={1}
          enabled={canPan}
          minDist={canPan ? 2 : 20}
        >
          <Animated.View style={{ transform: [...pan.getTranslateTransform()] }}>
            <PinchGestureHandler
              ref={pinchRef}
              simultaneousHandlers={panRef}
              onGestureEvent={handlePinchEvent}
              onHandlerStateChange={handlePinchStateChange}
            >
              <Animated.View style={[styles.imageWrapper, { transform: [{ scale: scaledValue }] }]}>
                <AnimatedImage
                  source={{ uri }}
                  style={[
                    styles.image,
                    {
                      transform: [{ rotate: `${rotationDeg}deg` }],
                    },
                  ]}
                  resizeMode="contain"
                />
              </Animated.View>
            </PinchGestureHandler>
          </Animated.View>
        </PanGestureHandler>
      </Animated.View>
    </GestureHandlerRootView>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  imageWrapper: {
    width: viewport.width * 0.9,
    height: viewport.height * 0.75,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: viewport.width * 0.9,
    height: viewport.height * 0.75,
  },
  closeButton: {
    position: "absolute",
    top: 40,
    right: 20,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  closeText: {
    color: "#fff",
    fontWeight: "700",
  },
});
