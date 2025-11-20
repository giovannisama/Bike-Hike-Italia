// Tipi centralizzati per lo Stack principale dell'app (vedi App.tsx).
export type RootStackParamList = {
  // Auth
  Login: undefined;
  Signup: undefined;

  // App
  Home: undefined;
  Amministrazione: undefined;
  UserList: undefined;
  UserDetail: { uid: string; meRole?: string | null };
  UsciteList: undefined;
  Calendar: undefined;
  Board: undefined;
  CreateRide: undefined;
  // LEGACY alias: route "Create" mantenuta per compatibilità con versioni precedenti (al momento non navigata direttamente).
  Create: undefined; // alias compatibilità
  RideDetails: { rideId: string; title?: string };
  Profile: undefined;
  Attesa: undefined;
  NotificationSettings: undefined;
};
