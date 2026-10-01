// ════════════════════════════════════════════════════════
// botkassa-admin-ui.js — «Botkontroll»: godkjenne/avvise
// innmeldinger, betalingsstatus, redigere paragrafer, dele
// appen og nullstille sesongen.
//
// Data kommer fra det felles datalageret i botkassa-data.js.
// ════════════════════════════════════════════════════════
import { escHtml, visMelding, renderTrygt } from './ui.js';
import {
  lagreParagrafer, godkjennInnmelding, avvisInnmelding, settBetalt, nullstillSesong,
  MAKS_BOT, MAKS_BOT_KARMA, AlleredeBehandletFeil, UgyldigBelopFeil,
} from './botkassa-logikk.js';
import { startData, hentData, abonner } from './botkassa-data.js';

let _naviger = () => {};
let _krevAdmin = (tittel, tekst, cb) => cb();
let _getAktivKlubbId = () => null;

const data = hentData();
let adminNavn = '';
let aktivTab  = 'kø';
const behandles = new Set(); // innmeldinger som er under godkjenning/avvisning akkurat nå

export function botkassaAdminUIInit({ naviger, krevAdmin, getAktivKlubbId }) {
  _naviger = naviger;
  _krevAdmin = krevAdmin;
  _getAktivKlubbId = getAktivKlubbId;

  abonner(hva => {
    if (!document.getElementById('skjerm-botkassa-admin')?.classList.contains('active')) return;
    if ((hva === 'ventende'   && aktivTab === 'kø') ||
        (hva === 'boter'      && aktivTab === 'bøter') ||
        (hva === 'paragrafer' && aktivTab === 'paragrafer')) renderInnhold();
  });
}

function innholdEl() { return document.getElementById('botkassa-admin-innhold'); }

export function visBotkassaAdmin() {
  const klubbId = _getAktivKlubbId();
  if (!klubbId) return;

  _krevAdmin('Botkontroll', 'Kun botansvarlig/admin kan behandle innmeldinger.', async () => {
    _naviger('botkassa-admin');
    adminNavn = localStorage.getItem('bk_admin_navn_' + klubbId) || '';
    innholdEl().innerHTML = `<div class="laster"><span class="laster-snurr"></span> Laster …</div>`;
    await startData(klubbId);
    renderTabs();
    renderInnhold();
  });
}
window.visBotkassaAdmin = visBotkassaAdmin;

function renderTabs() {
  document.querySelectorAll('#botkassa-admin-tabs .bk-tab').forEach(el => {
    const aktiv = el.dataset.tab === aktivTab;
    el.classList.toggle('aktiv', aktiv);
    el.setAttribute('aria-selected', String(aktiv));
  });
}
window.botkassaByttAdminTab = function(tab) {
  aktivTab = tab;
  renderTabs();
  innholdEl().innerHTML = ''; // nytt faneinnhold, ingenting å bevare
  renderInnhold();
};

function renderInnhold() {
  if (!adminNavn) return renderVelgNavn();
  if (aktivTab === 'kø')         return renderKo();
  if (aktivTab === 'bøter')      return renderBoter();
  if (aktivTab === 'paragrafer') return renderParagrafer();
  if (aktivTab === 'del')        return renderDel();
  if (aktivTab === 'nullstill')  return renderNullstill();
}

function renderVelgNavn() {
  innholdEl().innerHTML = `
    <label for="botkassa-admin-navn-select">Hvem er du? (vises som «behandlet av» på sakene)</label>
    <select id="botkassa-admin-navn-select" style="margin-bottom:14px">
      <option value="" disabled selected>Velg deg selv …</option>
      ${data.spillere.map(s => `<option value="${escHtml(s.navn)}">${escHtml(s.navn)}</option>`).join('')}
    </select>
    <button class="knapp knapp-primaer" onclick="window.botkassaSettAdminNavn()">Fortsett</button>`;
}
window.botkassaSettAdminNavn = function() {
  const val = document.getElementById('botkassa-admin-navn-select').value;
  if (!val) return visMelding('Velg et navn', 'advarsel');
  adminNavn = val;
  localStorage.setItem('bk_admin_navn_' + _getAktivKlubbId(), val);
  renderInnhold();
};

// ════════════════════════════════════════════════════════
// TIL BEHANDLING
// ════════════════════════════════════════════════════════
function erSelvrapportert(im) {
  return im.motSpillere?.some(m => m.id === im.meldtAvId);
}

