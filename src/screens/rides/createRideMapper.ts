import { serverTimestamp, Timestamp } from "firebase/firestore";
import { splitGuideInput } from "../../utils/guideHelpers";
import type { CreateRideForm, ExtraServiceState } from "./createRideValidation";

type MapperContext = {
  uid: string;
  dateTime: Date;
  isEdit: boolean;
};

const sanitizeCreatePayload = (raw: Record<string, any>) => {
  const obj: Record<string, any> = { ...raw };
  const trimIfString = (value: any) => (typeof value === "string" ? value.trim() : value);

  Object.keys(obj).forEach((key) => {
    obj[key] = trimIfString(obj[key]);
  });

  Object.keys(obj).forEach((key) => {
    if (obj[key] === null || obj[key] === undefined) delete obj[key];
  });

  return obj;
};

const mapExtraServices = (extraServices: Record<string, ExtraServiceState>) => {
  const payload: Record<string, { enabled: boolean; label: string | null }> = {};
  Object.keys(extraServices).forEach((key) => {
    const conf = extraServices[key];
    if (conf?.enabled) {
      payload[key] = {
        enabled: true,
        label: conf.label.trim() || null,
      };
    }
  });
  return payload;
};

export function mapCreateRideToFirestore(form: CreateRideForm, ctx: MapperContext) {
  const maxNum =
    form.maxParticipants.trim() === ""
      ? null
      : Number.isNaN(Number(form.maxParticipants))
        ? null
        : Number(form.maxParticipants);

  const names = splitGuideInput(form.guidaText);
  const guidaName = names.length > 0 ? names[0] : null;
  const guidaNames = names.length > 1 ? names : names.length === 1 ? [names[0]] : null;

  const basePayload: Record<string, any> = {
    title: form.title.trim(),
    meetingPoint: form.meetingPoint.trim(),
    description: (form.description || "").trim() || null,
    bikes: Array.isArray(form.bikes) ? form.bikes.slice(0, 20) : [],
    dateTime: Timestamp.fromDate(ctx.dateTime),
    date: Timestamp.fromDate(ctx.dateTime),
    maxParticipants: maxNum,
    createdBy: ctx.uid,
    createdAt: serverTimestamp(),
    status: "active",
    archived: false,
    participantsCount: 0,
    link: form.link.trim() ? form.link.trim() : null,
    difficulty: form.difficulty ? form.difficulty : null,
    guidaName: guidaName ?? null,
    guidaNames: guidaNames ?? null,
  };

  const payload = sanitizeCreatePayload(basePayload);
  const extraServicesPayload = mapExtraServices(form.extraServices);
  if (Object.keys(extraServicesPayload).length > 0) {
    payload.extraServices = extraServicesPayload;
  } else if (ctx.isEdit) {
    payload.extraServices = null;
  }

  return payload;
}
