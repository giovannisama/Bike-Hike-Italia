# UI Standardization Rules

Questo documento rappresenta la **fonte unica di verità** per i componenti UI standardizzati nel progetto **Bike-Hike-Italia**.

## 1. Status Badges
Usati per indicare lo stato di un Ride (Ciclismo).

### Dimensioni Comuni
Tutti i status badges devono condividere queste dimensioni esatte per allinearsi con gli altri badge nelle liste.

- **Font Size**: `12`
- **Font Weight**: `700` (Bold)
- **Vertical Padding**: `4`
- **Horizontal Padding**: `8`
- **Border Radius**: `6`
- **Border Width**: `1` (Colore uguale allo sfondo)

### Varianti

| Status     | Text Label  | Background Color | Text Color   | Icon (Ionicons)       |
|------------|-------------|------------------|--------------|-----------------------|
| **Active** | `ATTIVA`    | `#DCFCE7` (Green-100) | `#15803D` (Green-700) | `radio-button-on` |
| **Archived** | `ARCHIVIATA` | `#F1F5F9` (Slate-100) | `#475569` (Slate-600) | `archive-outline` |
| **Cancelled** | `ANNULLATA` | `#FEE2E2` (Red-100) | `#B91C1C` (Red-700) | `alert-circle-outline` |

## 1.b Event Categories – Social

La categoria **Social** utilizza un colore dedicato per essere chiaramente distinguibile dalle altre categorie Eventi.

### Colore di riferimento
- **Token UI**: `UI.colors.eventSocial`
- **Hex**: `#7C3AED` (Purple-600)

### Utilizzo obbligatorio
Il colore `UI.colors.eventSocial` deve essere utilizzato per:
- bordo superiore della card "Social" nella sezione Eventi
- icona associata alla categoria Social
- eventuali badge o indicatori di categoria Social

### Regole vincolanti
- Vietato usare valori hardcoded (`#7C3AED`) nei componenti
- Vietato riutilizzare colori di altre categorie (es. Action Green, Red)
- Ogni nuova UI relativa a Eventi Social deve usare esclusivamente questo token

## 2. Difficulty Badges
Mostra il livello di difficoltà tecnica. Usa uno stile minimalista **"Dot + Text"** (senza box di sfondo).

### Dimensioni
- **Layout**: Row, Gap `6px`, Items Center
- **Dot Size**: `6px x 6px` (Radius `3px`)
- **Text**: `fontSize: 12`, `fontWeight: "600"`, Color: `#64748B` (Slate-500)
- **Background**: Trasparente

### Varianti (Logica & Colori)
Il colore è determinato controllando se la stringa di difficoltà contiene parole chiave specifiche (case-insensitive).

| Logica / Keywords          | Color Name    | Hex Code  | Significato Visuale    |
|----------------------------|---------------|-----------|------------------------|
| **"facile"**              | Action Green | `UI.colors.action` | Facile / Principiante |
| **"medio"**, **"moderato"** | Orange-500   | `#f97316` | Intermedio            |
| **"difficile"**, **"impegnativo"** | Red-500 | `#ef4444` | Difficile / Esperto   |
| **"estremo"**             | Black        | `#000000` | Estremo               |
| **(Default / Altro)**     | Slate-400    | `#94a3b8` | Non definito / Scala  |

### Utilizzo
- Usa `<DifficultyBadge level={difficulty} />`
- **NON** stilare manualmente con View libere.

## 3. User Role Badges (Admin)
Indica i permessi utente.

- **Dimensioni**: Uguali ai Status Badges (Font `12`, Px `8`, Py `4`, Radius `6`).
- **Owner**: Bg Nero (`#1c1917`), Testo Bianco.
- **Admin**: Bg Slate-200 (`#e2e8f0`), Testo Slate-800 (`#1e293b`).
- **Member**: Bg Slate-50 (`#f8fafc`), Testo Slate-500 (`#64748b`).

## 4. User Status Badges (Admin)
Indica lo stato dell'account.

- **Dimension

## 5. Tabs / Segmented (STANDARD UNICO)
Usare **solo** il pattern standard "Segmented Tabs" del Profilo. Non esiste (al momento) un componente shared: lo standard è il **PATTERN** implementato inline in `ProfileScreen.tsx`. Vietato creare segmented custom o usare altre implementazioni se non strettamente necessario.

### Riferimenti obbligatori
- **Standard canonico**: `src/screens/ProfileScreen.tsx` (tabs "Dati Personali / Documenti / Sicurezza")
- **Target adozione**: `src/screens/UsciteList.tsx` (Tabs "Attive/Archiviate")
- **Target adozione**: `src/screens/admin/UserListScreen.tsx` (Tabs "Attivi/Disattivi/In attesa")

### Regola vincolante
Ogni tab di navigazione top-level (2–3 tab) deve usare questo pattern. È vietato creare segmented custom o usare componenti alternativi.

### API / Parametri attesi (pattern)
- **items/labels**: elenco di tab (2-3 voci).
- **activeKey**: stato attivo (string union).
- **onChange**: handler per cambio tab (set state).
- **badge/count**: opzionale; se presente, renderizzato nel label senza cambiare layout base.

### Styling vincolante (da pattern sorgente)
- **Container**: row con background `UI.colors.card`, radius `999`, padding `4`, marginBottom `16`.
- **Tab**: `flex: 1`, `borderRadius: 999`, `paddingVertical: 10`, align center.
- **Active**: background `UI.colors.action`, testo `#fff`.
- **Inactive**: background trasparente, testo `UI.colors.muted`, fontWeight `600`.

### Do / Don't
- **DO**: riusare il pattern esistente del Profilo copiando struttura + stili.
- **DO**: usare solo i token e valori già presenti nel pattern.
- **DON'T**: introdurre colori hardcoded, layout custom, tab con altezze diverse, o segmented nuovi non allineati.

### Esempi conformi
- Profilo (Dati Personali / Documenti / Sicurezza)
- Ciclismo – Elenco Uscite
- Amministrazione – Gestione Utenti

### Casi esclusi
- segmented usati come input di form (es. tipo certificato)
- pill filters o multi-select

### Non-regression
Ogni sostituzione è **UI-only**: logica di stato/handler invariata.

## Event Categories – Subtitles (Home + Eventi)

Sottotitoli standard ufficiali (da riusare ovunque):

- **Ciclismo**: "Uscite di gruppo"
- **Trekking**: "Escursioni a piedi"
- **Social**: "Meetup e eventi"

Regole vincolanti:
- Vietato cambiare copy o inventare varianti per singola screen.
- Vietato hardcodare stringhe diverse in Home o EventiHub.
- Ogni nuova categoria Eventi dovrà definire qui il proprio sottotitolo.

## Participant Counter – Standard (Cards)

Il contatore partecipanti nelle card deve essere identico al pattern delle Uscite:
- pill in basso a sinistra
- icona “due persone”
- SOLO numero (vietato testo “partecipanti”)
- riusare lo stesso componente/stile delle Uscite
- vietato creare varianti per Social o altre sezioni
