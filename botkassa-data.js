// ════════════════════════════════════════════════════════
// botkassa-data.js — Felles datalager for Botkassen
//
// Én samling sanntidslyttere for hele appen. Både medlemsdelen
// (botkassa-ui.js) og Botkontroll (botkassa-admin-ui.js) leser
// herfra, slik at:
//   • hver Firestore-lytter bare startes én gang (halverer lesinger)
//   • en paragraf som endres i admin vises med en gang overalt
//
// Bruk:
//   await startData(klubbId)        — idempotent, trygt å kalle flere ganger
//   const data = hentData()         — samme objekt hele tiden, feltene oppdateres
//   abonner(hva => { ... })         — hva: 'paragrafer' | 'boter' | 'fairPlay' | 'ventende'
// ════════════════════════════════════════════════════════
import {
  hentSpillere, lyttPaParagrafer, lyttPaBoter, lyttPaVentende, lyttPaFairPlay,
} from './botkassa-logikk.js';

const data = {
  spillere:   [],
  paragrafer: [],
  boter:      [],
  fairPlay:   [],
  ventende:   [],
  klar: { boter: false, fairPlay: false, ventende: false },
};

const abonnenter = new Set();
let startetFor = null;
let startLofte = null;
let avslytt    = [];

export function hentData() { return data; }

export function abonner(fn) {
  abonnenter.add(fn);
  return () => abonnenter.delete(fn);
}

function varsle(hva) {
  abonnenter.forEach(fn => {
    try { fn(hva); } catch (e) { console.error('[Botkassen] abonnent feilet:', e); }
  });
}

export function startData(klubbId) {
  if (startetFor === klubbId && startLofte) return startLofte;

  avslytt.forEach(f => f());
  avslytt = [];
  startetFor = klubbId;
  data.klar = { boter: false, fairPlay: false, ventende: false };

  startLofte = (async () => {
    data.spillere = await hentSpillere(klubbId);

    // Vent på første paragrafliste før UI-et får lov å tegne skjemaer.
    await new Promise(resolve => {
      let forste = true;
      avslytt.push(lyttPaParagrafer(klubbId, liste => {
        data.paragrafer = liste;
        if (forste) { forste = false; resolve(); }
        varsle('paragrafer');
      }));
    });

    avslytt.push(lyttPaBoter(klubbId, liste => {
      data.boter = liste; data.klar.boter = true; varsle('boter');
    }));
    avslytt.push(lyttPaFairPlay(klubbId, liste => {
      data.fairPlay = liste; data.klar.fairPlay = true; varsle('fairPlay');
    }));
    avslytt.push(lyttPaVentende(klubbId, liste => {
      data.ventende = liste; data.klar.ventende = true; varsle('ventende');
    }));
    return data;
  })();

  return startLofte;
}
