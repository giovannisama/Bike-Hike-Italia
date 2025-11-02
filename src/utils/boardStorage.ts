import AsyncStorage from "@react-native-async-storage/async-storage";

const BOARD_LAST_SEEN_PREFIX = "board:lastSeen:";

export function boardLastSeenKey(uid: string) {
  return `${BOARD_LAST_SEEN_PREFIX}${uid}`;
}

export async function saveBoardLastSeen(uid: string, date: Date = new Date()) {
  try {
    await AsyncStorage.setItem(boardLastSeenKey(uid), date.getTime().toString());
  } catch (err) {
    console.warn("[boardStorage] saveBoardLastSeen error:", err);
  }
}

export async function loadBoardLastSeen(uid: string): Promise<Date | null> {
  try {
    const value = await AsyncStorage.getItem(boardLastSeenKey(uid));
    if (!value) return null;
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) return null;
    return new Date(parsed);
  } catch (err) {
    console.warn("[boardStorage] loadBoardLastSeen error:", err);
    return null;
  }
}
