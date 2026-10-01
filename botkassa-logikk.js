// ════════════════════════════════════════════════════════
// botkassa-logikk.js — Firestore-lag for Botkassen
//
// Samlinger (må finnes i firestore.rules, se README):
//   botkasseParagrafer/{klubbId}   — redigerbar §3-liste per klubb
//   botkasseInnmeldinger/{id}      — meldinger som venter på godkjenning
//   botkasseBoter/{id}             — godkjente, gjeldende bøter
//   botkasseFairPlay/{id}          — Fair Play-poeng
//
// Leser spillernavn fra den delte players-samlingen som klubbens
// andre apper også bruker.
//
// NB: samlingsnavnene beholder "botkasse"-prefikset selv om appen
// nå heter Botkassen — å endre dem ville gjort eksisterende data
// usynlig.
// ════════════════════════════════════════════════════════
import {
  db, collection, doc, addDoc, updateDoc, setDoc, getDocs,
  query, where, orderBy, onSnapshot, serverTimestamp, increment, writeBatch,
  arrayUnion, arrayRemove, runTransaction,
} from './firebase.js';

const SAM = {
  SPILLERE:     'players',
  PARAGRAFER:   'botkasseParagrafer',
  INNMELDINGER: 'botkasseInnmeldinger',
  BOTER:        'botkasseBoter',
  FAIRPLAY:     'botkasseFairPlay',
};

// ════════════════════════════════════════════════════════
// BØTEGRENSER — én kilde til sannhet for hele appen.
// En vanlig hendelse kan maks gi MAKS_BOT. Karma dobler, men
// aldri over MAKS_BOT_KARMA.
// ════════════════════════════════════════════════════════
export const MAKS_BOT       = 50;
export const MAKS_BOT_KARMA = 100;

export class AlleredeBehandletFeil extends Error {
  constructor() { super('Innmeldingen er allerede behandlet'); this.name = 'AlleredeBehandletFeil'; }
}
export class UgyldigBelopFeil extends Error {
  constructor() { super(`Beløpet må være mellom 1 og ${MAKS_BOT} kr`); this.name = 'UgyldigBelopFeil'; }
}

// ════════════════════════════════════════════════════════
// STANDARD-PARAGRAFER — brukes til klubben har lagret sine
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
  { id:'p9',  num:9,  emoji:'⚖️', tittel:'For stor seiersmargin i sosialspill',   belop:0,  skjonn:true,  skjonnMin:0,  skjonnMax:50, ingenFast:true },
  { id:'p10', num:10, emoji:'🚨', tittel:'Botpoliti (overivrig tysting)',         belop:20, skjonn:false },
];

/**
 * Sørger for at en paragraf aldri kan gi mer enn MAKS_BOT, også om
 * den ble lagret i Firestore før grensen kom (tidligere var maks 100).
 */
export function normaliserParagraf(p) {
  const klem = v => Math.max(0, Math.min(MAKS_BOT, Number(v) || 0));
  const ut = { ...p, belop: klem(p.belop) };
  if (p.skjonn) {
    ut.skjonnMax = klem(p.skjonnMax ?? MAKS_BOT);
    ut.skjonnMin = Math.min(klem(p.skjonnMin ?? 0), ut.skjonnMax);
    if (!p.ingenFast) ut.belop = Math.min(Math.max(ut.belop, ut.skjonnMin), ut.skjonnMax);
  }
  return ut;
}

/** Tekst som beskriver beløpet til en paragraf, f.eks. «20 kr» eller «20–50 kr». */
export function belopTekst(p) {
  if (p.ingenFast || p.skjonn) return `${p.skjonnMin}–${p.skjonnMax} kr`;
  return `${p.belop} kr`;
}

// ════════════════════════════════════════════════════════
// FAIR PLAY-KATEGORIER — faste, ikke redigerbare.
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
    console.warn('[Botkassen] hentSpillere:', e?.message);
    return [];
  }
}

// ════════════════════════════════════════════════════════
// PARAGRAFER
// ════════════════════════════════════════════════════════
export async function lagreParagrafer(klubbId, paragrafer) {
  await setDoc(doc(db, SAM.PARAGRAFER, klubbId), {
    paragrafer: paragrafer.map(normaliserParagraf),
    oppdatert: serverTimestamp(),
  });
}

// ════════════════════════════════════════════════════════
// REALTIME-LYTTERE — returnerer unsubscribe-funksjon.
// Ingen limit() på bøter/Fair Play: statistikk, saldo og
// botligaen må regnes ut fra HELE sesongen. Nullstill ved
// sesongstart holder mengden nede.
// ════════════════════════════════════════════════════════
export function lyttPaParagrafer(klubbId, callback) {
  const standard = () => DEFAULT_PARAGRAFER.map(normaliserParagraf);
  return onSnapshot(
    doc(db, SAM.PARAGRAFER, klubbId),
    snap => {
      const liste = snap.exists() && Array.isArray(snap.data().paragrafer) && snap.data().paragrafer.length
        ? snap.data().paragrafer.map(normaliserParagraf)
        : standard();
      callback(liste);
    },
    err => { console.warn('[Botkassen] lyttPaParagrafer, bruker standard:', err?.message); callback(standard()); },
  );
}

