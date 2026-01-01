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
  SocialList: undefined;
  SocialDetail: { eventId: string };
  SocialEdit: { mode?: "create" | "edit"; eventId?: string };
  Calendar: undefined;
  CalendarDay: { day: string; rides: any[] };
  Board: undefined;
  CreateRide: { rideId?: string };
  // LEGACY alias: route "Create" mantenuta per compatibilità con versioni precedenti (al momento non navigata direttamente).
  Create: undefined; // alias compatibilità
  RideDetails: { rideId: string; title?: string };
  Profile: undefined;
  Attesa: undefined;
  Rejected: undefined;
  NotificationSettings: undefined;
  TrekkingPlaceholder: undefined;
  ViaggiPlaceholder: undefined;
  Info: undefined;
  TabBacheca: undefined;
  BoardPostDetail: { postId: string; title?: string };
};

// Tipi per il Tab Navigator principale (vedi MainTabs in App.tsx).
export type MainTabParamList = {
  TabHome: undefined;
  // TabEventi removed
  TabBacheca: undefined;
  TabCalendar: undefined;
  TabProfile: undefined;
};
