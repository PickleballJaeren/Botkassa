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
  db, collection, doc, addDoc, updateDoc, setDoc, deleteDoc, getDoc, getDocs,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, increment, writeBatch,
  arrayUnion, arrayRemove,
} from './firebase.js';

const SAM = {
  SPILLERE:     'players',
  PARAGRAFER:   'botkasseParagrafer',
  INNMELDINGER: 'botkasseInnmeldinger',
  BOTER:        'botkasseBoter',
  FAIRPLAY:     'botkasseFairPlay',
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
// FAIR PLAY-KATEGORIER — faste, ikke redigerbare (i motsetning
// til paragrafene). Fair Play-poeng har ingen kroneverdi og
// ingen godkjenningssteg, så det er ingenting å konfigurere.
// ════════════════════════════════════════════════════════
export const FAIRPLAY_KATEGORIER = [
  { id:'fp1', emoji:'🤝', tittel:'Fair play' },
  { id:'fp2', emoji:'🔥', tittel:'Utrolig prestasjon' },
  { id:'fp3', emoji:'😂', tittel:'Gjorde noens dag' },
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

export function lyttPaFairPlay(klubbId, callback) {
  return onSnapshot(
    query(collection(db, SAM.FAIRPLAY), where('klubbId','==',klubbId), orderBy('opprettet','desc'), limit(200)),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => console.warn('[Botkassa] lyttPaFairPlay:', err?.message),
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
 * Lagrer en anklagets forklaring/unnskyldning på en ventende innmelding, én
 * per spiller (siden en innmelding kan gjelde flere ved lagstraff). Kan
 * kalles på nytt for å redigere svaret så lenge saken ikke er avgjort.
 * Forklaringen følger med til selve bot-posten hvis/når saken godkjennes
 * (se godkjennInnmelding), og vises da åpent i feeden.
 */
export async function svarPaInnmelding(innmeldingId, spillerId, tekst) {
  await updateDoc(doc(db, SAM.INNMELDINGER, innmeldingId), {
    [`svar.${spillerId}`]: { tekst, tidspunkt: serverTimestamp() },
  });
}

/**
 * Godkjenner en innmelding. Oppretter én bot-post per spiller i
 * motSpillere (relevant for lagstraffer). Kjører karma-sjekk per
 * spiller, med en "ladning"-modell: hver gang vedkommende selv har
 * meldt inn noen andre for en paragraf, lader de opp én mulig
 * dobling mot seg selv for samme paragraf. Ladningen brukes opp
 * neste gang de selv bøtelegges for den paragrafen (dobler boten),
 * og er da borte — helt til de melder inn på nytt og lader opp en
 * ny ladning.
 *
 * @param {object} innmelding      — dokument fra lyttPaVentende (inkl. id)
 * @param {number} baseBelop       — endelig/justert beløp før evt. karma
 * @param {string} behandletAvNavn — navnet til den som godkjenner
 */
export async function godkjennInnmelding(innmelding, baseBelop, behandletAvNavn) {
  const { klubbId, motSpillere, paragrafId, paragrafTittel, meldtAvId, meldtAvNavn, kommentar } = innmelding;

  for (const mot of motSpillere) {
    // Hvor mange ganger har spilleren selv meldt inn noen for denne paragrafen?
    // NB: teller UNIKE innmeldinger, ikke antall bot-dokumenter — en innmelding
    // med flere anklagede (f.eks. lagstraff) skal bare gi én ladning, ikke én
    // per anklaget. Eldre bot-dokumenter uten innmeldingId (fra før denne
    // fiksen) teller ikke med.
    const meldtSnap = await getDocs(query(
      collection(db, SAM.BOTER),
      where('klubbId', '==', klubbId),
      where('meldtAvId', '==', mot.id),
      where('paragrafId', '==', paragrafId),
    ));
    const unikeInnmeldinger = new Set(
      meldtSnap.docs.map(d => d.data().innmeldingId).filter(Boolean)
    );
    const antallLadninger = unikeInnmeldinger.size;

    let karmaTreff = false;
    if (antallLadninger > 0) {
      // Hvor mange av disse ladningene er allerede brukt opp mot spilleren selv?
      const karmaBruktSnap = await getDocs(query(
        collection(db, SAM.BOTER),
        where('klubbId', '==', klubbId),
        where('spillerId', '==', mot.id),
        where('paragrafId', '==', paragrafId),
        where('karmaDoblet', '==', true),
      ));
      karmaTreff = karmaBruktSnap.size < antallLadninger;
    }

    const endeligBelop = karmaTreff ? baseBelop * 2 : baseBelop;

    await addDoc(collection(db, SAM.BOTER), {
      klubbId,
      innmeldingId: innmelding.id,
      spillerId: mot.id, spillerNavn: mot.navn,
      paragrafId, paragrafTittel,
      belop: endeligBelop,
      karmaDoblet: karmaTreff,
      kommentar: kommentar || '',
      forklaring: innmelding.svar?.[mot.id]?.tekst || '',
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
// FAIR PLAY-POENG — den positive motvekten til bøtene. Ingen
// godkjenning, ingen kroneverdi, ingen kobling til karma (bevisst
// valg — se diskusjon i README/samtalen med klubben: kobler man
// Fair Play-poeng til å redusere bøter, kan noen be en kompis
// sende et poeng rett før de vet de blir meldt inn). Postes
// direkte i feeden, én post per valgt spiller (samme mønster som
// lagstraff for bøter).
// ════════════════════════════════════════════════════════
export async function opprettFairPlayPoeng({ klubbId, meldtAvId, meldtAvNavn, motSpillere, kategoriId, kategoriTittel, kommentar }) {
  const batch = writeBatch(db);
  motSpillere.forEach(mot => {
    const ref = doc(collection(db, SAM.FAIRPLAY));
    batch.set(ref, {
      klubbId,
      spillerId: mot.id, spillerNavn: mot.navn,
      kategoriId, kategoriTittel,
      kommentar: kommentar || '',
      meldtAvId, meldtAvNavn,
      likes: 0,
      opprettet: serverTimestamp(),
    });
  });
  await batch.commit();
}

/**
 * Like/unlike et Fair Play-poeng — samme mønster som likeBot.
 */
export async function likeFairPlay(id, enhetsId, harAlleredeLikt) {
  await updateDoc(doc(db, SAM.FAIRPLAY, id), {
    likes:   increment(harAlleredeLikt ? -1 : 1),
    likedAv: harAlleredeLikt ? arrayRemove(enhetsId) : arrayUnion(enhetsId),
  });
}

// ════════════════════════════════════════════════════════
// BØTER — betaling og likes
// ════════════════════════════════════════════════════════
export async function settBetalt(botId, verdi) {
  await updateDoc(doc(db, SAM.BOTER, botId), { betalt: verdi });
}

/**
 * Like/unlike en bot. Sporer hvem som har likt via en anonym enhets-ID
 * (lagret i localStorage, se enhetsId() i botkassa-ui.js) i feltet
 * `likedAv` på selve bot-dokumentet, slik at én enhet ikke kan stable
 * opp uendelig mange likes på samme forseelse — og status er riktig
 * på tvers av innlastinger og andre enheter (siden feltet ligger i
 * Firestore og synces via lyttPaBoter).
 */
export async function likeBot(botId, enhetsId, harAlleredeLikt) {
  await updateDoc(doc(db, SAM.BOTER, botId), {
    likes:   increment(harAlleredeLikt ? -1 : 1),
    likedAv: harAlleredeLikt ? arrayRemove(enhetsId) : arrayUnion(enhetsId),
  });
}

// ════════════════════════════════════════════════════════
// NULLSTILLING — sletter all bot- og Fair Play-historikk for
// klubben. Feed og statistikk bygger på begge samlingene, så en
// tømming her nullstiller alt samtidig. Paragrafer og eventuell
// ventende kø i botkasseInnmeldinger røres ikke.
// Returnerer { boter, fairPlay } — antall slettet av hver.
// ════════════════════════════════════════════════════════
async function slettAlleIKollection(samlingsnavn, klubbId) {
  const snap = await getDocs(query(collection(db, samlingsnavn), where('klubbId', '==', klubbId)));
  const docs = snap.docs;
  const STORRELSE = 400; // under Firestores batch-grense på 500
  for (let i = 0; i < docs.length; i += STORRELSE) {
    const batch = writeBatch(db);
    docs.slice(i, i + STORRELSE).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  return docs.length;
}

export async function nullstillSesong(klubbId) {
  const boter    = await slettAlleIKollection(SAM.BOTER, klubbId);
  const fairPlay = await slettAlleIKollection(SAM.FAIRPLAY, klubbId);
  return { boter, fairPlay };
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
