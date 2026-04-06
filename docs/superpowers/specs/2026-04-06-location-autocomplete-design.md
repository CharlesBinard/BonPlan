# Location Autocomplete — Design Spec

**Date**: 2026-04-06
**Status**: Approved

## Overview

Ajouter un autocomplete de localisation au formulaire de création de recherche, en remplacement du champ texte libre actuel. Le composant est réutilisable et peut être intégré partout dans l'app.

## Architecture

### Approche retenue : Proxy API Gateway

Le frontend appelle un endpoint proxy sur le gateway, qui forward vers l'API gratuite du gouvernement français (`data.geopf.fr/geocodage/search/`). Pas d'appel direct depuis le front vers l'API externe.

**Pourquoi** : découplage du provider, pas de CORS, possibilité d'ajouter du cache plus tard.

## Backend

### Nouvel endpoint

```
GET /api/geocode/search?q=paris&limit=5
```

- **Fichiers** : `packages/gateway/src/routes/geocode/geocode.routes.ts` + `geocode.handlers.ts`
- **Monté dans** : `packages/gateway/src/app.ts` sur `/api/geocode`
- **Auth** : derrière le middleware auth existant (rate limit 100 req/60s par user)
- **Proxy vers** : `https://data.geopf.fr/geocodage/search/?q=...&type=municipality&limit=5`
- **Timeout** : 5 secondes (AbortSignal)
- **Validation** : `q` string min 2 chars, `limit` int 1-10 default 5

**Schéma de réponse** :

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

### Nouveaux champs DB

Table `searches` — 2 colonnes ajoutées :
- `latitude` : `real`, nullable
- `longitude` : `real`, nullable

Migration Drizzle à générer.

### Adaptation schemas

- **Gateway** `createSearchSchema` : ajouter `latitude` (number, optional, nullable) et `longitude` (number, optional, nullable)
- **Frontend** `searchCreateSchema` : idem

### Adaptation orchestrator

Dans `on-search-created.ts` :
- Si `search.latitude` et `search.longitude` sont présents → skip `geocodeCity()`, construire `GeocodedLocation` directement depuis les valeurs DB
- Sinon → fallback sur le geocoding existant (rétro-compatibilité pour les recherches déjà créées)

## Frontend

### Composant `LocationAutocomplete`

**Fichier** : `packages/frontend/src/components/ui/location-autocomplete.tsx`

**Type de valeur** :

```ts
type GeocodedLocation = {
  city: string;
  postcode: string;
  latitude: number;
  longitude: number;
};
```

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
- Navigation clavier : flèches haut/bas, Enter pour sélectionner, Escape pour fermer
- Spinner dans l'input pendant le chargement
- Après sélection : input affiche `"Ville (code postal)"`, bouton X pour effacer
- Effacer → `onChange(null)`
- Click outside → ferme le dropdown
- Réutilise le style du composant `Input` existant (@base-ui/react)

### Hook `useLocationSearch`

**Fichier** : dans le même fichier que le composant ou un fichier hooks dédié

```ts
function useLocationSearch(query: string): {
  results: GeocodedLocation[];
  isLoading: boolean;
}
```

- Gère le debounce (300ms)
- Appelle `GET /api/geocode/search?q=...&limit=5`
- Retourne un tableau vide si query < 2 chars
- Utilise `fetch` directement (pas besoin d'Orval pour un endpoint simple)

### Intégration `SearchCreateDialog`

**Fichier** : `packages/frontend/src/routes/SearchesPage.tsx`

Changements :
- `useState<string>("")` pour location → `useState<GeocodedLocation | null>(null)`
- `<Input>` location → `<LocationAutocomplete>`
- `onSubmit` : envoyer `location: selectedLocation?.city ?? ""` + `latitude` + `longitude`
- Validation : `locationValid = nationWide || selectedLocation !== null`
- Aperçu : afficher `"Paris (75001)"` au lieu du texte brut
- Reset : `setSelectedLocation(null)`
- Toggle "Toute la France" : masque le composant (comportement actuel conservé)

## Ce qui ne change PAS

- Le geocoding service dans l'orchestrator reste en place (fallback)
- Le `lbc-url-builder.ts` ne change pas (il reçoit toujours un `GeocodedLocation`)
- Les recherches existantes continuent de fonctionner sans coordonnées
- Le toggle "Toute la France" garde le même comportement (masque le champ)
