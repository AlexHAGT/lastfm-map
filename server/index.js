// Serveur Express : c'est le seul à parler à Last.fm.
// Il sert aussi les fichiers du site (dossier public/).

const path = require('path');
const express = require('express');
const { ecoutesDernieres24h } = require('./lastfm');
const { mettreEnCache, lireCache } = require('./cache');

const PORT = Number(process.env.PORT) || 3000;
const UTILISATEUR = process.env.LASTFM_USER;
const CACHE_TTL = Number(process.env.CACHE_TTL_SECONDS) || 60;

// Vérification au démarrage : sans clé ni pseudo, rien ne peut marcher
if (!process.env.LASTFM_API_KEY) {
  console.error('⚠️  LASTFM_API_KEY manquante : crée le fichier .env (voir .env.example)');
}
if (!UTILISATEUR) {
  console.error('⚠️  LASTFM_USER manquant : indique ton pseudo Last.fm dans le .env');
}

const app = express();

// Fichiers statiques : index.html, style.css, app.js
app.use(express.static(path.join(__dirname, '..', 'public')));

// Petite route pour vérifier que le serveur tourne
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Les écoutes des dernières 24 h, avec cache et gestion des pannes
app.get('/api/tracks', async (req, res) => {
  if (!process.env.LASTFM_API_KEY || !UTILISATEUR) {
    return res.status(500).json({ error: 'The server is not configured (missing API key or username).' });
  }

  const cle = 'tracks:' + UTILISATEUR;
  const enCache = lireCache(cle);

  // 1) Données en cache encore fraîches : on ne contacte pas Last.fm
  if (enCache && enCache.frais) {
    console.log('CACHE HIT');
    res.set('X-Cache', 'HIT');
    return res.json({ ...enCache.donnees, stale: false });
  }

  // 2) Sinon on appelle Last.fm
  console.log('CACHE MISS → appel Last.fm');
  try {
    const donnees = await ecoutesDernieres24h(UTILISATEUR);
    mettreEnCache(cle, donnees, CACHE_TTL);
    res.set('X-Cache', 'MISS');
    return res.json({ ...donnees, stale: false });
  } catch (err) {
    console.error('Échec de l\'appel à Last.fm :', err.message);

    // 3) Last.fm en panne mais on a d'anciennes données : on les renvoie
    if (enCache) {
      console.log('→ envoi des dernières données connues (stale)');
      res.set('X-Cache', 'STALE');
      return res.json({ ...enCache.donnees, stale: true });
    }

    // 4) Rien en cache : message d'erreur propre
    return res.status(503).json({ error: 'Last.fm is not responding right now. Please try again in a moment.' });
  }
});

// Proxy des pochettes : le navigateur demande l'image à NOTRE serveur,
// qui va la chercher sur le CDN de Last.fm.
// On n'accepte que les domaines d'images Last.fm, sinon n'importe qui
// pourrait utiliser notre serveur pour télécharger n'importe quoi.
const DOMAINES_AUTORISES = [
  'lastfm.freetls.fastly.net',
  'lastfm-img.freetls.fastly.net',
  'lastfm-img2.akamaized.net',
];

app.get('/api/cover', async (req, res) => {
  let url;
  try {
    url = new URL(req.query.url);
  } catch {
    return res.status(400).send('Invalid URL');
  }
  if (url.protocol !== 'https:' || !DOMAINES_AUTORISES.includes(url.hostname)) {
    return res.status(403).send('Domain not allowed');
  }

  try {
    const reponse = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const type = reponse.headers.get('content-type') || '';
    if (!reponse.ok || !type.startsWith('image/')) {
      return res.status(502).send('Image unavailable');
    }
    const image = Buffer.from(await reponse.arrayBuffer());
    res.set('Content-Type', type);
    res.set('Cache-Control', 'public, max-age=86400'); // le navigateur la garde 1 jour
    return res.send(image);
  } catch {
    return res.status(502).send('Image unavailable');
  }
});

app.listen(PORT, () => {
  console.log('Serveur prêt sur http://localhost:' + PORT);
});
