type LogContext = Record<string, unknown>;

const formatMessage = (label: string, message: string, context?: LogContext) => {
  if (!context || Object.keys(context).length === 0) {
    return [`[BHI] ${label} ${message}`];
  }
  return [`[BHI] ${label} ${message}`, context];
};

export function log(message: string, context?: LogContext) {
  if (!__DEV__) return;
  console.log(...formatMessage("LOG", message, context));
}

export function info(message: string, context?: LogContext) {
  if (!__DEV__) return;
  console.info(...formatMessage("INFO", message, context));
}

export function warn(message: string, context?: LogContext) {
  if (!__DEV__) return;
  console.warn(...formatMessage("WARN", message, context));
}

export function error(message: string, context?: LogContext) {
  if (!__DEV__) return;
  console.error(...formatMessage("ERROR", message, context));
}

export type { LogContext };
