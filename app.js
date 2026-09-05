// ════════════════════════════════════════════════════════
// app.js — Oppstart og modulkobling
// Botkassa — dedikert app for Pickleball Jæren.
// ════════════════════════════════════════════════════════
import { db } from './firebase.js';
import { naviger, visMelding, visFBFeil, registrerBeforeunload } from './ui.js';
import {
  registrerPinGetter, registrerKlubbIdGetter,
  krevAdmin as krevAdminBase,
  getErAdmin, gjenopprettAdminStatus,
  pinInput, bekreftPin, lukkPinModal,
} from './admin.js';
import { botkassaUIInit, visBotkassaOversikt } from './botkassa-ui.js';
import { botkassaAdminUIInit } from './botkassa-admin-ui.js';

// Eksponer PIN-modal-funksjonene globalt (kalles fra inline onclick i index.html)
window.pinInput     = pinInput;
window.bekreftPin   = bekreftPin;
window.lukkPinModal = lukkPinModal;
window.visBotkassaOversikt = visBotkassaOversikt;

// ════════════════════════════════════════════════════════
// KLUBB — appen er dedikert til Pickleball Jæren.
// Samme PIN som resten av klubbens apper (Stafettligaen/Mesteren).
// ════════════════════════════════════════════════════════
const AKTIV_KLUBB_ID = 'pickleball-jaeren';
const AKTIV_KLUBB    = { navn: 'Pickleball Jæren', pin: '9436' };

function krevAdminMedDemo(tittel, tekst, callback) {
  krevAdminBase(tittel, tekst, callback, false);
}
window.krevAdmin = krevAdminMedDemo;
window.getErAdmin = getErAdmin;

// ════════════════════════════════════════════════════════
// OPPSTART
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  if (!db) {
    visFBFeil('Firebase er ikke konfigurert. Sjekk FB_CONFIG i firebase.js.');
    return;
  }

  registrerKlubbIdGetter(() => AKTIV_KLUBB_ID);
  registrerPinGetter(() => AKTIV_KLUBB.pin);
  gjenopprettAdminStatus();

  botkassaUIInit({
    naviger,
    getAktivKlubbId: () => AKTIV_KLUBB_ID,
    getKlubbNavn: () => AKTIV_KLUBB.navn,
  });
  botkassaAdminUIInit({
    naviger,
    krevAdmin: krevAdminMedDemo,
    getAktivKlubbId: () => AKTIV_KLUBB_ID,
  });

  registrerBeforeunload(() => false);

  naviger('botkassa-hjem');
  visBotkassaOversikt();
});
