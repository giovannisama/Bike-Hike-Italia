# 04 - Piano Azioni P0-P3

## Backlog Prioritizzato

1.  **(P0) Security Audit Fix**: Risolvere vulnerabilità npm.
2.  **(P1) Clean Code & Perf**: Rimuovere `console.log` e dead code.
3.  **(P2) Type Hardening**: Sostituire `any` con tipi reali per date Firestore.
4.  **(P2) Navigation Refactor**: Estrarre logica da `App.tsx`.
5.  **(P3) UI Standardization**: Centralizzare colori e rimuovere stili inline duplicati (es. `ACTION_GREEN`).

---

## Piano in 3 Ondate

### 🌊 ONDA 1: Sicurezza e Pulizia Immediata (Quick Wins)
*Obiettivo: Mettere in sicurezza la codebase e migliorare la DX senza rischi strutturali.*

1.  **Fix NPM Audit**
    - `npm audit fix`
    - Check build iOS/Android.
2.  **Rimozione Console Logs**
    - Search & Destroy `console.log` in `src/`.
    - Sostituire con commenti o `if (__DEV__)` se strettamente necessari.
3.  **Fix Typo/Lint residui**
    - Verificare che non ci siano altri duplicate identifier in `App.tsx` (già fatto parzialmente).

### 🌊 ONDA 2: Refactoring Strutturale (Medium Term)
*Obiettivo: Migliorare manutenibilità di `App.tsx`.*

1.  **Extract `MainTabs`**
    - Spostare il componente `MainTabs` da `App.tsx` a `src/navigation/MainTabs.tsx`.
2.  **Extract `AdminGate`**
    - Spostare in `src/components/AdminGate.tsx` o `src/navigation/guards/`.
3.  **Type Hardening Firestore**
    - Definire `interface FirestoreDate { seconds: number; nanoseconds: number; }` (o usare import SDK) e sostituire `any` in `src/types/firestore.ts`.

### 🌊 ONDA 3: UI Polish & Features (Long Term)
*Obiettivo: Coerenza visiva e feature mancanti.*

1.  **Design System Tokenization**
    - Sostituire tutte le occorrenze di `#22c55e` con `UI.colors.actionGreen` (da aggiungere al tema).
2.  **Refactor `CreateRideScreen`**
    - Implementare i TODO presenti: estrarre validazione e sottocomponenti.
3.  **Error Boundaries**
    - Implementare boundary globale per catturare crash UI gracefuly.

---

## Nota sui File Toccati (Onda 1)
- `package-lock.json`
- `src/**/*.tsx` (solo rimozione log)
- `src/**/*.ts` (solo rimozione log)
