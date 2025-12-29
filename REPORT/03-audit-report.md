# 03 - Audit Report

## 1. Executive Summary
L'applicazione **Bike & Hike Italia** presenta una struttura solida basata su **Expo** e **Firebase**. L'architettura di navigazione è stata recentemente rifattorizzata per semplificare la UX (rimozione EventiHub, integrazione Profilo in Tab), ma `App.tsx` rimane monolitico e incline a errori di "copia-incolla".
La sicurezza è ben gestita tramite **Firestore Rules** granulari e controlli lato client (`AdminGate`).
I principali debiti tecnici sono:
1.  **Strictness TypeScript**: Uso eccessivo di `any` nel data layer.
2.  **Clean Code**: Molti `console.log` di debug in produzione e stili inline/colori hardcoded.
3.  **Dependency Risk**: Versioni di Expo/React Native apparentemente "bleeding edge" (SDK 54 / RN 0.81) che potrebbero causare instabilità con librerie terze non aggiornate.

## 2. Findings Table

| ID | Area | Sev | Sintomo | Root Cause | Fix Incrementale | Rischio | Verifica |
|:---|:---|:---:|:---|:---|:---|:---:|:---|
| **F-01** | Deps | **P1** | 4 Vulnerabilità npm (glob, node-forge) | Dipendenze transitive non aggiornate | `npm audit fix` | Basso | Build & Run |
| **F-02** | DX | P2 | `App.tsx` > 1200 righe | Navigazione definita in un unico file gigante | Estrarre stack in `src/navigation/RootNavigator.tsx` | Medio (Nav) | Smoke Test Nav |
| **F-03** | Perf | P2 | Logs attivi in produzione | `console.log` sparsi nel codice | Rimuovere/Commentare log o usare Logger custom | Basso | Grep |
| **F-04** | Types | P2 | Perdita type safety date | Uso di `any` per Timestamp in `firestore.ts` | Definire tipo `FirestoreTimestamp` | Basso | TSC check |
| **F-05** | UI | P3 | Inconsistenza Colori | Uso di `#22c55e` vs `UI.colors` | Centralizzare tutto in `Screen.tsx` | Basso (Visual) | Check visivo |
| **F-06** | Feat | P3 | TODOs nel codice | Commenti "TODO" non risolti per refactoring | Pianificare refactoring `CreateRideScreen` | Medio | N/A |

## 3. Focus Areas

### Navigazione
La navigazione è il punto più critico. Il file `App.tsx` funge da router, gestore di auth state, gestore di deep linking (implicito) e contenitore di logica UI globale.
**Raccomandazione**: Splittare `App.tsx`. Spostare `MainTabs` e component ausiliari (`AdminGate`, `TabLabel`) in file dedicati in `src/navigation`.

### Stabilità Android vs iOS
È stato lavorato molto sul **Calendario** Android (`forceSixWeeks`, layout fixes).
Verificare che l'effetto "3D" recente sulle card (`elevation: 8`) su Android non crei ombre troppo pesanti o clipping, dato che Android gestisce le ombre diversamente da iOS (`shadowOffset/Opacity`).

### Firestore Rules & AuthZ
Le regole (`firestore.rules`) sono ben scritte, usando funzioni helper (`isOwner`, `approvedIsTrue`).
**Punto di attenzione**: La regola `allow update` su `users/{uid}` per `expoPushTokens` permette all'utente di scrivere. Assicurarsi che `request.resource.data.diff` sia sufficiente a prevenire sovrascritture di campi sensibili (sembra corretto: `hasOnly(["expoPushTokens"])`).

### Error Handling
Manca un meccanismo globale di **Error Boundary**. Se un componente crasha (es. render error), l'app potrebbe chiudersi inaspettatamente.
**Raccomandazione**: Introdurre un Error Boundary React standard o usare `sentry-expo` se previsto in futuro.

### Performance
I log in console durante eventi frequenti (es. scroll liste, update calendario) possono causare lag sul thread JS, specialmente su Android entry-level. La rimozione è prioritaria.
