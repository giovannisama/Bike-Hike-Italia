import { Timestamp } from "firebase/firestore";
import type { TrekData } from "../../types/firestore";

export type Ride = {
  id: string;
  title: string;
  meetingPoint: string;
  bikes?: string[];
  date?: Timestamp | null;
  dateTime?: Timestamp | null;
  status?: "active" | "cancelled";
  archived?: boolean;
  difficulty?: string | null;
  guidaName?: string | null;
  guidaNames?: string[] | null;
  kind?: "ride" | "trek";
  trek?: TrekData | null;
};

export type MarkedDate = {
  marked?: boolean;
  dots?: Array<{ color: string }>;
  selected?: boolean;
  selectedColor?: string;
  selectedTextColor?: string;
};

export type MarkedDates = Record<string, MarkedDate>;
