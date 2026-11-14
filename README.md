# Repères Immo

Outil local de recherche de profils pour les conseillers immobiliers SAFTI et iad. La démonstration contient 12 profils fictifs et fonctionne sans clé ni accès réseau.

## Démarrer

Prérequis unique, Node.js 22 ou ultérieur. Dans le dossier du projet, lancez `npm start`, puis ouvrez [Repères Immo](http://localhost:3000/).

Pour essayer le parcours, saisissez **Bordeaux** dans Ville, choisissez **Bordeaux (33)**, activez **Ouvert aux opportunités**, puis cliquez sur **Lancer la recherche**. La démo affiche deux profils.

## Brancher Apify et Gemini

1. Ouvrez **Connexions**, collez la clé API Apify et, si vous souhaitez obtenir des suggestions de métiers, la clé API Gemini.
2. Cliquez sur **Enregistrer les connexions**. Les clés saisies dans l’interface restent en mémoire jusqu’à l’arrêt du serveur. Le panneau permet aussi de les retirer.
3. Dans **Source**, sélectionnez **LinkedIn via Apify**, renseignez vos critères et cliquez sur **Lancer la recherche**.
4. Pour Gemini, renseignez **Métier** ou **Mots-clés**, cliquez sur **Suggérer des métiers proches**, puis sélectionnez les intitulés qui élargissent votre recherche. Seuls les critères métier sont envoyés à Gemini.

Pour garder les clés entre deux lancements, copiez `.env.example` en `.env`, renseignez `APIFY_API_TOKEN` et/ou `GEMINI_API_KEY`, puis redémarrez. Le fichier `.env` est ignoré par Git. Le serveur écoute sur l’interface locale.

## Recherche et limites

- Les expressions séparées par une virgule sont des alternatives. Les métiers ajoutés via les suggestions élargissent le critère de métier. Les critères de localisation et de disponibilité se cumulent.
- Le filtre « Ouvert aux opportunités » exige `openToWork: true` dans les données de la source. Les fiches distinguent un badge absent d’un statut non renseigné.
- L’Actor par défaut est `harvestapi/linkedin-profile-search`, en mode **Full**, avec un plafond de 40 profils examinés par recherche et un délai d’exécution de 150 secondes côté Actor. Les exécutions réelles sont facturées selon les conditions de votre compte Apify et de l’Actor. L’identifiant est modifiable pour un Actor qui utilise le même schéma. Pour un schéma différent, adaptez `actorInput` et `normalizeProfile` dans `lib/providers.mjs`. [Schéma d’entrée de l’Actor](https://apify.com/harvestapi/linkedin-profile-search/input-schema) · [Exemple de résultat de l’Actor](https://apify.com/harvestapi/linkedin-profile-search)
- Le filtre géographique live dépend des localisations reconnues par la source. Apify reçoit la zone la plus précise choisie. Le moteur vérifie ensuite la ville, le département et la région avec les données disponibles. Une commune homonyme sans localisation assez précise peut être exclue d’une recherche par département.
- Le référentiel local couvre 18 régions, 101 départements et les communes fournies par l’API Découpage administratif. [Source du référentiel](https://geo.api.gouv.fr/decoupage-administratif/communes)
- Le modèle Gemini est configurable. Les résultats LinkedIn sont gardés en mémoire pendant cinq minutes après la recherche pour permettre à l’interface de les lire. [API Gemini](https://aistudio.google.com/api-reference/generate-content)

## Fichiers principaux

| Fichier | Rôle |
| --- | --- |
| `PROMPT-CONSTRUCTION.md` | Prompt réutilisable pour reproduire ou faire évoluer l’outil |
| `server.mjs` | Serveur local, configuration mémoire, suivi des recherches |
| `lib/providers.mjs` | Adaptateurs Apify et Gemini |
| `lib/search.mjs` | Validation, géographie, filtrage et dédoublonnage |
| `public/` | Écran de recherche et panneau Connexions |
