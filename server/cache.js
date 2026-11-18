// Cache en mémoire très simple.
// On garde chaque réponse avec sa date d'expiration.
// Les données expirées ne sont PAS supprimées : on peut encore les servir
// si Last.fm tombe en panne (données « périmées », stale en anglais).

const entrees = new Map(); // clé -> { donnees, expireA }

// Enregistre des données pour "ttlSecondes" secondes.
function mettreEnCache(cle, donnees, ttlSecondes) {
  entrees.set(cle, {
    donnees: donnees,
    expireA: Date.now() + ttlSecondes * 1000,
  });
}

// Renvoie { donnees, frais } ou null si on n'a jamais rien eu pour cette clé.
// frais = true si les données ne sont pas encore expirées.
function lireCache(cle) {
  const entree = entrees.get(cle);
  if (!entree) return null;
  return {
    donnees: entree.donnees,
    frais: Date.now() < entree.expireA,
  };
}

module.exports = { mettreEnCache, lireCache };
