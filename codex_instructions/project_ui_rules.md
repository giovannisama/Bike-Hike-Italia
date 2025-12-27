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
