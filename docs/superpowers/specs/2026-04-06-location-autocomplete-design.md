# Location Autocomplete — Design Spec

**Date**: 2026-04-06
**Status**: Approved (rev 2 — post-review)

## Overview

Ajouter un autocomplete de localisation au formulaire de création de recherche, en remplacement du champ texte libre actuel. Le composant est réutilisable et peut être intégré partout dans l'app.

## Architecture

### Approche retenue : Proxy API Gateway

Le frontend appelle un endpoint proxy sur le gateway, qui forward vers l'API gratuite du gouvernement français (`data.geopf.fr/geocodage/search/`). Pas d'appel direct depuis le front vers l'API externe.

**Pourquoi** : découplage du provider, pas de CORS, possibilité d'ajouter du cache plus tard.

### Type partagé

Le type `GeocodedLocation` est défini dans `@bonplan/shared` pour être utilisé par le frontend et l'orchestrator :

```ts
type GeocodedLocation = {
  city: string;
  postcode: string;
  latitude: number;
  longitude: number;
};
```

## Backend

### Nouvel endpoint

```
GET /api/geocode/search?q=paris&limit=5
```

- **Fichiers** : `packages/gateway/src/routes/geocode/geocode.routes.ts` + `geocode.handlers.ts`
- **Monté dans** : `packages/gateway/src/app.ts` sur `/api/geocode`
- **Auth** : derrière le middleware auth existant (rate limit global 100 req/60s par user)
- **Proxy vers** : `https://data.geopf.fr/geocodage/search/?q=...&type=municipality&limit=5` (le paramètre `type` est hardcodé, non exposé au client)
- **Timeout** : 5 secondes (AbortSignal)
- **Validation** : `q` string min 2 chars max 200 chars (URL-encoded avant forward), `limit` int 1-10 default 5
- **Route OpenAPI** : utiliser `createRoute` + `@hono/zod-openapi` comme les autres routes

**Schéma de réponse (200)** :

```ts
{
  results: Array<{
    city: string;      // "Paris"
    postcode: string;  // "75001"
    latitude: number;  // 48.8566
    longitude: number; // 2.3522
  }>
}
```

**Réponses erreur** :
- `200` avec `{ results: [] }` si aucun résultat (pas d'erreur)
- `422` si validation échoue (q trop court, limit invalide)
- `502` si l'API upstream est down, timeout, ou retourne des données invalides — corps : `{ error: "Geocoding service unavailable" }`

### Nouveaux champs DB

Table `searches` — 3 colonnes ajoutées :
- `postcode` : `text`, nullable
- `latitude` : `doublePrecision`, nullable
- `longitude` : `doublePrecision`, nullable

**Contraintes CHECK** :
- `latitude IS NULL OR latitude BETWEEN -90 AND 90`
- `longitude IS NULL OR longitude BETWEEN -180 AND 180`
- `(latitude IS NULL) = (longitude IS NULL)` (both-or-neither)

Migration Drizzle à générer.

### Adaptation schemas

- **Gateway** `createSearchSchema` : ajouter `postcode` (string, optional, nullable), `latitude` (number, optional, nullable) et `longitude` (number, optional, nullable)
- **Frontend** `searchCreateSchema` : idem

### Adaptation orchestrator

Dans `on-search-created.ts` :
- Si `search.latitude` et `search.longitude` sont présents et valides (non `(0,0)`, dans le bounding box France `lat: [41,52], lng: [-5,10]`) → skip `geocodeCity()`, construire `GeocodedLocation` depuis `{ city: search.location, postcode: search.postcode, latitude: search.latitude, longitude: search.longitude }`
- Sinon → fallback sur le geocoding existant (rétro-compatibilité pour les recherches déjà créées)

## Frontend

### Composant `LocationAutocomplete`

**Fichier** : `packages/frontend/src/components/ui/location-autocomplete.tsx`

**Base** : construit sur `@base-ui/react/combobox` (déjà installé). Fournit accessibilité ARIA (combobox, listbox, option), keyboard nav complète (flèches, Enter, Escape, Tab, Home/End), focus management, et click-outside — le tout gratuitement.

**Props** :

```ts
type LocationAutocompleteProps = {
  value: GeocodedLocation | null;
  onChange: (location: GeocodedLocation | null) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
};
```

**Comportement** :

- Debounce de 300ms avant d'appeler l'API
- Minimum 2 caractères pour déclencher la recherche
- Dropdown avec max 5 suggestions, chacune affichant `"Ville (code postal)"` avec icône pin
- Après sélection : input affiche `"Ville (code postal)"`, bouton X pour effacer
- **Edit après sélection** : tout keystroke après une sélection clear la valeur (`onChange(null)`) et utilise le texte tapé comme nouvelle requête
- **Clear (X)** : efface le texte et la valeur, remet le focus dans l'input, ne rouvre pas le dropdown
- **Empty state** : affiche `"Aucun résultat"` dans le dropdown quand l'API retourne 0 résultats
- **Erreur API** : affiche `"Erreur de recherche"` dans le dropdown en cas de 502/timeout
- **Touch** : items du dropdown avec min-height 44px pour les cibles touch mobiles
- Réutilise le style du composant `Input` existant pour l'apparence de l'input

### Hook `useLocationSearch`

**Fichier** : dans le même fichier que le composant

```ts
function useLocationSearch(debouncedQuery: string): {
  results: GeocodedLocation[];
  isLoading: boolean;
}
```

- Utilise **TanStack Query** (`useQuery`) avec `queryKey: ['geocode', debouncedQuery]` et `enabled: debouncedQuery.length >= 2`
- Appelle via le `customFetch` existant (cohérence : base URL, credentials, 401 handling)
- Le debounce (300ms) est géré dans le composant avec un state `debouncedQuery` (via `useEffect` + `setTimeout`)
- TanStack Query gère automatiquement : cache, race conditions (stale queries), cleanup on unmount, deduplication

### Intégration `SearchCreateDialog`

**Fichier** : `packages/frontend/src/routes/SearchesPage.tsx`

Changements :
- `useState<string>("")` pour location → `useState<GeocodedLocation | null>(null)`
- `<Input>` location → `<LocationAutocomplete>`
- `onSubmit` : envoyer `location: selectedLocation?.city ?? ""` + `postcode` + `latitude` + `longitude`
- Validation : `locationValid = nationWide || selectedLocation !== null`
- **Erreur inline** : si l'user tape du texte sans sélectionner et submit → afficher `"Sélectionnez une ville dans la liste"`
- Aperçu : afficher `"Paris (75001)"` au lieu du texte brut
- Reset : `setSelectedLocation(null)`
- Toggle "Toute la France" OFF → auto-focus sur le champ autocomplete
- Toggle "Toute la France" ON → masque le composant (comportement actuel conservé)

## Ce qui ne change PAS

- Le geocoding service dans l'orchestrator reste en place (fallback)
- Le `lbc-url-builder.ts` ne change pas (il reçoit toujours un `GeocodedLocation`)
- Les recherches existantes continuent de fonctionner sans coordonnées
- Le toggle "Toute la France" garde le même comportement (masque le champ)
