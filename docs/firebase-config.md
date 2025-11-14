# Firebase configuration files

The native iOS and Android projects require the Firebase configuration blobs that the Firebase console generates for the `bike-hike-italia` project.

- `ios/GoogleService-Info.plist`: copy the original file that contains the API key into `ios/`. This repo keeps an example at `ios/GoogleService-Info.plist.example`, so you can copy that and replace the `API_KEY` field with the one from the console.
- `android/app/google-services.json`: similarly, download the JSON file from the Firebase console, place it into `android/app/`, and keep it out of source control (it is already ignored).

Because these files expose API keys, do not check them in. Regenerate or revoke keys if they are accidentally committed or leaked.
