export type FieldErrors = {
  title?: string;
  meetingPoint?: string;
  date?: string;
  time?: string;
  maxParticipants?: string;
  link?: string;
  bikes?: string;
  tripType?: string;
  transportType?: string;
  durationDays?: string;
  overnightType?: string;
  elevation?: string;
  length?: string;
  mandatoryGear?: string;
};

export type ExtraServiceState = {
  enabled: boolean;
  label: string;
};

export type CreateRideForm = {
  title: string;
  meetingPoint: string;
  description: string;
  bikes: string[];
  date: string;
  time: string;
  maxParticipants: string;
  link: string;
  difficulty: string;
  guidaText: string;
  extraServices: Record<string, ExtraServiceState>;
  // Trek specific
  // Trip specific
  tripType?: string;
  transportType?: string;
  durationDays?: string;
  overnightType?: string;
  // Trek specific
  elevation?: string;
  length?: string;
  mandatoryGear?: string;
};
