// ===== Simulation des territoires =====
// On rejoue mes écoutes des dernières 24 h dans l'ordre chronologique.
// - Première écoute d'un album : il fonde sa capitale sur une case libre.
// - Chaque écoute : l'album gagne des cases autour de sa capitale.
// Après chaque écoute, on prend une « photo » de la carte : c'est ce qui
// permet ensuite de remonter le temps avec le curseur.

const AUCUN = -1; // case qui n'appartient à personne

// Couleurs de secours pour les albums sans pochette (ou en attendant qu'elle charge)
const PALETTE = [
  [230, 90, 80], [70, 140, 220], [240, 180, 60], [120, 190, 90],
  [170, 100, 210], [60, 190, 190], [235, 130, 170], [200, 120, 60],
];

// Les 4 cases voisines (haut, bas, gauche, droite) qui existent
function voisins(i) {
  const x = i % COLONNES;
  const liste = [];
  if (x > 0) liste.push(i - 1);
  if (x < COLONNES - 1) liste.push(i + 1);
  if (i >= COLONNES) liste.push(i - COLONNES);
  if (i < COLONNES * (LIGNES - 1)) liste.push(i + COLONNES);
  return liste;
}

function distance(a, b) {
  const dx = (a % COLONNES) - (b % COLONNES);
  const dy = Math.floor(a / COLONNES) - Math.floor(b / COLONNES);
  return Math.sqrt(dx * dx + dy * dy);
}

function simulerTerritoires(monde, ecoutes) {
  const N = COLONNES * LIGNES;
  let nbTerre = 0;
  for (let i = 0; i < N; i++) nbTerre += monde.terre[i];

  // Nombre de cases gagnées par écoute : calculé pour remplir au plus 80 % de la terre
  // au bout des 24 h, avec un maximum de 150 pour que peu d'écoutes = petits territoires.
  const casesParEcoute = Math.max(1, Math.min(150, Math.floor((nbTerre * 0.8) / Math.max(1, ecoutes.length))));

  const proprio = new Int16Array(N).fill(AUCUN); // proprio[case] = numéro de l'album
  const albums = [];
  const numeroAlbum = new Map(); // clé "artiste|album" -> numéro
  const photos = [proprio.slice()]; // photo n°0 : monde vide

  // Score d'une case pour un album : plus il est petit, plus la case est prise tôt.
  // Distance à la capitale + un peu de rugosité pour des frontières naturelles.
  function score(album, c) {
    return distance(c, album.capitale) + monde.rugosite[c] * 10;
  }

  // Cases de terre qui touchent le territoire et qui respectent une condition
  function frontiere(a, condition) {
    const b = albums[a].boite; // on ne cherche qu'autour du territoire (plus rapide)
    const candidats = [];
    for (let y = Math.max(0, b.y0 - 1); y <= Math.min(LIGNES - 1, b.y1 + 1); y++) {
      for (let x = Math.max(0, b.x0 - 1); x <= Math.min(COLONNES - 1, b.x1 + 1); x++) {
        const c = y * COLONNES + x;
        if (monde.terre[c] && proprio[c] !== a && condition(c) && voisins(c).some((v) => proprio[v] === a)) {
          candidats.push(c);
        }
      }
    }
    return candidats;
  }

  function prendre(a, c) {
    proprio[c] = a;
    const b = albums[a].boite;
    const x = c % COLONNES;
    const y = Math.floor(c / COLONNES);
    b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x);
    b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
  }

  const estCapitale = (c) => albums.some((al) => al.capitale === c);

  // L'album "a" gagne "n" cases
  function gagner(a, n) {
    const album = albums[a];
    while (n > 0) {
      // 1) des cases libres collées au territoire
      let candidats = frontiere(a, (c) => proprio[c] === AUCUN);

      // 2) sinon (encerclé ou île pleine) : « débarquement » sur la case libre la plus proche
      if (candidats.length === 0) {
        let meilleure = AUCUN;
        for (let c = 0; c < N; c++) {
          if (monde.terre[c] && proprio[c] === AUCUN &&
              (meilleure === AUCUN || score(album, c) < score(album, meilleure))) meilleure = c;
        }
        if (meilleure !== AUCUN) candidats = [meilleure];
      }

      // 3) sinon (plus aucune case libre) : on conquiert les voisins
      if (candidats.length === 0) {
        candidats = frontiere(a, (c) => !estCapitale(c));
      }
      if (candidats.length === 0) break;

      // On ne prend que le meilleur quart de la frontière à chaque tour :
      // le territoire pousse en priorité vers les cases les mieux placées
      // (sinon il grandirait couche par couche, en forme de losange).
      candidats.sort((p, q) => score(album, p) - score(album, q));
      const pris = candidats.slice(0, Math.min(n, Math.ceil(candidats.length / 4)));
      for (const c of pris) prendre(a, c);
      n -= pris.length;
    }
  }

  // Choisit où fonder la capitale d'un nouvel album : une case libre,
  // la plus éloignée possible des autres capitales. Le tirage dépend du nom
  // de l'album, donc un album tombe toujours au même endroit.
  function choisirCapitale(cle) {
    const aleatoire = generateurAleatoire(hacher(cle));
    let meilleure = AUCUN;
    let meilleurEcart = -1;
    for (let essai = 0; essai < 80; essai++) {
      const c = Math.floor(aleatoire() * N);
      if (!monde.terre[c] || proprio[c] !== AUCUN) continue;
      let ecart = 1000;
      for (const al of albums) ecart = Math.min(ecart, distance(c, al.capitale));
      if (ecart > meilleurEcart) { meilleurEcart = ecart; meilleure = c; }
    }
    // Aucun essai réussi : on prend la première case libre, sinon n'importe quelle terre
    if (meilleure === AUCUN) {
      for (let c = 0; c < N && meilleure === AUCUN; c++) {
        if (monde.terre[c] && proprio[c] === AUCUN) meilleure = c;
      }
    }
    if (meilleure === AUCUN) {
      for (let c = 0; c < N && meilleure === AUCUN; c++) {
        if (monde.terre[c] && !estCapitale(c)) meilleure = c;
      }
    }
    return meilleure;
  }

  for (const ecoute of ecoutes) {
    let a = numeroAlbum.get(ecoute.cle);
    if (a === undefined) {
      // Nouvel album : il apparaît sur la carte
      a = albums.length;
      numeroAlbum.set(ecoute.cle, a);
      albums.push({
        nom: ecoute.album || 'Tracks by ' + ecoute.artiste,
        artiste: ecoute.artiste,
        pochette: ecoute.pochette,
        couleur: PALETTE[hacher(ecoute.cle) % PALETTE.length],
        pixels: null, // pochette réduite à 32×32, remplie quand l'image est chargée
        capitale: AUCUN,
        boite: { x0: COLONNES, x1: 0, y0: LIGNES, y1: 0 },
      });
      const capitale = choisirCapitale(ecoute.cle);
      albums[a].capitale = capitale;
      prendre(a, capitale);
      gagner(a, casesParEcoute - 1);
    } else {
      gagner(a, casesParEcoute);
    }
    ecoute.numeroAlbum = a;
    photos.push(proprio.slice()); // photo de la carte après cette écoute
  }

  return { albums, photos };
}
