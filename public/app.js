// ===== Page principale : données, dessin de la carte, survol et frise du temps =====
// Le navigateur appelle uniquement NOTRE serveur (/api/tracks et /api/cover).

const carte = document.getElementById('carte');           // canvas des cases (1 pixel = 1 case)
const calqueNoms = document.getElementById('etiquettes'); // canvas des noms d'albums, par-dessus
const infobulle = document.getElementById('infobulle');
const statut = document.getElementById('statut');
const bandeau = document.getElementById('bandeau');
const curseur = document.getElementById('curseur');
const boutonLecture = document.getElementById('lecture');
const heure = document.getElementById('heure');

const DUREE_REPLAY_MS = 15000; // les 24 h sont rejouées en 15 secondes
const MINUTES_24H = 24 * 60;

// Le canvas fait 160×100 pixels ; le CSS l'agrandit avec des pixels bien carrés
carte.width = COLONNES;
carte.height = LIGNES;
const ctx = carte.getContext('2d');
const image = ctx.createImageData(COLONNES, LIGNES);

const monde = creerMonde();
let etat = null;          // { ecoutes, albums, photos, debut }
let minute = MINUTES_24H; // position du curseur : 1440 = maintenant
let survole = AUCUN;      // album sous la souris
let lectureEnCours = false;
const pixelsPochettes = new Map(); // pochettes déjà chargées (évite de les retélécharger)

// ---------- 1. Récupérer les données ----------
async function charger() {
  let donnees;
  try {
    const reponse = await fetch('/api/tracks');
    donnees = await reponse.json();
    if (!reponse.ok) {
      // Erreur propre renvoyée par notre serveur (ex. 503 : Last.fm en panne, rien en cache)
      afficherStatut(donnees.error || 'Unknown error.');
      return;
    }
  } catch {
    // Notre propre serveur ne répond pas
    afficherStatut('Cannot reach the server. Is it running?');
    return;
  }

  // Last.fm en panne, mais le serveur avait encore des données en cache
  bandeau.hidden = !donnees.stale;
  bandeau.textContent = 'Last.fm is not responding: showing the last known data.';

  construire(donnees);
  afficherStatut(donnees.morceaux.length === 0
    ? 'No plays in the last 24 hours: the world is still empty.'
    : '');
}

function afficherStatut(texte) {
  statut.textContent = texte;
  statut.hidden = texte === '';
}

// ---------- 2. Préparer la simulation ----------
function construire(donnees) {
  const maintenant = Math.floor(Date.now() / 1000);
  const ecoutes = donnees.morceaux
    .map((m) => ({
      ...m,
      date: m.date || maintenant, // morceau en cours : pas de date, on prend « maintenant »
      cle: m.artiste + '|' + m.album,
    }))
    .sort((a, b) => a.date - b.date); // du plus ancien au plus récent

  const simulation = simulerTerritoires(monde, ecoutes);
  etat = { ecoutes, albums: simulation.albums, photos: simulation.photos, debut: donnees.depuis };

  for (const album of etat.albums) chargerPochette(album);
  dessiner();
}

// Réduit la pochette à 32×32 pixels : chaque case du territoire prendra la couleur
// d'un de ces pixels, ce qui « peint » la pochette sur le territoire.
function chargerPochette(album) {
  if (!album.pochette) return; // pas de pochette : on garde la couleur de secours
  if (pixelsPochettes.has(album.pochette)) {
    appliquerPochette(album, pixelsPochettes.get(album.pochette));
    return;
  }
  const img = new Image();
  img.onload = () => {
    const petit = document.createElement('canvas');
    petit.width = 32;
    petit.height = 32;
    const c = petit.getContext('2d');
    c.drawImage(img, 0, 0, 32, 32);
    // Possible car l'image vient de notre serveur (même origine) : pas de blocage CORS
    const pixels = c.getImageData(0, 0, 32, 32).data;
    pixelsPochettes.set(album.pochette, pixels);
    appliquerPochette(album, pixels);
    dessiner();
  };
  img.src = album.pochette; // /api/cover?url=... → passe par notre serveur
}

