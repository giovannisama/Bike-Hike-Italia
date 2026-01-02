# Dependency Audit (depcheck)

Run:

```bash
npx depcheck --json
```

## Results

### Unused dependencies (reported)
- expo-screen-orientation
- expo-status-bar
- react-native-autolink
- react-native-screens

### Unused devDependencies (reported)
- @react-native-community/cli
- @react-native/metro-config

### Missing dependencies (reported)
- expo-file-system (used in `src/utils/saveImageToDevice.ts`)

## Notes / Recommendations
- Non ho rimosso alcuna dipendenza in questa PR.
- Verificare manualmente gli unused per evitare falsi positivi (Expo spesso usa `react-native-screens`).
- Aggiungere `expo-file-system` alle dependencies se `saveImageToDevice` viene usato in produzione.
