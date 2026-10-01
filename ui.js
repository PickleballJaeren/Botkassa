// ════════════════════════════════════════════════════════
// ui.js — Generelle UI-hjelpere
// Toast-meldinger, Firebase-feilbanner, XSS-escaping og navigasjon.
// ════════════════════════════════════════════════════════
let toastTimer = null;

export function visMelding(tekst, type = 'ok', varighet = 2800) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = tekst;
  t.className   = 'toast' + (type === 'feil' ? ' feil' : type === 'advarsel' ? ' advarsel' : '');
  t.classList.add('vis');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('vis'), varighet);
}

export function visFBFeil(tekst) {
  const banner = document.getElementById('firebase-feil-banner');
  const span   = document.getElementById('firebase-feil-tekst');
  if (banner && span) { span.textContent = tekst; banner.classList.add('vis'); }
  console.error('[Firebase]', tekst);
}

export function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function naviger(skjerm) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('skjerm-' + skjerm);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
}
window.naviger = naviger;

export function registrerBeforeunload(harUlagredeEndringer) {
  window.addEventListener('beforeunload', e => {
    if (harUlagredeEndringer()) { e.preventDefault(); e.returnValue = ''; }
  });
}

/**
 * Bytter innholdet i `el` uten å ødelegge for noen som holder på å skrive.
 *
 * Sanntidslyttere kan fyre når som helst (noen liker en bot, en ny
 * innmelding kommer inn …). En vanlig innerHTML-oppdatering ville da
 * slettet teksten brukeren skriver og lukket tastaturet.
 *
 *  • Har brukeren fokus i et felt inne i `el`, utsettes oppdateringen
 *    til fokus forlater området.
 *  • Felt merket `data-bevar` (med id) beholder verdien sin.
 *  • Elementer merket `data-bevar-vis` (med id) beholder synlighet
 *    (f.eks. en svar-boks som er åpnet).
 */
export function renderTrygt(el, lagHtml) {
  if (!el) return;
  const erRedigerbar = x => x && el.contains(x) && x.matches('input, textarea, select');

  if (erRedigerbar(document.activeElement)) {
    el._ventendeRender = lagHtml;
    if (!el._harFokusLytter) {
      el._harFokusLytter = true;
      el.addEventListener('focusout', () => {
        // Litt forsinkelse, så et trykk på «Send»-knappen rekker å registreres
        // før innholdet tegnes på nytt.
        setTimeout(() => {
          if (el._ventendeRender && !erRedigerbar(document.activeElement)) {
            const fn = el._ventendeRender;
            el._ventendeRender = null;
            renderTrygt(el, fn);
          }
        }, 250);
      });
    }
    return;
  }

  el._ventendeRender = null;
  const verdier = {};
  el.querySelectorAll('[data-bevar][id]').forEach(x => { verdier[x.id] = x.value; });
  const synlighet = {};
  el.querySelectorAll('[data-bevar-vis][id]').forEach(x => { synlighet[x.id] = x.style.display; });

  el.innerHTML = lagHtml();

  Object.entries(verdier).forEach(([id, v]) => {
    const x = document.getElementById(id);
    if (x && el.contains(x)) x.value = v;
  });
  Object.entries(synlighet).forEach(([id, v]) => {
    const x = document.getElementById(id);
    if (x && el.contains(x)) x.style.display = v;
  });
}