/** Beløpet «Godkjenn» bruker uten justering, eller 0 hvis det må justeres. */
function standardBelop(im) {
  const b = Number(im.foreslattBelop) || 0;
  return b >= 1 && b <= MAKS_BOT ? b : 0;
}

function koKortHtml(im) {
  const id       = escHtml(im.id);
  const opptatt  = behandles.has(im.id) ? 'disabled' : '';
  const belop    = standardBelop(im);
  const selv     = erSelvrapportert(im);
  const forslag  = selv && belop ? Math.max(1, Math.ceil(belop / 2)) : Math.min(Number(im.foreslattBelop) || 0, MAKS_BOT);

  return `
    <div class="bk-admin-card" id="bk-kort-${id}">
      <div class="bk-admin-head"><div><strong>${escHtml(im.meldtAvNavn)}</strong> → ${escHtml(im.motSpillere.map(m => m.navn).join(', '))}</div></div>
      <div class="bk-feed-paragraf">${escHtml(im.paragrafTittel)} · foreslått ${im.foreslattBelop || 0} kr</div>
      ${selv ? `<div class="bk-verkty-notis" style="margin:6px 0 8px">🙋 Selvrapportert — etter §4 kan boten reduseres med 50 % (${forslag} kr). Bruk «Juster».</div>` : ''}
      ${im.kommentar ? `<div class="bk-feed-kommentar">«${escHtml(im.kommentar)}»</div>` : ''}
      ${im.motSpillere.map(m => im.svar?.[m.id]?.tekst
          ? `<div class="bk-feed-forklaring">😅 ${escHtml(m.navn)} forklarer: «${escHtml(im.svar[m.id].tekst)}»</div>`
          : '').join('')}
      <div class="bk-admin-row">
        <button class="knapp knapp-ok knapp-liten" ${opptatt} onclick="window.botkassaGodkjenn('${id}')">${belop ? `Godkjenn ${belop} kr` : 'Godkjenn'}</button>
        <button class="knapp knapp-omriss knapp-liten" ${opptatt} onclick="window.botkassaVisJuster('${id}')">Juster</button>
        <button class="knapp knapp-fare knapp-liten" ${opptatt} onclick="window.botkassaAvvis('${id}')">Avvis</button>
      </div>
      <div class="bk-inline-input" id="bk-juster-${id}" data-bevar-vis style="display:none">
        <input type="number" inputmode="numeric" min="1" max="${MAKS_BOT}" id="bk-juster-belop-${id}" data-bevar placeholder="1–${MAKS_BOT} kr" value="${forslag || ''}">
        <button class="knapp knapp-primaer knapp-liten" ${opptatt} onclick="window.botkassaGodkjenn('${id}', true)">Bekreft</button>
      </div>
      <p class="bk-liten-tekst" style="margin-top:8px">Maks ${MAKS_BOT} kr. Karma kan doble til maks ${MAKS_BOT_KARMA} kr og legges på automatisk.</p>
    </div>`;
}

function renderKo() {
  const el = innholdEl();
  if (!data.ventende.length) {
    el.innerHTML = `<div class="tom-tilstand">Ingen innmeldinger venter. <img class="agurk-emoji" src="agurkseddel.png" alt="🥒"></div>`;
    return;
  }
  renderTrygt(el, () => data.ventende.map(koKortHtml).join(''));
}

function settKortOpptatt(id, opptatt) {
  document.querySelectorAll(`#bk-kort-${CSS.escape(id)} button`).forEach(b => { b.disabled = opptatt; });
}

window.botkassaVisJuster = function(id) {
  const box = document.getElementById('bk-juster-' + id);
  box.style.display = box.style.display === 'none' ? 'flex' : 'none';
  if (box.style.display === 'flex') document.getElementById('bk-juster-belop-' + id)?.focus();
};

window.botkassaAvvis = async function(id) {
  if (behandles.has(id)) return;
  behandles.add(id); settKortOpptatt(id, true);
  try {
    await avvisInnmelding(id, adminNavn);
    visMelding('Innmelding avvist');
  } catch (e) {
    if (e instanceof AlleredeBehandletFeil) visMelding('Saken er allerede behandlet', 'advarsel');
    else { console.warn('[Botkassen] avvisning feilet:', e?.message); visMelding('Kunne ikke avvise — prøv igjen', 'feil'); }
  } finally {
    behandles.delete(id); settKortOpptatt(id, false);
  }
};

