// ════════════════════════════════════════════════════════
// app.js — Oppstart og modulkobling
// Botkassen — dedikert app for Pickleball Jæren.
// ════════════════════════════════════════════════════════
import { db } from './firebase.js';
import { naviger, visMelding, visFBFeil } from './ui.js';
import {
  registrerPinGetter, registrerKlubbIdGetter,
  krevAdmin, getErAdmin, nullstillAdmin, gjenopprettAdminStatus,
} from './admin.js';
import { botkassaUIInit, visBotkassaOversikt } from './botkassa-ui.js';
import { botkassaAdminUIInit } from './botkassa-admin-ui.js';

// ════════════════════════════════════════════════════════
// KLUBB — appen er dedikert til Pickleball Jæren.
// NB: PIN-en sjekkes kun i nettleseren og er synlig for alle som
// leser kildekoden. Den hindrer uhell, ikke målrettet juks.
// ════════════════════════════════════════════════════════
const AKTIV_KLUBB_ID = 'pickleball-jaeren';
const AKTIV_KLUBB    = { navn: 'Pickleball Jæren', pin: '9436' };

window.krevAdmin  = krevAdmin;
window.getErAdmin = getErAdmin;
window.visBotkassaOversikt = visBotkassaOversikt;

window.botkassaLoggUt = function() {
  nullstillAdmin();
  visMelding('Logget ut av Botkontroll');
  visBotkassaOversikt();
};

// Elementer med role="checkbox"/"radio"/"tab" og onclick skal også kunne
// brukes med tastatur (Enter/mellomrom), ikke bare trykk/klikk.
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest?.('[role="checkbox"],[role="radio"],[role="tab"]');
  if (el) { e.preventDefault(); el.click(); }
});

document.addEventListener('DOMContentLoaded', () => {
  if (!db) {
    visFBFeil('Får ikke kontakt med databasen. Sjekk nettforbindelsen og last siden på nytt.');
    return;
  }

  registrerKlubbIdGetter(() => AKTIV_KLUBB_ID);
  registrerPinGetter(() => AKTIV_KLUBB.pin);
  gjenopprettAdminStatus();

  botkassaUIInit({
    naviger,
    getAktivKlubbId: () => AKTIV_KLUBB_ID,
    getKlubbNavn: () => AKTIV_KLUBB.navn,
    krevAdmin,
    getErAdmin,
  });
  botkassaAdminUIInit({
    naviger,
    krevAdmin,
    getAktivKlubbId: () => AKTIV_KLUBB_ID,
  });

  visBotkassaOversikt();
});
