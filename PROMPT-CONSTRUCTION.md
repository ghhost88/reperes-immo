# Prompt de construction — Repères Immo

Crée une application locale en français appelée Repères Immo pour aider les conseillers SAFTI et iad à repérer des profils professionnels selon leurs critères. Livre le code complet de l’interface et du serveur, un fichier `.env.example` et un guide de démarrage. Utilise Node.js 22+, HTML, CSS et JavaScript natifs pour permettre un démarrage avec `npm start`.

## Interface

- Place le formulaire « Critères de recherche » à gauche et les résultats à droite sur ordinateur. Sur mobile, empile les deux zones. Privilégie des libellés visibles, une navigation clavier et des retours d’état clairs.
- Prévois les champs **Mots-clés**, **Métier**, **Région**, **Département** et **Ville**. Les expressions séparées par une virgule sont des alternatives. Filtre la liste des départements par région et propose des communes avec leur code de département pour distinguer les homonymes.
- Ajoute le filtre **Ouvert aux opportunités** et laisse-le désactivé au départ. Affiche clairement un statut déclaré, un badge absent ou une information indisponible.
- Ajoute les sources **Démo · profils fictifs** et **LinkedIn via Apify**, avec la démo sélectionnée à l’ouverture. Place un bouton principal **Lancer la recherche** et une action **Effacer**.
- Affiche le nom, le métier ou l’accroche, la ville, le département et la région lorsque disponibles, les compétences remontées par la source, le statut et un lien LinkedIn valide pour les résultats réels. Identifie clairement les données fictives. Prévois les états de chargement, d’erreur et de liste vide.

## Serveur et intégrations

- Écoute sur `127.0.0.1` et sers le front et l’API depuis la même origine. Valide et borne les entrées. Place les clés Apify et Gemini dans un panneau **Connexions**, avec saisie masquée, possibilité de retrait et statut « Clé renseignée ». Transmets les clés au serveur local, conserve-les en mémoire et accepte aussi les variables serveur `APIFY_API_TOKEN` et `GEMINI_API_KEY`. Expose uniquement l’état de configuration au navigateur.
- Isole l’adaptateur Apify. Pour `harvestapi/linkedin-profile-search`, utilise le schéma documenté pour les mots-clés, les intitulés et la localisation, limite la recherche à 40 profils, suis l’exécution en arrière-plan et lis le jeu de résultats une fois terminé. Permets de configurer l’Actor via `APIFY_ACTOR_ID`. Gère proprement les refus du fournisseur, les délais dépassés et les réponses inattendues.
- Normalise et dédoublonne les résultats, puis vérifie les contraintes géographiques locales. Déduis un département depuis la commune seulement lorsque la correspondance est suffisamment précise. Pour le filtre « Ouvert aux opportunités », exige un booléen explicite `openToWork: true`. Garde les profils retournés en mémoire le temps de l’affichage.
- Isole l’adaptateur Gemini derrière un endpoint dédié. Quand le conseiller clique sur **Suggérer des métiers proches**, envoie uniquement le métier et les mots-clés au modèle, demande jusqu’à cinq intitulés en JSON et valide la réponse. Affiche les propositions avec sélection explicite. Chaque intitulé sélectionné devient une alternative au métier d’origine. En mode sans clé Gemini, propose quelques exemples de démonstration clairement identifiés.
- Prévois un jeu de profils fictifs couvrant plusieurs métiers, régions, communes et statuts. Réutilise la validation et le filtrage géographique pour les deux sources.

## Critères de recette

- L’application démarre sans clés et la démo affiche des profils fictifs.
- La recherche « Bordeaux (33) » avec « Ouvert aux opportunités » actif renvoie uniquement les profils de démonstration qui remplissent ces deux conditions.
- Le bouton de recherche fonctionne au clavier. Un changement de région actualise la liste des départements et l’autocomplétion des villes respecte la zone sélectionnée.
- Les clés restent invisibles dans les réponses de l’API locale. Le bouton d’enregistrement conserve la configuration pendant la session et le retrait est possible.
- Les intégrations se testent avec des réponses simulées, puis avec les clés du propriétaire quand il les aura fournies. Mentionne dans la livraison la partie vérifiée et les limites de couverture de la source.
