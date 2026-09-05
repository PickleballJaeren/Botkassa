// ════════════════════════════════════════════════════════
// botkassa-logikk.js — Firestore-lag for Botkassa
//
// Egne samlinger (må legges til i firestore.rules, se
// botkassa-firestore-regler.txt):
//   botkasseParagrafer/{klubbId}   — redigerbar §3-liste per klubb
//   botkasseInnmeldinger/{id}      — meldinger som venter på godkjenning
//   botkasseBoter/{id}             — godkjente, gjeldende bøter
//
// Leser spillernavn fra SAMME players-samling som resten av
// appen (samme spørringsmønster som hentSpillere() i
// stafettliga.js/proven.js — bevisst en egen kopi her, samme
// filosofi som resten av kodebasen: hver app-modul er selvstendig).
// ════════════════════════════════════════════════════════
import {
  db, collection, doc, addDoc, updateDoc, setDoc, getDoc, getDocs,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, increment,
} from './firebase.js';

const SAM = {
  SPILLERE:     'players',
  PARAGRAFER:   'botkasseParagrafer',
  INNMELDINGER: 'botkasseInnmeldinger',
  BOTER:        'botkasseBoter',
};

// ════════════════════════════════════════════════════════
// STANDARD-PARAGRAFER — brukes til en klubb har lagret sine
// egne (via lagreParagrafer). Basert på klubbens §3-reglement.
// ════════════════════════════════════════════════════════
export const DEFAULT_PARAGRAFER = [
  { id:'p1',  num:1,  emoji:'⏰', tittel:'For sent til trening',                 belop:20, skjonn:false },
  { id:'p2',  num:2,  emoji:'📱', tittel:'Avbud etter kl. 15:00',                 belop:30, skjonn:false },
  { id:'p3',  num:3,  emoji:'👻', tittel:'Påmeldt, ikke møtt, ingen beskjed',     belop:50, skjonn:false },
  { id:'p4',  num:4,  emoji:'🤬', tittel:'Banning / upassende språk',             belop:30, skjonn:true,  skjonnMin:20, skjonnMax:50 },
  { id:'p5',  num:5,  emoji:'🧹', tittel:'Forlatt hallen uten å rydde',           belop:20, skjonn:false },
  { id:'p6',  num:6,  emoji:'👀', tittel:'Uærlig balldømming',                    belop:20, skjonn:false },
  { id:'p7',  num:7,  emoji:'📝', tittel:'Feil resultatregistrering (lagstraff)', belop:20, skjonn:false, lagstraff:true },
  { id:'p8',  num:8,  emoji:'🏓', tittel:'Skylde på makkeren etter tap',          belop:20, skjonn:false },
  { id:'p9',  num:9,  emoji:'⚖️', tittel:'For stor seiersmargin i sosialspill',   belop:0,  skjonn:true,  skjonnMin:0,  skjonnMax:100, ingenFast:true },
  { id:'p10', num:10, emoji:'🚨', tittel:'Botpoliti (overivrig tysting)',         belop:20, skjonn:false },
];

// ════════════════════════════════════════════════════════
// SPILLERE
// ════════════════════════════════════════════════════════
export async function hentSpillere(klubbId) {
  if (!klubbId || !db) return [];
  try {
    const snap = await getDocs(query(
      collection(db, SAM.SPILLERE),
      where('klubbId', '==', klubbId),
      orderBy('navn'),
    ));
    return snap.docs.map(d => ({ id: d.id, navn: d.data().navn ?? '?' }));
  } catch (e) {
    console.warn('[Botkassa] hentSpillere:', e?.message);
    return [];
  }
}

// ════════════════════════════════════════════════════════
// PARAGRAFER
// ════════════════════════════════════════════════════════
export async function hentParagrafer(klubbId) {
  try {
    const snap = await getDoc(doc(db, SAM.PARAGRAFER, klubbId));
    if (snap.exists() && Array.isArray(snap.data().paragrafer) && snap.data().paragrafer.length) {
      return snap.data().paragrafer;
    }
  } catch (e) {
    console.warn('[Botkassa] hentParagrafer, bruker standard:', e?.message);
  }
  return DEFAULT_PARAGRAFER;
}

export async function lagreParagrafer(klubbId, paragrafer) {
  await setDoc(doc(db, SAM.PARAGRAFER, klubbId), {
    paragrafer,
    oppdatert: serverTimestamp(),
  });
}

// ════════════════════════════════════════════════════════
// REALTIME-LYTTERE — returnerer unsubscribe-funksjon
// ════════════════════════════════════════════════════════
export function lyttPaBoter(klubbId, callback) {
  return onSnapshot(
    query(collection(db, SAM.BOTER), where('klubbId','==',klubbId), orderBy('opprettet','desc'), limit(200)),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => console.warn('[Botkassa] lyttPaBoter:', err?.message),
  );
}

