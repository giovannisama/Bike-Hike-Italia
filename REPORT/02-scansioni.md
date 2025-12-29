# 02 - Scansioni Automatiche

## 1. Vulnerabilità Dipendenze (`npm audit`)

**Stato**: ⚠️ **WARNING**
Sono state rilevate **4 vulnerabilità** nel file `package-lock.json`.

| Severità | Pacchetto | Problema |
| :--- | :--- | :--- |
| **HIGH** | `glob` | Command injection (CLI) |
| **HIGH** | `node-forge` | ASN.1 Recursion / Validator Issues |
| MODERATE | `js-yaml` | Prototype Pollution |
| MODERATE | `tar` | Race condition (uninitialized memory) |

**Raccomandazione**: Eseguire `npm audit fix` per aggiornare le dipendenze annidate compatibili. Trattandosi di dipendenze transitive spesso usate da tool di build, il rischio runtime su app mobile (bundle JS hermes) è spesso mitigato, ma va risolto per sicurezza CI/CD.

## 2. Code Smells (`grep`)

### Console Logs
Trovate circa **20 occorrenze** di `console.log` nel codice sorgente di produzione.
Files coinvolti:
- `src/screens/calendar/CalendarHeaderSection.tsx`
- `src/screens/RideDetails.tsx` (Gestione errori notifiche)
- `src/screens/SocialEditScreen.tsx` (Debug scrittura DB)
- `src/screens/UsciteList.tsx`
- `src/screens/SocialListScreen.tsx`
- `src/notifications/registerPushToken.ts` (Logica push molto verbosa)

**Impatto**: Performance (bridge overhead su Native), sicurezza (possibile leak dati in logcat/xcode console).

### TODO / FIXME
Trovati **6 TODO** rilevanti:
- `CreateRideScreen.tsx`: Suggerimenti di refactoring (estrazione logica validazione, suddivisione UI).
- `ProfileScreen.tsx`: Rifattorizzazione logica FaceID in hook condiviso, suddivisione componenti tab.

### Tipi Deboli (`any`)
Uso diffuso di `any` in `src/types/firestore.ts`, specialmente per i campi Timestamp (`createdAt`, `updatedAt`, `date`).
- `[key: string]: any`
- `createdAt?: any`

**Impatto**: Riduce l'efficacia di TypeScript nel prevenire errori di runtime su date e oggetti complessi.

### Native / Dangerous
- Nessun uso di `dangerouslySetInnerHTML` rilevato.

## 3. Configurazione & Ambiente
- **Node**: v20.19.5 (LTS recente, ottimo)
- **Expo**: v54 (Beta/Preview o molto recente? Expo SDK attuali sono 50/51/52. Verifica versione SDK in package.json: `expo: ~54.0.10` suggerisce SDK 54, che è bleeding edge/canary o una versione futura, `react-native: 0.81.4` è molto avanti). *Nota: Potrebbe essere un typo nel report o un uso di versione "nightly". Expo 52 usa RN 0.76. RN 0.81 non è standard Expo stabile attuale.*

*Verifica manuale versioni*:
- `react-native`: 0.81.4
- `expo`: ~54.0.10
**Attenzione**: Queste versioni sembrano molto avanzate (oltre SDK 52). Verificare stabilità e compatibilità librerie.

## 4. Analisi Statica Navigazione
Identificati potenziali problemi risolti di recente:
- `Amministrazione` screen era duplicato in `App.tsx`. (Fixato in audit precedente).
- `NotificationSettings` duplicato in `App.tsx` (Fixato in audit precedente).
- Doppia dichiarazione `ACTION_GREEN` in `App.tsx` (Fixato in audit precedente).

Attualmente la struttura sembra corretta, ma la "pulizia" del codice in `App.tsx` (1400 righe) è prioritaria per evitare regressioni future.