function appliquerPochette(album, pixels) {
  album.pixels = pixels;
  // Couleur principale = moyenne des pixels (utilisée pour la frontière)
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < pixels.length; i += 4) { r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; }
  const n = pixels.length / 4;
  album.couleur = [r / n, g / n, b / n];
}

// Nombre d'écoutes passées à la minute choisie sur le curseur
function nbEcoutesA(min) {
  const t = etat.debut + min * 60;
  if (min >= MINUTES_24H) return etat.ecoutes.length; // « maintenant » : tout, morceau en cours compris
  let n = 0;
  while (n < etat.ecoutes.length && etat.ecoutes[n].date <= t) n++;
  return n;
}

// ---------- 3. Dessiner la carte ----------
const assombrir = (c, f) => [c[0] * (1 - f), c[1] * (1 - f), c[2] * (1 - f)];
const melanger = (c1, c2, t) => [0, 1, 2].map((k) => c1[k] + (c2[k] - c1[k]) * t);
const limiter = (v) => Math.max(0, Math.min(1, v));

const MER_PROFONDE = [18, 45, 78];
const MER_COTE = [42, 104, 145];
const PLAGE = [214, 204, 160];
const PLAINE = [128, 150, 96];

function dessiner() {
  if (!etat) return;
  const n = nbEcoutesA(minute);
  const proprio = etat.photos[n];
  const albums = etat.albums;

  // Boîte englobante de chaque territoire (pour y étaler la pochette)
  const boites = albums.map(() => ({ x0: COLONNES, x1: 0, y0: LIGNES, y1: 0, cases: 0, sx: 0, sy: 0 }));
  for (let i = 0; i < proprio.length; i++) {
    const a = proprio[i];
    if (a === AUCUN) continue;
    const x = i % COLONNES, y = Math.floor(i / COLONNES), b = boites[a];
    b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x);
    b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
    b.cases++; b.sx += x; b.sy += y;
  }

  for (let i = 0; i < proprio.length; i++) {
    const x = i % COLONNES, y = Math.floor(i / COLONNES);
    const a = proprio[i];
    let couleur;

    if (!monde.terre[i]) {
      // Eau : plus claire près des côtes
      couleur = melanger(MER_COTE, MER_PROFONDE, limiter((monde.niveauMer - monde.altitude[i]) / 0.15));
    } else if (a === AUCUN) {
      // Terre libre : plage puis plaine
      couleur = melanger(PLAGE, PLAINE, limiter((monde.altitude[i] - monde.niveauMer) / 0.06));
    } else {
      const album = albums[a];
      // Case de frontière = au moins une voisine qui n'est pas à cet album
      const frontiere = voisins(i).length < 4 || voisins(i).some((v) => proprio[v] !== a);
      if (frontiere) {
        couleur = a === survole ? [255, 255, 255] : assombrir(album.couleur, 0.45);
      } else if (album.pixels) {
        // Intérieur : pixel de la pochette, étalée en carré sur le territoire
        const b = boites[a];
        const cote = Math.max(b.x1 - b.x0, b.y1 - b.y0) + 1;
        const u = (x - (b.x0 + b.x1) / 2) / cote + 0.5;
        const v = (y - (b.y0 + b.y1) / 2) / cote + 0.5;
        const px = Math.min(31, Math.max(0, Math.floor(u * 32)));
        const py = Math.min(31, Math.max(0, Math.floor(v * 32)));
        const k = (py * 32 + px) * 4;
        couleur = [album.pixels[k], album.pixels[k + 1], album.pixels[k + 2]];
      } else {
        couleur = album.couleur;
      }
      // Pendant un survol, les autres territoires sont assombris
      if (survole !== AUCUN && a !== survole) couleur = assombrir(couleur, 0.4);
    }

    image.data[i * 4] = couleur[0];
    image.data[i * 4 + 1] = couleur[1];
    image.data[i * 4 + 2] = couleur[2];
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  dessinerNoms(proprio, boites);
  mettreAJourHeure();
}

