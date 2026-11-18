// ===== Génération du monde =====
// La carte est une grille de petits carrés (des « cases »).
// Chaque case est soit de l'eau, soit de la terre.
// Tout part d'une graine fixe : le monde est identique à chaque visite.

const COLONNES = 160;
const LIGNES = 100;

// Générateur de nombres aléatoires « à graine » (même graine = même suite de nombres).
// Math.random() ne permet pas ça, d'où cette petite fonction classique (mulberry32).
function generateurAleatoire(graine) {
  return function () {
    graine = (graine + 0x6d2b79f5) | 0;
    let t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // nombre entre 0 et 1
  };
}

// Transforme un texte (ex. le nom d'un album) en nombre, toujours le même pour le même texte.
function hacher(texte) {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// « Bruit lisse » : des valeurs aléatoires posées sur une grille grossière,
// puis mélangées en douceur entre elles. Ça donne des formes naturelles (continents).
function bruitLisse(aleatoire, taille) {
  const largeurGrille = Math.ceil(COLONNES / taille) + 2;
  const hauteurGrille = Math.ceil(LIGNES / taille) + 2;
  const grille = [];
  for (let i = 0; i < largeurGrille * hauteurGrille; i++) grille.push(aleatoire());

  const lisser = (t) => t * t * (3 - 2 * t);
  const melanger = (a, b, t) => a + (b - a) * t;

  const resultat = new Float32Array(COLONNES * LIGNES);
  for (let y = 0; y < LIGNES; y++) {
    for (let x = 0; x < COLONNES; x++) {
      const gx = x / taille;
      const gy = y / taille;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = lisser(gx - x0);
      const ty = lisser(gy - y0);
      const a = grille[y0 * largeurGrille + x0];
      const b = grille[y0 * largeurGrille + x0 + 1];
      const c = grille[(y0 + 1) * largeurGrille + x0];
      const d = grille[(y0 + 1) * largeurGrille + x0 + 1];
      resultat[y * COLONNES + x] = melanger(melanger(a, b, tx), melanger(c, d, tx), ty);
    }
  }
  return resultat;
}

function creerMonde() {
  const aleatoire = generateurAleatoire(2026);
  const N = COLONNES * LIGNES;

  // Trois bruits à des échelles différentes : grands continents + détails des côtes
  const grand = bruitLisse(aleatoire, 32);
  const moyen = bruitLisse(aleatoire, 14);
  const petit = bruitLisse(aleatoire, 6);

  const altitude = new Float32Array(N);
  for (let y = 0; y < LIGNES; y++) {
    for (let x = 0; x < COLONNES; x++) {
      const i = y * COLONNES + x;
      // Plus on s'éloigne du centre, plus l'altitude baisse : la mer entoure le monde
      const nx = (x / COLONNES - 0.5) * 2;
      const ny = (y / LIGNES - 0.5) * 2;
      const distanceCentre = Math.sqrt(nx * nx + ny * ny);
      altitude[i] = grand[i] * 0.55 + moyen[i] * 0.3 + petit[i] * 0.15 - distanceCentre * 0.55;
      // Près des bords de la carte, on enfonce le terrain sous l'eau
      const bord = Math.min(x, COLONNES - 1 - x, y, LIGNES - 1 - y);
      if (bord < 12) altitude[i] -= ((12 - bord) / 12) * 0.6;
    }
  }

  // Niveau de la mer choisi pour que 50 % des cases soient de la terre
  const triees = Array.from(altitude).sort((a, b) => a - b);
  const niveauMer = triees[Math.floor(N * 0.5)];

  const terre = new Uint8Array(N);
  for (let i = 0; i < N; i++) terre[i] = altitude[i] > niveauMer ? 1 : 0;

  // Petit bruit utilisé pour rendre les frontières irrégulières (pas des cercles parfaits)
  const rugosite = bruitLisse(aleatoire, 5);

  return { terre, altitude, niveauMer, rugosite };
}
