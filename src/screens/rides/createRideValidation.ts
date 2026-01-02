export type FieldErrors = {
  title?: string;
  meetingPoint?: string;
  date?: string;
  time?: string;
  maxParticipants?: string;
  link?: string;
  bikes?: string;
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
};

const parseFormDateTime = (date: string, time: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

export function getCreateRideErrors(form: CreateRideForm): FieldErrors {
  const t = form.title.trim();
  const mp = form.meetingPoint.trim();
  const errs: FieldErrors = {};

  if (!t) {
    errs.title = "Inserisci un titolo";
  } else if (t.length > 120) {
    errs.title = "Massimo 120 caratteri";
  }

  if (!mp) {
    errs.meetingPoint = "Indica il luogo di ritrovo";
  } else if (mp.length > 200) {
    errs.meetingPoint = "Massimo 200 caratteri";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
    errs.date = "Seleziona una data valida";
  }
  if (!/^\d{2}:\d{2}$/.test(form.time)) {
    errs.time = "Seleziona un orario valido";
  }
  const dt = parseFormDateTime(form.date, form.time);
  if (!dt) {
    errs.date = errs.date ?? "Data non valida";
    errs.time = errs.time ?? "Ora non valida";
  }

  if (form.maxParticipants.trim() !== "") {
    const num = Number(form.maxParticipants);
    if (!Number.isFinite(num) || num < 0) {
      errs.maxParticipants = "Inserisci un numero ≥ 0";
    }
  }

  if (Array.isArray(form.bikes) && form.bikes.length > 20) {
    errs.bikes = "Max 20 tipologie";
  }

  if (form.link.trim() && !/^((https?):\/\/|geo:)/i.test(form.link.trim())) {
    errs.link = "Inserisci un URL valido (es. https://…)";
  }

  return errs;
}

export function validateCreateRide(
  form: CreateRideForm
): { ok: true } | { ok: false; field?: keyof FieldErrors; message: string } {
  const errors = getCreateRideErrors(form);
  const fields = Object.keys(errors) as Array<keyof FieldErrors>;
  if (fields.length === 0) return { ok: true };
  const firstField = fields[0];
  return {
    ok: false,
    field: firstField,
    message: errors[firstField] ?? "Errore di validazione",
  };
}