// Noms d'albums écrits sur les territoires (canvas séparé, en haute résolution)
function dessinerNoms(proprio, boites) {
  const largeur = carte.clientWidth;
  const hauteur = carte.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  calqueNoms.width = largeur * dpr;
  calqueNoms.height = hauteur * dpr;
  const c = calqueNoms.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';

  const tailleCase = largeur / COLONNES;

  // Point d'ancrage : la case du territoire la plus proche de son centre
  const ancres = boites.map(() => ({ c: AUCUN, d: Infinity }));
  for (let i = 0; i < proprio.length; i++) {
    const a = proprio[i];
    if (a === AUCUN) continue;
    const b = boites[a];
    const dx = (i % COLONNES) - b.sx / b.cases;
    const dy = Math.floor(i / COLONNES) - b.sy / b.cases;
    const d = dx * dx + dy * dy;
    if (d < ancres[a].d) ancres[a] = { c: i, d };
  }

  etat.albums.forEach((album, a) => {
    const b = boites[a];
    if (b.cases === 0) return;
    const taille = Math.min(20, Math.sqrt(b.cases) * tailleCase * 0.3);
    if (taille < 8) return; // territoire trop petit pour un nom lisible
    const x = ((ancres[a].c % COLONNES) + 0.5) * tailleCase;
    const y = (Math.floor(ancres[a].c / COLONNES) + 0.5) * tailleCase;

    c.font = '700 ' + taille + 'px system-ui, sans-serif';
    const nom = raccourcir(c, album.nom, (b.x1 - b.x0 + 4) * tailleCase);
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    c.fillStyle = '#fff';
    c.strokeText(nom, x, y);
    c.fillText(nom, x, y);
  });
}

// Coupe le texte avec « … » s'il est plus large que le territoire
function raccourcir(c, texte, largeurMax) {
  if (c.measureText(texte).width <= largeurMax) return texte;
  while (texte.length > 1 && c.measureText(texte + '…').width > largeurMax) texte = texte.slice(0, -1);
  return texte + '…';
}

function mettreAJourHeure() {
  curseur.value = minute;
  if (minute >= MINUTES_24H) {
    heure.textContent = 'Now';
  } else {
    const date = new Date((etat.debut + minute * 60) * 1000);
    const ecart = MINUTES_24H - Math.round(minute);
    heure.textContent = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) +
      ' (' + Math.floor(ecart / 60) + 'h' + String(ecart % 60).padStart(2, '0') + ' ago)';
  }
}

// ---------- 4. Survol d'un territoire : frontière en surbrillance + fenêtre d'infos ----------
function caseSousPointeur(e) {
  const r = carte.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) / r.width) * COLONNES);
  const y = Math.floor(((e.clientY - r.top) / r.height) * LIGNES);
  if (x < 0 || y < 0 || x >= COLONNES || y >= LIGNES) return AUCUN;
  return y * COLONNES + x;
}

function survoler(e) {
  if (!etat) return;
  const i = caseSousPointeur(e);
  const proprio = etat.photos[nbEcoutesA(minute)];
  const a = i === AUCUN ? AUCUN : proprio[i];
  if (a !== survole) {
    survole = a;
    remplirInfobulle(a);
    dessiner();
  }
  if (a !== AUCUN) placerInfobulle(e);
}

function quitter(e) {
  if (e.pointerType === 'touch') return; // au doigt, la fenêtre reste jusqu'au prochain appui
  survole = AUCUN;
  infobulle.hidden = true;
  dessiner();
}