window.botkassaGodkjenn = async function(id, justert = false) {
  if (behandles.has(id)) return; // stopper dobbelttrykk
  const im = data.ventende.find(x => x.id === id);
  if (!im) return;

  let baseBelop = standardBelop(im);
  if (justert) {
    baseBelop = Math.round(Number(document.getElementById('bk-juster-belop-' + id).value));
    if (!(baseBelop >= 1 && baseBelop <= MAKS_BOT)) return visMelding(`Beløpet må være mellom 1 og ${MAKS_BOT} kr`, 'advarsel');
  }
  if (!baseBelop) return visMelding('Denne trenger et beløp — trykk «Juster»', 'advarsel');

  behandles.add(id); settKortOpptatt(id, true);
  try {
    await godkjennInnmelding(im, baseBelop, adminNavn);
    visMelding('Bot godkjent! 🥒');
  } catch (e) {
    if (e instanceof AlleredeBehandletFeil) visMelding('Saken er allerede behandlet', 'advarsel');
    else if (e instanceof UgyldigBelopFeil) visMelding(e.message, 'advarsel');
    else { console.warn('[Botkassen] godkjenning feilet:', e?.message); visMelding('Kunne ikke godkjenne — prøv igjen', 'feil'); }
  } finally {
    behandles.delete(id); settKortOpptatt(id, false);
  }
};

// ════════════════════════════════════════════════════════
// BØTER & BETALING
// ════════════════════════════════════════════════════════
function renderBoter() {
  const el = innholdEl();
  if (!data.boter.length) { el.innerHTML = `<div class="tom-tilstand">Ingen bøter registrert ennå.</div>`; return; }
  const utestaende = data.boter.filter(b => !b.betalt).reduce((s, b) => s + (b.belop || 0), 0);
  renderTrygt(el, () => `
    <div class="bk-stat-tile full" style="margin-bottom:16px"><span class="bk-stat-label" style="margin:0">Utestående</span><span class="bk-stat-value">${utestaende.toLocaleString('nb-NO')} kr</span></div>
    ${data.boter.map(b => `
      <div class="bk-admin-card">
        <div class="bk-rad-mellom">
          <div><strong>${escHtml(b.spillerNavn)}</strong> — ${escHtml(b.paragrafTittel)}${b.karmaDoblet ? ' ⚖️' : ''}</div>
          <div class="bk-feed-belop">${b.belop} kr</div>
        </div>
        <div class="bk-rad-mellom">
          <span class="bk-liten-tekst">${b.betalt ? '🟢 Betalt' : '🟠 Ikke betalt'}</span>
          <button class="knapp ${b.betalt ? 'knapp-omriss' : 'knapp-ok'} knapp-liten" onclick="window.botkassaSettBetalt('${escHtml(b.id)}', ${!b.betalt}, this)">${b.betalt ? 'Angre' : 'Merk betalt'}</button>
        </div>
      </div>`).join('')}
    <p class="bk-verkty-notis">💡 Dette markerer kun betalingsstatus manuelt. Ekte Vipps-integrasjon er et eget, senere steg.</p>
  `);
}
window.botkassaSettBetalt = async function(id, verdi, btn) {
  if (btn) btn.disabled = true;
  try { await settBetalt(id, verdi); }
  catch (e) { visMelding('Kunne ikke oppdatere — prøv igjen', 'feil'); if (btn) btn.disabled = false; }
};

// ════════════════════════════════════════════════════════
// PARAGRAFER
// Endringer lagres i Firestore; sanntidslytteren i datalageret
// sørger for at alle skjermer (også medlemmenes) oppdateres.
// Handlinger bruker paragrafens id, ikke plass i lista, siden
// lista kan endre seg mens man redigerer.
// ════════════════════════════════════════════════════════
function talliFelt(id, verdi, plassholder) {
  return `<input type="number" inputmode="numeric" min="0" max="${MAKS_BOT}" id="${id}" data-bevar value="${verdi}" placeholder="${plassholder}" aria-label="${plassholder}">`;
}

