// ════════════════════════════════════════════════════════
// admin.js — PIN-beskyttelse
// app.js registrerer PIN-getter ved oppstart via registrerPinGetter().
// ════════════════════════════════════════════════════════
let _pinGetter     = () => '';
let _klubbIdGetter = () => '';

export function registrerPinGetter(fn) { _pinGetter = fn; }
export function registrerKlubbIdGetter(fn) { _klubbIdGetter = fn; }

function _adminNøkkel() {
  const klubbId = _klubbIdGetter();
  return klubbId ? `bk_admin_${klubbId}` : 'bk_admin';
}

let pinCallback = null;
let pinForsok   = 0;
let _erAdmin    = false;

const PIN_MAKS_FORSOK = 5;

export function getErAdmin() { return _erAdmin; }
export function setErAdmin(v) {
  _erAdmin = v;
  if (v) localStorage.setItem(_adminNøkkel(), '1');
  else   localStorage.removeItem(_adminNøkkel());
}
export function nullstillAdmin() {
  _erAdmin = false;
  localStorage.removeItem(_adminNøkkel());
}

export function gjenopprettAdminStatus() {
  _erAdmin = localStorage.getItem(_adminNøkkel()) === '1';
  return _erAdmin;
}

export function krevAdmin(tittel, tekst, callback, erDemoModus = false) {
  if (_erAdmin || erDemoModus) {
    if (typeof callback === 'function') callback();
    return;
  }
  pinCallback = callback;
  pinForsok   = 0;
  document.getElementById('pin-tittel').textContent = tittel;
  document.getElementById('pin-tekst').textContent  = tekst;
  document.getElementById('pin-feil').textContent   = '';
  [0,1,2,3].forEach(i => { document.getElementById('pin'+i).value = ''; });
  document.getElementById('modal-pin').classList.add('vis');
  setTimeout(() => document.getElementById('pin0')?.focus(), 260);
}

export function pinInput(indeks) {
  const inp   = document.getElementById('pin' + indeks);
  const verdi = inp.value.replace(/[^0-9]/g, '').slice(-1);
  inp.value   = verdi;
  if (verdi && indeks < 3) document.getElementById('pin' + (indeks + 1))?.focus();
  else if (verdi && indeks === 3) bekreftPin();
}
window.pinInput = pinInput;

export function bekreftPin() {
  const pin = [0,1,2,3].map(i => document.getElementById('pin'+i).value).join('');
  if (pin === _pinGetter()) {
    setErAdmin(true);
    const cb = pinCallback;
    lukkPinModal();
    if (typeof cb === 'function') cb();
  } else {
    pinForsok++;
    const igjen = PIN_MAKS_FORSOK - pinForsok;
    if (pinForsok >= PIN_MAKS_FORSOK) {
      document.getElementById('pin-feil').textContent = 'For mange feil forsøk. Lukk og prøv igjen.';
      document.querySelectorAll('.pin-siffer').forEach(el => el.disabled = true);
    } else {
      document.getElementById('pin-feil').textContent = `Feil PIN. ${igjen} forsøk igjen.`;
    }
    [0,1,2,3].forEach(i => { document.getElementById('pin'+i).value = ''; });
    document.getElementById('pin0')?.focus();
  }
}
window.bekreftPin = bekreftPin;

export function lukkPinModal() {
  document.getElementById('modal-pin').classList.remove('vis');
  document.querySelectorAll('.pin-siffer').forEach(el => { el.disabled = false; el.value = ''; });
  document.getElementById('pin-feil').textContent = '';
  pinCallback = null;
  pinForsok   = 0;
}
window.lukkPinModal = lukkPinModal;
