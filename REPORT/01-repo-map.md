# 01 - Repo Map

## 1. Struttura Cartelle

```
/
├── App.tsx                     # Entrypoint applicazione
├── app.json                    # Configurazione Expo
├── eas.json                    # Configurazione Build (EAS)
├── firestore.rules             # Regole di sicurezza Firestore
├── firestore.indexes.json      # Indici Firestore
├── package.json                # Dipendenze
├── tsconfig.json               # Configurazione TypeScript
└── src/
    ├── components/             # Componenti UI riutilizzabili
    │   ├── Screen.tsx          # Wrapper schermata base + Tema UI
    │   ├── ScreenHeader.tsx    # Header standardizzato
    │   ├── EventGridCard.tsx   # Card griglia eventi
    │   └── ... (Button, Badge, Modals)
    ├── constants/              # Costanti (es. sottotitoli eventi)
    ├── hooks/                  # Custom hooks (useCurrentProfile, etc.)
    ├── navigation/             # Tipi di navigazione
    │   └── types.ts            # RootStackParamList, MainTabParamList
    ├── notifications/          # Logica push notifications
    ├── screens/                # Schermate dell'app
    │   ├── admin/              # Sottocartella Admin (UserList, UserDetail)
    │   ├── calendar/           # Sottocartella Calendar Components
    │   ├── profile/            # Sottocartella Profile (non usata o in refactoring)
    │   ├── HomeScreen.tsx      # Home Page
    │   ├── EventiHubScreen.tsx # (RIMOSSO - Riferimento storico)
    │   ├── UsciteList.tsx      # Lista uscite
    │   ├── RideDetails.tsx     # Dettaglio uscita
    │   └── ... (Social, Board, Auth)
    ├── services/               # Servizi (Push, etc.)
    ├── types/                  # Definizioni TypeScript (firestore.ts)
    └── utils/                  # Utility (date, format, validation)
```

## 2. Navigator Tree

L'applicazione usa **React Navigation v7** (dipendenze recenti).

### Entrypoint: `App.tsx`

La navigazione è gestita da uno **Stack Navigator principale** (`Stack`).
Se l'utente non è autenticato (o in attesa approvazione), vengono mostrati stack alternativi.

#### **Auth Stack** (Non loggato)
- `Login`
- `Signup`

#### **Approval Stack** (Loggato ma non approvato/disabilitato)
- `Attesa`
- `Rejected`

#### **App Stack** (Loggato e Approvato)
- `Home` -> Renderizza **MainTabs** (vedi sotto)
- `Amministrazione` (screen: `AdminGate` -> `AdminScreen`)
- `UserList`
- `UserDetail`
- `UsciteList`
- `SocialList`
- `SocialDetail`
- `SocialEdit`
- `Board` ("Bacheca" legacy stack route)
- `Calendar`, `CalendarDay`
- `TrekkingPlaceholder`
- `CreateRide`
- `RideDetails`
- `Profile` ("Profilo Utente")
- `BoardPostDetail`
- `NotificationSettings`
- `Info` ("Informazioni")

### **MainTabs** (Bottom Tab Navigator)
Accessibile dalla route `Home` dello Stack principale.

1.  **Home** (`TabHome`) -> `HomeScreen`
2.  **Bacheca** (`TabBacheca`) -> `BoardScreen`
3.  **Calendario** (`TabCalendar`) -> `CalendarScreen`
4.  **Profilo** (`TabProfile`) -> `ProfileScreen`

*(Nota: La sezione "Eventi" è stata rimossa e integrata in Home. La sezione "Altro" è stata sostituita da Profilo.)*

## 3. Data Layer Map

L'app utilizza **Firebase** (Web SDK v10/v11 modular).

**File di configurazione**: `src/firebase.ts` (inizializzazione Auth/Firestore).
**Tipi Dati**: `src/types/firestore.ts` (definizioni interfacce).

### Collezioni Firestore Principali

- **`users`** (`/users/{uid}`)
    - Dati profilo utente, ruolo, stato approvazione.
    - Regole di sicurezza granulari in `firestore.rules`.
- **`rides`** (presumibilmente root o subs, da inferenza codice `CreateRide`)
    - Uscite in bici.
- **`social_events`** (da `Social*.tsx`)
    - Eventi sociali.
- **`board_posts`** (da `Board*.tsx`)
    - Post bacheca.

### Accesso ai dati
L'accesso avviene principalmente nei componenti/schermate tramite:
- `onSnapshot` (realtime listeners)
- `getDoc` / `getDocs` (fetch one-off)
- `setDoc` / `updateDoc` / `addDoc` (scrittura)

Es. `useCurrentProfile` hook gestisce la sottoscrizione al profilo utente corrente.

## 4. UI Tokens / Design System

Non esiste un Design System centralizzato rigoroso, ma un oggetto **Theme** in:
- `src/components/Screen.tsx` -> export `const UI = { ... }`

**Token definiti:**
- **Colors**: `primary` (#0B3D2E), `secondary`, `accent`, `text`, `bg`, `card`, `tint`, `danger`, `warningBg`.
- **Spacing**: `xs`, `sm`, `md`, `lg`, `xl`.
- **Radius**: `sm`, `md`, `lg`, `xl`, `round`.
- **Shadow**: `card`, `hero`.

**Utilizzo**:
I componenti importano `UI` da `Screen` e usano es. `UI.colors.primary`.
Tuttavia, ci sono molti stili inline o costanti di colore hardcoded (es. `#22c55e` ACTION_GREEN) sparsi in `App.tsx` e altre schermate.
