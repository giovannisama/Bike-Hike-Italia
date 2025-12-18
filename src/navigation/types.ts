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
  TrekkingPlaceholder: undefined;
  Info: undefined;
  TabBacheca: undefined;
  BoardPostDetail: { postId: string; title?: string };
};

// Tipi per il Tab Navigator principale (vedi MainTabs in App.tsx).
export type MainTabParamList = {
  TabHome: undefined;
  TabEventi: undefined;
  TabBacheca: undefined;
  TabCalendar: undefined;
  TabMore: {
    screen?: "Info" | "MoreHome" | "Amministrazione" | "Profile";
    params?: any;
  };
};
