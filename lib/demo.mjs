export const demoProfiles = [
  ['Camille Delaunay', 'Conseillère immobilier', 'Bordeaux', '33', true, ['Transaction', 'Prospection', 'Vente']],
  ['Julien Morel', 'Responsable commercial', 'Lyon', '69', true, ['Vente', 'Management', 'B2B']],
  ['Sarah Fontaine', 'Gestionnaire locative', 'Nantes', '44', null, ['Location', 'Gestion de biens']],
  ['Thomas Rivière', 'Négociateur immobilier', 'Toulouse', '31', true, ['Transaction', 'Estimation', 'Vente']],
  ['Inès Garnier', 'Conseillère clientèle', 'Bordeaux', '33', true, ['Vente', 'Prospection', 'Relation client']],
  ['Hugo Leclerc', 'Courtier en prêt immobilier', 'Lille', '59', false, ['Financement', 'Négociation']],
  ['Léa Masson', 'Mandataire immobilier', 'Mérignac', '33', null, ['Transaction', 'Estimation']],
  ['Mehdi Laurent', 'Commercial terrain', 'Marseille', '13', true, ['Prospection', 'Vente', 'B2B']],
  ['Élodie Marchal', 'Agent immobilier', 'Paris', '75', false, ['Transaction', 'Vente']],
  ['Romain Aubert', 'Chargé de recrutement', 'Rennes', '35', null, ['Recrutement', 'Conseil']],
  ['Maëlle Bertrand', 'Conseillère en financement', 'Strasbourg', '67', true, ['Banque', 'Vente']],
  ['Clément Picard', 'Directeur d’agence immobilière', 'Nice', '06', false, ['Management', 'Transaction']],
].map(([name, role, city, department, openToWork, skills]) => ({name, role, city, department, openToWork, skills}));
