import { Timestamp } from "firebase/firestore";

export type Ride = {
  id: string;
  title: string;
  meetingPoint: string;
  date?: Timestamp | null;
  dateTime?: Timestamp | null;
  status?: "active" | "cancelled";
  archived?: boolean;
};

export type MarkedDate = {
  marked?: boolean;
  dots?: Array<{ color: string }>;
  selected?: boolean;
  selectedColor?: string;
  selectedTextColor?: string;
};

export type MarkedDates = Record<string, MarkedDate>;
