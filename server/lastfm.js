// Tout ce qui parle à Last.fm est ici.
// Le navigateur ne voit jamais ce fichier ni la clé API : seul le serveur l'exécute.

// URL de base configurable : en mettant une adresse invalide dans le .env,
// on simule une panne de Last.fm pendant la démo.
const BASE_URL = process.env.LASTFM_BASE_URL || 'https://ws.audioscrobbler.com/2.0/';
const DELAI_MAX_MS = 5000; // au bout de 5 s sans réponse, on abandonne
const PAGES_MAX = 3;       // 3 pages de 200 = 600 écoutes maximum sur 24 h

// Image « étoile grise » que Last.fm renvoie quand il n'a pas de pochette.
const IMAGE_VIDE_LASTFM = '2a96cbd8b46e442fc41c2b86b821562f';

// Appelle une page de user.getRecentTracks et renvoie le JSON brut de Last.fm.
async function appelerLastfm(utilisateur, depuis, page) {
  const params = new URLSearchParams({
    method: 'user.getrecenttracks',
    user: utilisateur,
    api_key: process.env.LASTFM_API_KEY, // lue dans l'environnement, jamais en dur
    format: 'json',
    limit: '200',
    from: String(depuis),
    page: String(page),
  });

  let reponse;
  try {
    reponse = await fetch(BASE_URL + '?' + params, {
      signal: AbortSignal.timeout(DELAI_MAX_MS),
    });
  } catch (err) {
    // Panne réseau, DNS introuvable ou délai dépassé
    throw new Error('Last.fm est injoignable (' + err.name + ')');
  }

  let json = null;
  try {
    json = await reponse.json();
  } catch {
    // la réponse n'est pas du JSON (page d'erreur HTML par exemple)
  }

  // Last.fm peut répondre { error, message }, même avec un statut HTTP 200
  if (json && json.error) {
    throw new Error('Erreur Last.fm ' + json.error + ' : ' + json.message);
  }
  if (!reponse.ok || !json || !json.recenttracks) {
    throw new Error('Réponse inattendue de Last.fm (HTTP ' + reponse.status + ')');
  }
  return json;
}

// Transforme un morceau au format Last.fm en objet simple pour le front.
function nettoyerMorceau(t) {
  // On prend la plus grande image non vide
  const images = (t.image || []).map((img) => img['#text']).filter(Boolean);
  let image = images[images.length - 1] || '';
  if (image.includes(IMAGE_VIDE_LASTFM)) image = '';

  return {
    titre: t.name,
    artiste: t.artist['#text'],
    album: t.album['#text'],
    // L'image passe par NOTRE serveur (/api/cover) : le navigateur ne contacte pas Last.fm.
    // Adresse relative pour marcher aussi sous /lastfm/ sur le serveur.
    pochette: image ? 'api/cover?url=' + encodeURIComponent(image) : null,
    // Le morceau en cours d'écoute n'a pas de date
    date: t.date ? Number(t.date.uts) : null,
    enCours: Boolean(t['@attr'] && t['@attr'].nowplaying === 'true'),
  };
}

// Récupère toutes les écoutes des dernières 24 h, déjà nettoyées.
async function ecoutesDernieres24h(utilisateur) {
  const depuis = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
  let morceaux = [];

  let page = 1;
  let totalPages = 1;
  do {
    const json = await appelerLastfm(utilisateur, depuis, page);
    let liste = json.recenttracks.track || [];
    if (!Array.isArray(liste)) liste = [liste]; // un seul morceau = objet au lieu de tableau
    morceaux = morceaux.concat(liste);
    totalPages = Number(json.recenttracks['@attr']?.totalPages || 1);
    page++;
  } while (page <= totalPages && page <= PAGES_MAX);

  return {
    utilisateur: utilisateur,
    depuis: depuis,
    morceaux: morceaux.map(nettoyerMorceau),
  };
}

module.exports = { ecoutesDernieres24h };
