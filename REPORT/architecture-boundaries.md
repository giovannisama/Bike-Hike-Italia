# Architecture Boundaries (ONDA 10)

## Boundaries and responsibilities
- domain: pure business rules and types. No side effects, no IO.
- data: Firebase/Firestore integrations, IO mappers, network or storage.
- ui: reusable UI components, presentational logic only.
- navigation: navigators, route config, and navigation wiring.
- utils: cross-cutting helpers (date, formatting, small pure helpers).
- app: bootstrap and app-level wiring (providers, App.tsx).

## Import rules
- domain must not import from data or ui.
- data can import from domain and utils.
- ui can import from domain and utils, but not directly from data.
- navigation can import from ui and domain.
- app can import from all layers.

## Examples
Allowed:
- ui -> domain (types, pure validation)
- data -> domain (types, pure mappers)
- navigation -> ui

Not allowed:
- ui -> data (call a Firestore helper directly)
- domain -> data or ui
- utils -> ui (no UI dependencies in utils)

## Notes
- Calendar is out of scope for ONDA 10: do not change calendar files.
- Refactor is mechanical: move files and update imports only.
