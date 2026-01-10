import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Calendar from "expo-calendar";

const CALENDAR_EVENT_ID_PREFIX = "calendarEventId:";

const getCalendarKey = (appEventId: string) => `${CALENDAR_EVENT_ID_PREFIX}${appEventId.trim()}`;

export const getStoredCalendarEventId = async (appEventId: string): Promise<string | null> => {
  const id = (appEventId ?? "").trim();
  if (!id) return null;
  try {
    const stored = await AsyncStorage.getItem(getCalendarKey(id));
    return stored ? stored.trim() : null;
  } catch {
    return null;
  }
};

export const setStoredCalendarEventId = async (
  appEventId: string,
  calendarEventId: string
): Promise<void> => {
  const id = (appEventId ?? "").trim();
  const calId = (calendarEventId ?? "").trim();
  if (!id || !calId) return;
  try {
    await AsyncStorage.setItem(getCalendarKey(id), calId);
  } catch {
    // ignore storage errors
  }
};

export const removeStoredCalendarEventId = async (appEventId: string): Promise<void> => {
  const id = (appEventId ?? "").trim();
  if (!id) return;
  try {
    await AsyncStorage.removeItem(getCalendarKey(id));
  } catch {
    // ignore storage errors
  }
};

export const checkCalendarEventExists = async (calendarEventId: string): Promise<boolean> => {
  const calId = (calendarEventId ?? "").trim();
  if (!calId) return false;
  try {
    // If calendar permissions are missing, getEventAsync can throw.
    // Caller should keep the existing permission flow; we simply treat errors as "not found".
    const event = await Calendar.getEventAsync(calId);
    return !!event;
  } catch {
    return false;
  }
};