export function lyttPaBoter(klubbId, callback) {
  return onSnapshot(
    query(collection(db, SAM.BOTER), where('klubbId','==',klubbId), orderBy('opprettet','desc')),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => console.warn('[Botkassen] lyttPaBoter:', err?.message),
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
    err => console.warn('[Botkassen] lyttPaVentende:', err?.message),
  );
}

export function lyttPaFairPlay(klubbId, callback) {
  return onSnapshot(
    query(collection(db, SAM.FAIRPLAY), where('klubbId','==',klubbId), orderBy('opprettet','desc')),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => console.warn('[Botkassen] lyttPaFairPlay:', err?.message),
  );
}

/**
 * Henter alle innmeldinger en spiller selv har sendt inn, uansett status.
 * Krever en sammensatt indeks (klubbId + meldtAvId + opprettet) — første
 * kjøring uten indeks gir en feilmelding i konsollen med lenke for å
 * opprette den.
 */
export async function hentMineInnmeldinger(klubbId, spillerId) {
  if (!klubbId || !spillerId || !db) return [];
  try {
    const snap = await getDocs(query(
      collection(db, SAM.INNMELDINGER),
      where('klubbId', '==', klubbId),
      where('meldtAvId', '==', spillerId),
      orderBy('opprettet', 'desc'),
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[Botkassen] hentMineInnmeldinger:', e?.message);
    return [];
  }
}

// ════════════════════════════════════════════════════════
// INNMELDING — opprette, svare, avvise, godkjenne
// ════════════════════════════════════════════════════════
export async function opprettInnmelding({ klubbId, meldtAvId, meldtAvNavn, motSpillere, paragrafId, paragrafTittel, foreslattBelop, kommentar }) {
  await addDoc(collection(db, SAM.INNMELDINGER), {
    klubbId,
    meldtAvId, meldtAvNavn,
    motSpillere,                 // [{id, navn}]
    paragrafId, paragrafTittel,
    foreslattBelop: Math.min(Number(foreslattBelop) || 0, MAKS_BOT),
    kommentar: kommentar || '',
    status: 'venter',
    opprettet: serverTimestamp(),
  });
}

/**
 * Lagrer en anklagets forklaring på en ventende innmelding, én per spiller.
 * Følger med til bot-posten hvis saken godkjennes.
 */
export async function svarPaInnmelding(innmeldingId, spillerId, tekst) {
  await updateDoc(doc(db, SAM.INNMELDINGER, innmeldingId), {
    [`svar.${spillerId}`]: { tekst, tidspunkt: serverTimestamp() },
  });
}

export async function avvisInnmelding(innmeldingId, behandletAvNavn) {
  const ref = doc(db, SAM.INNMELDINGER, innmeldingId);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().status !== 'venter') throw new AlleredeBehandletFeil();
    tx.update(ref, { status: 'avvist', behandletAvNavn, behandletTidspunkt: serverTimestamp() });
  });
}

/**
 * Har spilleren en ubrukt karma-ladning for denne paragrafen?
 *
 * Ladningsmodell: hver gang spilleren har meldt inn NOEN ANDRE for en
 * paragraf (og det ble godkjent), lader de opp én dobling mot seg selv
 * for samme paragraf. Ladningen brukes opp neste gang de selv bøtelegges.
 *
 * Teller unike innmeldinger (en lagstraff gir én ladning, ikke én per
 * spiller). Selvrapportering teller IKKE — §4 skal belønne ærlighet,
 * ikke gi deg en karma-felle mot deg selv.
 */
async function harKarmaLadning(klubbId, spillerId, paragrafId) {
  const meldtSnap = await getDocs(query(
    collection(db, SAM.BOTER),
    where('klubbId', '==', klubbId),
    where('meldtAvId', '==', spillerId),
    where('paragrafId', '==', paragrafId),
  ));
  const ladninger = new Set(
    meldtSnap.docs.map(d => d.data())
      .filter(b => b.innmeldingId && b.spillerId !== spillerId)
      .map(b => b.innmeldingId)
  );
  if (!ladninger.size) return false;

  const bruktSnap = await getDocs(query(
    collection(db, SAM.BOTER),
    where('klubbId', '==', klubbId),
    where('spillerId', '==', spillerId),
    where('paragrafId', '==', paragrafId),
    where('karmaDoblet', '==', true),
  ));
  return bruktSnap.size < ladninger.size;
}