export function lyttPaVentende(klubbId, callback) {
  return onSnapshot(
    query(
      collection(db, SAM.INNMELDINGER),
      where('klubbId','==',klubbId),
      where('status','==','venter'),
      orderBy('opprettet','asc'),
    ),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => console.warn('[Botkassa] lyttPaVentende:', err?.message),
  );
}

// ════════════════════════════════════════════════════════
// INNMELDING — opprette, avvise, godkjenne
// ════════════════════════════════════════════════════════
export async function opprettInnmelding({ klubbId, meldtAvId, meldtAvNavn, motSpillere, paragrafId, paragrafTittel, foreslattBelop, kommentar }) {
  await addDoc(collection(db, SAM.INNMELDINGER), {
    klubbId,
    meldtAvId, meldtAvNavn,
    motSpillere,                 // [{id, navn}]
    paragrafId, paragrafTittel,
    foreslattBelop,
    kommentar: kommentar || '',
    status: 'venter',
    opprettet: serverTimestamp(),
  });
}

export async function avvisInnmelding(innmeldingId, behandletAvNavn) {
  await updateDoc(doc(db, SAM.INNMELDINGER, innmeldingId), {
    status: 'avvist',
    behandletAvNavn,
    behandletTidspunkt: serverTimestamp(),
  });
}

/**
 * Godkjenner en innmelding. Oppretter én bot-post per spiller i
 * motSpillere (relevant for lagstraffer). Kjører karma-sjekk per
 * spiller: har vedkommende TIDLIGERE selv meldt inn noen for samme
 * paragraf? Doble i så fall boten deres.
 *
 * @param {object} innmelding      — dokument fra lyttPaVentende (inkl. id)
 * @param {number} baseBelop       — endelig/justert beløp før evt. karma
 * @param {string} behandletAvNavn — navnet til den som godkjenner
 */
export async function godkjennInnmelding(innmelding, baseBelop, behandletAvNavn) {
  const { klubbId, motSpillere, paragrafId, paragrafTittel, meldtAvId, meldtAvNavn, kommentar } = innmelding;

  for (const mot of motSpillere) {
    const karmaSnap = await getDocs(query(
      collection(db, SAM.BOTER),
      where('klubbId', '==', klubbId),
      where('meldtAvId', '==', mot.id),
      where('paragrafId', '==', paragrafId),
      limit(1),
    ));
    const karmaTreff   = !karmaSnap.empty;
    const endeligBelop = karmaTreff ? baseBelop * 2 : baseBelop;

    await addDoc(collection(db, SAM.BOTER), {
      klubbId,
      spillerId: mot.id, spillerNavn: mot.navn,
      paragrafId, paragrafTittel,
      belop: endeligBelop,
      karmaDoblet: karmaTreff,
      kommentar: kommentar || '',
      meldtAvId, meldtAvNavn,
      behandletAvNavn,
      betalt: false,
      likes: 0,
      opprettet: serverTimestamp(),
    });
  }

  await updateDoc(doc(db, SAM.INNMELDINGER, innmelding.id), {
    status: 'godkjent',
    behandletAvNavn,
    behandletTidspunkt: serverTimestamp(),
  });
}

// ════════════════════════════════════════════════════════
// BØTER — betaling og likes
// ════════════════════════════════════════════════════════
export async function settBetalt(botId, verdi) {
  await updateDoc(doc(db, SAM.BOTER, botId), { betalt: verdi });
}

export async function likeBot(botId) {
  await updateDoc(doc(db, SAM.BOTER, botId), { likes: increment(1) });
}

// ════════════════════════════════════════════════════════
// STATISTIKK-HJELPERE (rene funksjoner, ingen Firestore-kall)
// ════════════════════════════════════════════════════════
export function topListe(liste, felt) {
  const tellinger = {};
  liste.forEach(x => { const k = x[felt]; if (!k) return; tellinger[k] = (tellinger[k]||0) + 1; });
  return Object.entries(tellinger).sort((a,b) => b[1]-a[1]).map(([key,antall]) => ({ key, antall }));
}

export function sumListe(liste, groupFelt, sumFelt) {
  const summer = {};
  liste.forEach(x => { const k = x[groupFelt]; if (!k) return; summer[k] = (summer[k]||0) + (x[sumFelt]||0); });
  return Object.entries(summer).sort((a,b) => b[1]-a[1]).map(([key,sum]) => ({ key, sum }));
}
