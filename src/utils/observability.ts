import { warn } from "./logger";
import * as Sentry from "@sentry/react-native";

export function addBreadcrumbSafe(breadcrumb: unknown) {
  const fn = (Sentry as any)?.addBreadcrumb;
  if (typeof fn === "function") return fn(breadcrumb);
  if (__DEV__) warn("[obs] addBreadcrumb unavailable");
  return undefined;
}

export function captureExceptionSafe(error: unknown) {
  const fn = (Sentry as any)?.captureException;
  if (typeof fn === "function") return fn(error);
  if (__DEV__) warn("[obs] captureException unavailable");
  return undefined;
}

export function setTagSafe(key: string, value: string) {
  const fn = (Sentry as any)?.setTag;
  if (typeof fn === "function") return fn(key, value);
  if (__DEV__) warn("[obs] setTag unavailable");
  return undefined;
}