function paragrafKortHtml(p) {
  const id = escHtml(p.id);
  let felt;
  if (p.ingenFast) {
    felt = `${talliFelt(`bk-par-min-${id}`, p.skjonnMin, 'Min kr')}${talliFelt(`bk-par-maks-${id}`, p.skjonnMax, 'Maks kr')}`;
  } else if (p.skjonn) {
    felt = `${talliFelt(`bk-par-belop-${id}`, p.belop, 'Foreslått kr')}${talliFelt(`bk-par-min-${id}`, p.skjonnMin, 'Min kr')}${talliFelt(`bk-par-maks-${id}`, p.skjonnMax, 'Maks kr')}`;
  } else {
    felt = talliFelt(`bk-par-belop-${id}`, p.belop, 'Beløp kr');
  }
  const forklaring = p.ingenFast ? 'Skjønn: min / maks' : p.skjonn ? 'Foreslått / min / maks' : 'Fast beløp';
  return `
    <div class="bk-admin-card">
      <div class="bk-rad-mellom">
        <div>${p.emoji} <strong>§${p.num} — ${escHtml(p.tittel)}</strong></div>
        <button class="knapp knapp-omriss knapp-liten bk-fjern-btn" onclick="window.botkassaFjernParagraf('${id}')">Fjern</button>
      </div>
      <div class="bk-liten-tekst">${forklaring}</div>
      <div class="bk-inline-input">
        ${felt}
        <button class="knapp knapp-primaer knapp-liten" onclick="window.botkassaLagreParagraf('${id}', this)">Lagre</button>
      </div>
    </div>`;
}

function renderParagrafer() {
  renderTrygt(innholdEl(), () => `
    <p class="bk-verkty-notis">Endringer gjelder hele klubben og vises med en gang på «Meld inn bot» og «Regler». Maks ${MAKS_BOT} kr per hendelse.</p>
    ${data.paragrafer.map(paragrafKortHtml).join('')}

    <div class="bk-admin-card">
      <div class="bk-rad-mellom"><div><strong>➕ Legg til ny paragraf</strong></div></div>
      <p class="bk-liten-tekst" style="margin-bottom:10px">Bruk denne til f.eks. en jokerparagraf for episoder som ikke passer noe annet sted.</p>
      <label for="bk-ny-par-emoji">Emoji</label>
      <input type="text" id="bk-ny-par-emoji" data-bevar placeholder="🃏" maxlength="4" style="margin-bottom:10px">
      <label for="bk-ny-par-tittel">Tittel</label>
      <input type="text" id="bk-ny-par-tittel" data-bevar maxlength="80" placeholder="F.eks. «Kastet racketen»" style="margin-bottom:10px">
      <label for="bk-ny-par-type">Type</label>
      <select id="bk-ny-par-type" data-bevar onchange="window.botkassaByttNyParagrafType()" style="margin-bottom:10px">
        <option value="fast">Fast beløp</option>
        <option value="skjonn">Skjønn — botansvarlig bestemmer beløp ved godkjenning</option>
      </select>
      <div id="bk-ny-par-fast-felt" data-bevar-vis>
        <label for="bk-ny-par-belop">Beløp (1–${MAKS_BOT} kr)</label>
        <input type="number" inputmode="numeric" min="1" max="${MAKS_BOT}" id="bk-ny-par-belop" data-bevar placeholder="20" style="margin-bottom:10px">
      </div>
      <div id="bk-ny-par-skjonn-felt" data-bevar-vis style="display:none" class="bk-inline-input">
        <input type="number" inputmode="numeric" min="0" max="${MAKS_BOT}" id="bk-ny-par-min" data-bevar placeholder="Min kr" aria-label="Min kr">
        <input type="number" inputmode="numeric" min="0" max="${MAKS_BOT}" id="bk-ny-par-maks" data-bevar placeholder="Maks kr (${MAKS_BOT})" aria-label="Maks kr">
      </div>
      <button class="knapp knapp-primaer" style="margin-top:10px" onclick="window.botkassaLeggTilParagraf(this)">Legg til</button>
    </div>
  `);
}
window.botkassaByttNyParagrafType = function() {
  const type = document.getElementById('bk-ny-par-type').value;
  document.getElementById('bk-ny-par-fast-felt').style.display   = type === 'fast'   ? 'block' : 'none';
  document.getElementById('bk-ny-par-skjonn-felt').style.display = type === 'skjonn' ? 'flex'  : 'none';
};

function lesTall(id) {
  const el = document.getElementById(id);
  if (!el || el.value.trim() === '') return null;
  return Math.round(Number(el.value));
}
const iGrense = v => Number.isFinite(v) && v >= 0 && v <= MAKS_BOT;

