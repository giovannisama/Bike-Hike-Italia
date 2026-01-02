import React from "react";
import { Text, View } from "react-native";
import { Screen, UI } from "./Screen";
import { PrimaryButton } from "./Button";
import { error as logError } from "../utils/logger";
import { captureExceptionSafe } from "../utils/observability";

type AppErrorBoundaryState = {
  hasError: boolean;
};

class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    if (__DEV__) {
      logError("AppErrorBoundary render error", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: info.componentStack,
      });
      return;
    }
    captureExceptionSafe(error instanceof Error ? error : new Error("Unknown error"));
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <Screen title="Errore" scroll={false}>
        <View style={{ gap: UI.spacing.md }}>
          <Text style={{ color: UI.colors.text, fontSize: 16, fontWeight: "600" }}>
            Si è verificato un problema. Riprova tra un istante.
          </Text>
          <PrimaryButton label="Riprova" onPress={this.handleReset} />
        </View>
      </Screen>
    );
  }
}

export default AppErrorBoundary;
