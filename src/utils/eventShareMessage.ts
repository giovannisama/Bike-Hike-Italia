export type EventShareType = "ciclismo" | "trekking" | "viaggi" | "social";

const EVENT_TYPE_LABELS: Record<EventShareType, string> = {
  ciclismo: "Ciclismo",
  trekking: "Trekking",
  viaggi: "Viaggio",
  social: "Social",
};

const EVENT_TYPE_SHARE_ICONS: Record<EventShareType, string> = {
  ciclismo: "🚴",
  trekking: "🥾",
  viaggi: "🧳",
  social: "👥",
};

type ShareMessageParams = {
  type: EventShareType;
  title: string;
  dateText: string;
  placeText: string;
  extraLines?: string;
};

export const getEventTypeLabel = (type: EventShareType) => EVENT_TYPE_LABELS[type];

export const getEventTypeShareIcon = (type: EventShareType) => EVENT_TYPE_SHARE_ICONS[type];

export const buildShareMessage = ({ type, title, dateText, placeText, extraLines }: ShareMessageParams) => {
  const icon = getEventTypeShareIcon(type);
  const label = getEventTypeLabel(type);
  const extra = extraLines ? `\n${extraLines}` : "";
  return `${icon} Evento ${label}: ${title}\n📅 ${dateText}\n📍 ${placeText}${extra}\n\nPartecipa sull'app!`;
};