async function lagreListe(nyListe, okTekst, btn) {
  if (btn) btn.disabled = true;
  try {
    await lagreParagrafer(_getAktivKlubbId(), nyListe);
    visMelding(okTekst);
    return true;
  } catch (e) {
    console.warn('[Botkassen] lagreParagrafer feilet:', e?.message);
    visMelding('Kunne ikke lagre — prøv igjen', 'feil');
    return false;
  } finally {
    if (btn) btn.disabled = false;
  }
}

window.botkassaLagreParagraf = async function(id, btn) {
  const p = data.paragrafer.find(x => x.id === id);
  if (!p) return;
  let endret;

  if (p.skjonn || p.ingenFast) {
    const min = lesTall('bk-par-min-' + id), maks = lesTall('bk-par-maks-' + id);
    if (!iGrense(min) || !iGrense(maks) || min > maks) return visMelding(`Min og maks må være mellom 0 og ${MAKS_BOT}, og min ≤ maks`, 'advarsel');
    endret = { ...p, skjonnMin: min, skjonnMax: maks };
    if (!p.ingenFast) {
      const belop = lesTall('bk-par-belop-' + id);
      if (!(belop >= min && belop <= maks)) return visMelding('Foreslått beløp må ligge mellom min og maks', 'advarsel');
      endret.belop = belop;
    }
  } else {
    const belop = lesTall('bk-par-belop-' + id);
    if (!(belop >= 1 && belop <= MAKS_BOT)) return visMelding(`Beløpet må være mellom 1 og ${MAKS_BOT} kr`, 'advarsel');
    endret = { ...p, belop };
  }

  await lagreListe(data.paragrafer.map(x => x.id === id ? endret : x), 'Paragraf oppdatert', btn);
};

window.botkassaFjernParagraf = async function(id) {
  const p = data.paragrafer.find(x => x.id === id);
  if (!p) return;
  if (data.paragrafer.length <= 1) return visMelding('Det må være minst én paragraf', 'advarsel');
  if (!confirm(`Fjerne «§${p.num} — ${p.tittel}»?\n\nBøter som allerede er gitt for denne paragrafen beholdes.`)) return;
  await lagreListe(data.paragrafer.filter(x => x.id !== id), `«${p.tittel}» fjernet`);
};

window.botkassaLeggTilParagraf = async function(btn) {
  const emoji  = document.getElementById('bk-ny-par-emoji').value.trim() || '📌';
  const tittel = document.getElementById('bk-ny-par-tittel').value.trim();
  const type   = document.getElementById('bk-ny-par-type').value;
  if (!tittel) return visMelding('Skriv en tittel', 'advarsel');

  let felter;
  if (type === 'skjonn') {
    const min  = lesTall('bk-ny-par-min')  ?? 0;
    const maks = lesTall('bk-ny-par-maks') ?? MAKS_BOT;
    if (!iGrense(min) || !iGrense(maks) || min > maks) return visMelding(`Min og maks må være mellom 0 og ${MAKS_BOT}, og min ≤ maks`, 'advarsel');
    felter = { skjonn: true, skjonnMin: min, skjonnMax: maks, belop: 0, ingenFast: true };
  } else {
    const belop = lesTall('bk-ny-par-belop');
    if (!(belop >= 1 && belop <= MAKS_BOT)) return visMelding(`Beløpet må være mellom 1 og ${MAKS_BOT} kr`, 'advarsel');
    felter = { skjonn: false, belop };
  }

  const nyNum = data.paragrafer.reduce((maks, p) => Math.max(maks, p.num || 0), 0) + 1;
  const ny = { id: `p_${Date.now()}`, num: nyNum, emoji, tittel, ...felter };

  if (await lagreListe([...data.paragrafer, ny], 'Paragraf lagt til! 🥒', btn)) {
    // Tøm skjemaet før sanntidsoppdateringen tegner fanen på nytt.
    ['bk-ny-par-emoji', 'bk-ny-par-tittel', 'bk-ny-par-belop', 'bk-ny-par-min', 'bk-ny-par-maks']
      .forEach(fid => { const f = document.getElementById(fid); if (f) f.value = ''; });
  }
};