function remplirInfobulle(a) {
  if (a === AUCUN) { infobulle.hidden = true; return; }
  const album = etat.albums[a];
  const n = nbEcoutesA(minute);

  // Titres écoutés de cet album jusqu'à l'instant choisi, avec leur nombre d'écoutes
  const titres = new Map();
  let enCours = false;
  for (const e of etat.ecoutes.slice(0, n)) {
    if (e.numeroAlbum !== a) continue;
    titres.set(e.titre, (titres.get(e.titre) || 0) + 1);
    if (e.enCours) enCours = true;
  }
  const total = [...titres.values()].reduce((s, v) => s + v, 0);

  // textContent (et non innerHTML) : un titre bizarre ne peut pas injecter de code
  infobulle.replaceChildren();
  if (album.pochette) {
    const img = document.createElement('img');
    img.src = album.pochette;
    img.alt = '';
    infobulle.append(img);
  } else {
    const vide = document.createElement('div');
    vide.className = 'sans-pochette';
    vide.textContent = '♪';
    infobulle.append(vide);
  }
  const titre = document.createElement('strong');
  titre.textContent = album.nom;
  const artiste = document.createElement('p');
  artiste.className = 'artiste';
  artiste.textContent = album.artiste + ' · ' + total + ' play' + (total > 1 ? 's' : '') +
    (enCours ? ' · now playing ♪' : '');
  const liste = document.createElement('ul');
  [...titres].slice(0, 8).forEach(([nom, nb]) => {
    const li = document.createElement('li');
    li.textContent = nom + (nb > 1 ? ' ×' + nb : '');
    liste.append(li);
  });
  if (titres.size > 8) {
    const li = document.createElement('li');
    li.textContent = '… and ' + (titres.size - 8) + ' more';
    liste.append(li);
  }
  infobulle.append(titre, artiste, liste);
  infobulle.hidden = false;
}

// Place la fenêtre près du pointeur sans qu'elle sorte de l'écran
function placerInfobulle(e) {
  const marge = 14;
  let x = e.clientX + marge;
  let y = e.clientY + marge;
  if (x + infobulle.offsetWidth > window.innerWidth) x = e.clientX - infobulle.offsetWidth - marge;
  if (y + infobulle.offsetHeight > window.innerHeight) y = e.clientY - infobulle.offsetHeight - marge;
  infobulle.style.left = Math.max(4, x) + 'px';
  infobulle.style.top = Math.max(4, y) + 'px';
}

carte.addEventListener('pointermove', survoler);
carte.addEventListener('pointerdown', survoler);
carte.addEventListener('pointerleave', quitter);

// ---------- 5. Frise du temps : curseur + rejouer les 24 h ----------
curseur.max = MINUTES_24H;
curseur.addEventListener('input', () => {
  arreterLecture();
  minute = Number(curseur.value);
  rafraichirApresChangement();
});

boutonLecture.addEventListener('click', () => {
  if (lectureEnCours) { arreterLecture(); return; }
  if (minute >= MINUTES_24H) minute = 0; // déjà au bout : on repart d'il y a 24 h
  lectureEnCours = true;
  boutonLecture.textContent = '⏸';
  let precedent = performance.now();

  // Appelée à chaque image de l'animation (~60 fois par seconde)
  function etape(maintenant) {
    if (!lectureEnCours) return;
    minute = Math.min(MINUTES_24H, minute + ((maintenant - precedent) / DUREE_REPLAY_MS) * MINUTES_24H);
    precedent = maintenant;
    rafraichirApresChangement();
    if (minute >= MINUTES_24H) arreterLecture();
    else requestAnimationFrame(etape);
  }
  requestAnimationFrame(etape);
});

function arreterLecture() {
  lectureEnCours = false;
  boutonLecture.textContent = '▶';
}

function rafraichirApresChangement() {
  if (survole !== AUCUN) remplirInfobulle(survole); // les titres listés dépendent du moment choisi
  dessiner();
}

// Les noms sont redessinés quand la fenêtre change de taille (téléphone tourné, etc.)
window.addEventListener('resize', dessiner);

// Toutes les minutes, si on regarde « maintenant », on recharge les données :
// un nouvel album écouté apparaît alors sur la carte. (Le serveur répond depuis son cache.)
setInterval(() => {
  if (minute >= MINUTES_24H && !lectureEnCours) charger();
}, 60000);

// Au démarrage : on dessine tout de suite le monde vide (sans territoire),
// pour que les messages de chargement ou d'erreur s'affichent par-dessus la carte.
etat = {
  ecoutes: [],
  albums: [],
  photos: [new Int16Array(COLONNES * LIGNES).fill(AUCUN)],
  debut: Math.floor(Date.now() / 1000) - 24 * 60 * 60,
};
dessiner();
charger();
