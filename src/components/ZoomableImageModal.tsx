import React, { useEffect, useRef } from "react";
import { Animated, Image, Modal, Pressable, StyleSheet, Text } from "react-native";
import { GestureHandlerRootView, PinchGestureHandler, State } from "react-native-gesture-handler";

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
  const scale = Animated.multiply(baseScale, pinchScale);
  const lastScale = useRef(1);

  const resetScale = () => {
    lastScale.current = 1;
    baseScale.setValue(1);
    pinchScale.setValue(1);
  };

  useEffect(() => {
    if (!visible) {
      resetScale();
    }
  }, [visible]);

  const onPinchEvent = Animated.event([{ nativeEvent: { scale: pinchScale } }], {
    useNativeDriver: true,
  });

  const onPinchStateChange = (event: any) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      lastScale.current = Math.min(Math.max(lastScale.current * event.nativeEvent.scale, 1), 4);
      baseScale.setValue(lastScale.current);
      pinchScale.setValue(1);
    }
  };

  if (!uri) return null;

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Animated.View style={styles.backdrop}>
        <Pressable style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeText}>Chiudi</Text>
        </Pressable>
        <PinchGestureHandler onGestureEvent={onPinchEvent} onHandlerStateChange={onPinchStateChange}>
          <Animated.View style={styles.imageWrapper}>
            <AnimatedImage
              source={{ uri }}
              style={[
                styles.image,
                {
                  transform: [{ scale }, { rotate: `${rotationDeg}deg` }],
                },
              ]}
              resizeMode="contain"
            />
          </Animated.View>
        </PinchGestureHandler>
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
    width: "100%",
    maxHeight: "90%",
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
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