/**
 * Godkjenner en innmelding. Oppretter én bot per spiller i motSpillere
 * (lagstraff), med karma-dobling der det gjelder.
 *
 * Alt skrives i én transaksjon som først sjekker at innmeldingen
 * fortsatt har status «venter». Det betyr at et dobbelttrykk, eller to
 * admins som godkjenner samtidig, aldri kan gi doble bøter — og at en
 * feil halvveis ikke etterlater et halvt godkjent sett.
 *
 * (Karma-oppslagene er spørringer og kan ikke gjøres inne i en
 * Firestore-transaksjon på klient, så de kjøres rett før.)
 */
export async function godkjennInnmelding(innmelding, baseBelop, behandletAvNavn) {
  const base = Math.round(Number(baseBelop));
  if (!Number.isFinite(base) || base < 1 || base > MAKS_BOT) throw new UgyldigBelopFeil();

  const { klubbId, paragrafId } = innmelding;
  const karma = {};
  for (const mot of innmelding.motSpillere) {
    karma[mot.id] = await harKarmaLadning(klubbId, mot.id, paragrafId);
  }

  const innRef = doc(db, SAM.INNMELDINGER, innmelding.id);
  await runTransaction(db, async tx => {
    const snap = await tx.get(innRef);
    if (!snap.exists() || snap.data().status !== 'venter') throw new AlleredeBehandletFeil();
    const fersk = snap.data(); // bruk ferskeste svar/forklaringer

    for (const mot of fersk.motSpillere) {
      const karmaTreff = !!karma[mot.id];
      tx.set(doc(collection(db, SAM.BOTER)), {
        klubbId,
        innmeldingId: innmelding.id,
        spillerId: mot.id, spillerNavn: mot.navn,
        paragrafId: fersk.paragrafId, paragrafTittel: fersk.paragrafTittel,
        belop: karmaTreff ? Math.min(base * 2, MAKS_BOT_KARMA) : base,
        karmaDoblet: karmaTreff,
        kommentar: fersk.kommentar || '',
        forklaring: fersk.svar?.[mot.id]?.tekst || '',
        meldtAvId: fersk.meldtAvId, meldtAvNavn: fersk.meldtAvNavn,
        behandletAvNavn,
        betalt: false,
        likes: 0,
        opprettet: serverTimestamp(),
      });
    }
    tx.update(innRef, { status: 'godkjent', behandletAvNavn, behandletTidspunkt: serverTimestamp() });
  });
}

// ════════════════════════════════════════════════════════
// FAIR PLAY-POENG — ingen godkjenning, ingen kroneverdi, ingen
// kobling til karma (så ingen kan «kjøpe seg fri» via en kompis).
// ════════════════════════════════════════════════════════
export async function opprettFairPlayPoeng({ klubbId, meldtAvId, meldtAvNavn, motSpillere, kategoriId, kategoriTittel, kommentar }) {
  const batch = writeBatch(db);
  motSpillere.forEach(mot => {
    batch.set(doc(collection(db, SAM.FAIRPLAY)), {
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

/** Like/unlike — én like per enhet, sporet via anonym enhets-ID i `likedAv`. */
export async function likeBot(botId, enhetsId, harAlleredeLikt) {
  await updateDoc(doc(db, SAM.BOTER, botId), {
    likes:   increment(harAlleredeLikt ? -1 : 1),
    likedAv: harAlleredeLikt ? arrayRemove(enhetsId) : arrayUnion(enhetsId),
  });
}

// ════════════════════════════════════════════════════════
// NULLSTILLING — sletter all bot- og Fair Play-historikk for
// klubben. Paragrafer og ventende innmeldinger røres ikke.
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
// STATISTIKK-HJELPERE (rene funksjoner)
// Grupperer på ID, ikke navn — to spillere med samme navn blir
// ikke slått sammen. Navnet hentes fra nyeste post (listene
// kommer sortert nyest først).
// ════════════════════════════════════════════════════════
export function rangering(liste, idFelt, navnFelt, verdiAv = () => 1) {
  const rader = new Map();
  for (const x of liste) {
    const id = x[idFelt];
    if (!id) continue;
    const rad = rader.get(id) ?? { id, navn: x[navnFelt] ?? '?', verdi: 0 };
    rad.verdi += verdiAv(x);
    rader.set(id, rad);
  }
  return [...rader.values()].sort((a, b) => b.verdi - a.verdi);
}

/** Én post per innmelding — så en lagstraff mot fire teller som én innmelding. */
export function unikePerInnmelding(boter) {
  const sett = new Set();
  return boter.filter(b => {
    const nokkel = b.innmeldingId || b.id;
    if (sett.has(nokkel)) return false;
    sett.add(nokkel);
    return true;
  });
}