// ════════════════════════════════════════════════════════
// DEL APPEN (QR-kode + lenke)
// ════════════════════════════════════════════════════════
function renderDel() {
  const lenke = location.origin + location.pathname;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=12&data=${encodeURIComponent(lenke)}`;

  innholdEl().innerHTML = `
    <p class="bk-verkty-notis">Del lenken eller QR-koden med spillerne — de åpner den rett i nettleseren, ingen app-butikk nødvendig. Fungerer best om de også legger den til på hjemskjermen.</p>
    <div style="display:flex;justify-content:center;margin-bottom:18px">
      <img src="${qrUrl}" alt="QR-kode til Botkassen" width="220" height="220" style="border-radius:14px;background:#fff;padding:10px">
    </div>
    <label for="bk-del-lenke">Lenke til appen</label>
    <div class="bk-inline-input" style="margin-bottom:14px">
      <input type="text" id="bk-del-lenke" value="${escHtml(lenke)}" readonly onclick="this.select()">
      <button class="knapp knapp-omriss knapp-liten" onclick="window.botkassaKopierLenke()">Kopier</button>
    </div>
    ${navigator.share ? `<button class="knapp knapp-primaer" onclick="window.botkassaDelLenke()">📤 Del …</button>` : ''}
  `;
}
window.botkassaKopierLenke = function() {
  const inp = document.getElementById('bk-del-lenke');
  if (!inp) return;
  inp.select();
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(inp.value)
      .then(() => visMelding('Lenke kopiert!'))
      .catch(() => visMelding('Kunne ikke kopiere — marker og kopier manuelt', 'advarsel'));
  } else {
    document.execCommand('copy');
    visMelding('Lenke kopiert!');
  }
};
window.botkassaDelLenke = function() {
  const lenke = document.getElementById('bk-del-lenke')?.value || (location.origin + location.pathname);
  navigator.share({ title: 'Botkassen', text: 'Meld inn og se bøter i Botkassen 🥒', url: lenke }).catch(() => {});
};

// ════════════════════════════════════════════════════════
// NULLSTILL SESONGEN
// ════════════════════════════════════════════════════════
function renderNullstill() {
  innholdEl().innerHTML = `
    <div class="bk-verkty-notis bk-verkty-notis-fare">
      ⚠️ Dette sletter <strong>alle</strong> godkjente bøter og Fair Play-poeng permanent — historikk, feed og statistikk nullstilles for hele klubben. Paragrafene og eventuelle innmeldinger til behandling beholdes. Dette kan ikke angres.
    </div>
    <p class="bk-liten-tekst" style="margin-bottom:14px">Typisk brukt ved sesongstart. Tips: del sesongoppsummeringen fra Statistikk først, så har dere et minne.</p>
    <label for="bk-nullstill-bekreft">Skriv <strong>NULLSTILL</strong> for å bekrefte</label>
    <input type="text" id="bk-nullstill-bekreft" placeholder="NULLSTILL" style="margin-bottom:14px" oninput="window.botkassaOppdaterNullstillKnapp()" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
    <button class="knapp knapp-fare" id="bk-nullstill-btn" disabled onclick="window.botkassaUtforNullstilling()">🗑️ Nullstill sesongen</button>
    <div id="bk-nullstill-resultat" style="margin-top:14px"></div>
  `;
}
window.botkassaOppdaterNullstillKnapp = function() {
  const felt = document.getElementById('bk-nullstill-bekreft');
  const btn  = document.getElementById('bk-nullstill-btn');
  if (felt && btn) btn.disabled = felt.value.trim().toUpperCase() !== 'NULLSTILL';
};
window.botkassaUtforNullstilling = async function() {
  const btn = document.getElementById('bk-nullstill-btn');
  btn.disabled = true;
  btn.textContent = 'Nullstiller …';
  try {
    const { boter, fairPlay } = await nullstillSesong(_getAktivKlubbId());
    const tekst = `${boter} bøter og ${fairPlay} Fair Play-poeng slettet.`;
    visMelding('Sesongen er nullstilt');
    renderNullstill();
    document.getElementById('bk-nullstill-resultat').innerHTML = `<p class="bk-liten-tekst" style="color:var(--green2)">✅ Ferdig — ${tekst}</p>`;
  } catch (e) {
    console.error('[Botkassen] nullstilling feilet:', e);
    visMelding('Kunne ikke nullstille', 'feil');
    document.getElementById('bk-nullstill-resultat').innerHTML = `<p class="bk-liten-tekst" style="color:var(--red2)">❌ Feilet: ${escHtml(e?.message ?? String(e))}</p>`;
    btn.disabled = false;
    btn.textContent = '🗑️ Nullstill sesongen';
  }
};
