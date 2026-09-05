// ════════════════════════════════════════════════════════
// botkassa-admin-ui.js — «Botkontroll»: godkjenne/avvise
// innmeldinger, betalingsstatus, redigere paragrafer.
//
// Bruker samme krevAdmin/PIN-flyt som resten av appen
// (admin.js), registrert av app.js akkurat som for
// Stafettligaen og Prøven.
// ════════════════════════════════════════════════════════
import { escHtml, visMelding } from './ui.js';
import {
  hentSpillere, hentParagrafer, lagreParagrafer,
  lyttPaBoter, lyttPaVentende,
  godkjennInnmelding, avvisInnmelding, settBetalt, nullstillSesong,
} from './botkassa-logikk.js';

let _naviger = () => {};
let _krevAdmin = (tittel, tekst, cb) => cb();
let _getAktivKlubbId = () => null;

let spillere = [];
let paragrafer = [];
let boter = [];
let ventende = [];
let avslyttBoter = null;
let avslyttVentende = null;
let lastetForKlubb = null;
let adminNavn = '';
let aktivTab = 'kø';

export function botkassaAdminUIInit({ naviger, krevAdmin, getAktivKlubbId }) {
  _naviger = naviger;
  _krevAdmin = krevAdmin;
  _getAktivKlubbId = getAktivKlubbId;
}

export async function visBotkassaAdmin() {
  const klubbId = _getAktivKlubbId();
  if (!klubbId) { visMelding('Velg klubb først', 'advarsel'); return; }

  _krevAdmin('Botkontroll', 'Kun botansvarlig/admin kan behandle innmeldinger.', async () => {
    _naviger('botkassa-admin');
    adminNavn = localStorage.getItem('bk_admin_navn_' + klubbId) || '';

    if (lastetForKlubb !== klubbId) {
      lastetForKlubb = klubbId;
      spillere   = await hentSpillere(klubbId);
      paragrafer = await hentParagrafer(klubbId);

      if (avslyttBoter) avslyttBoter();
      avslyttBoter = lyttPaBoter(klubbId, nye => { boter = nye; if (aktivTab === 'bøter') renderInnhold(); });

      if (avslyttVentende) avslyttVentende();
      avslyttVentende = lyttPaVentende(klubbId, nye => { ventende = nye; if (aktivTab === 'kø') renderInnhold(); });
    }
    renderTabs();
    renderInnhold();
  });
}
window.visBotkassaAdmin = visBotkassaAdmin;

function renderTabs() {
  document.querySelectorAll('#botkassa-admin-tabs .bk-tab').forEach(el =>
    el.classList.toggle('aktiv', el.dataset.tab === aktivTab));
}
window.botkassaByttAdminTab = function(tab) {
  aktivTab = tab;
  renderTabs();
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
  document.getElementById('botkassa-admin-innhold').innerHTML = `
    <label>Hvem er du (brukes til "Årets dommer"-statistikk)?</label>
    <select id="botkassa-admin-navn-select" style="margin-bottom:14px">
      <option value="" disabled selected>Velg deg selv …</option>
      ${spillere.map(s => `<option value="${escHtml(s.navn)}">${escHtml(s.navn)}</option>`).join('')}
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

// ── Til behandling ──
function renderKo() {
  const el = document.getElementById('botkassa-admin-innhold');
  if (!ventende.length) { el.innerHTML = `<div class="tom-tilstand">Ingen innmeldinger venter. 🥒</div>`; return; }
  el.innerHTML = ventende.map(im => `
    <div class="bk-admin-card">
      <div class="bk-admin-head"><div><strong>${escHtml(im.meldtAvNavn)}</strong> → ${escHtml(im.motSpillere.map(m=>m.navn).join(', '))}</div></div>
      <div class="bk-feed-paragraf">${escHtml(im.paragrafTittel)} · foreslått ${im.foreslattBelop || 0} kr</div>
      ${im.kommentar ? `<div class="bk-feed-kommentar">«${escHtml(im.kommentar)}»</div>` : ''}
      <div class="bk-admin-row">
        <button class="knapp knapp-ok knapp-liten" onclick="window.botkassaGodkjenn('${im.id}')">Godkjenn</button>
        <button class="knapp knapp-omriss knapp-liten" onclick="window.botkassaVisJuster('${im.id}')">Juster</button>
        <button class="knapp knapp-fare knapp-liten" onclick="window.botkassaAvvis('${im.id}')">Avvis</button>
      </div>
      <div class="bk-inline-input" id="bk-juster-${im.id}" style="display:none">
        <input type="number" id="bk-juster-belop-${im.id}" placeholder="Nytt beløp i kr" value="${im.foreslattBelop || ''}">
        <button class="knapp knapp-primaer knapp-liten" onclick="window.botkassaGodkjenn('${im.id}', true)">Bekreft</button>
      </div>
    </div>`).join('');
}
window.botkassaVisJuster = function(id) {
  const box = document.getElementById('bk-juster-' + id);
  box.style.display = box.style.display === 'none' ? 'flex' : 'none';
};
window.botkassaAvvis = async function(id) {
  try { await avvisInnmelding(id, adminNavn); visMelding('Innmelding avvist'); }
  catch (e) { visMelding('Kunne ikke avvise — sjekk firestore-reglene', 'feil'); }
};
window.botkassaGodkjenn = async function(id, justert=false) {
  const im = ventende.find(x => x.id === id);
  if (!im) return;
  let baseBelop = im.foreslattBelop || 0;
  if (justert) {
    const val = Number(document.getElementById('bk-juster-belop-' + id).value);
    if (!val || val <= 0) return visMelding('Skriv inn et gyldig beløp', 'advarsel');
    baseBelop = val;
  }
  if (!baseBelop) return visMelding('Dette krever et beløp — bruk "Juster"', 'advarsel');

  try {
    await godkjennInnmelding(im, baseBelop, adminNavn);
    visMelding('Bot godkjent! 🥒');
  } catch (e) {
    console.warn('[Botkassa] godkjenning feilet:', e?.message);
    visMelding('Kunne ikke godkjenne — sjekk firestore-reglene', 'feil');
  }
};

// ── Bøter & betaling ──
function renderBoter() {
  const el = document.getElementById('botkassa-admin-innhold');
  if (!boter.length) { el.innerHTML = `<div class="tom-tilstand">Ingen bøter registrert ennå.</div>`; return; }
  const utestaende = boter.filter(b => !b.betalt).reduce((s,b) => s + b.belop, 0);
  el.innerHTML = `
    <div class="bk-stat-tile full" style="margin-bottom:16px"><span class="bk-stat-label" style="margin:0">Utestående</span><span class="bk-stat-value">${utestaende.toLocaleString('nb-NO')} kr</span></div>
    ${boter.map(b => `
      <div class="bk-admin-card">
        <div class="bk-rad-mellom">
          <div><strong>${escHtml(b.spillerNavn)}</strong> — ${escHtml(b.paragrafTittel)}</div>
          <div class="bk-feed-belop">${b.belop} kr</div>
        </div>
        <div class="bk-rad-mellom">
          <span class="bk-liten-tekst">${b.betalt ? '🟢 Betalt' : '🟠 Ikke betalt'}</span>
          <button class="knapp ${b.betalt ? 'knapp-omriss' : 'knapp-ok'} knapp-liten" onclick="window.botkassaSettBetalt('${b.id}', ${!b.betalt})">${b.betalt ? 'Angre' : 'Merk betalt'}</button>
        </div>
      </div>`).join('')}
    <p class="bk-verkty-notis">💡 Dette markerer kun betalingsstatus manuelt. Ekte Vipps-integrasjon er et eget, senere steg.</p>
  `;
}
window.botkassaSettBetalt = async function(id, verdi) {
  try { await settBetalt(id, verdi); }
  catch (e) { visMelding('Kunne ikke oppdatere — sjekk firestore-reglene', 'feil'); }
};

// ── Paragrafer ──
function renderParagrafer() {
  const el = document.getElementById('botkassa-admin-innhold');
  el.innerHTML = `
    <p class="bk-verkty-notis">Endringer her gjelder for hele klubben og vises umiddelbart på "Meld inn bot"- og "Regler"-sidene.</p>
    ${paragrafer.map((p,i) => `
      <div class="bk-admin-card">
        <div class="bk-rad-mellom">
          <div>${p.emoji} <strong>§${p.num} — ${escHtml(p.tittel)}</strong></div>
          <button class="knapp knapp-omriss knapp-liten" style="color:var(--red2);border-color:rgba(220,38,38,.4)" onclick="window.botkassaFjernParagraf(${i})">Fjern</button>
        </div>
        <div class="bk-inline-input" style="margin-top:8px">
          <input type="number" id="bk-par-belop-${p.id}" value="${p.belop}" ${p.ingenFast ? 'placeholder="Skjønn — ingen fast sats"' : ''}>
          <button class="knapp knapp-primaer knapp-liten" onclick="window.botkassaLagreParagraf(${i})">Lagre</button>
        </div>
      </div>`).join('')}

    <div class="bk-admin-card">
      <div class="bk-rad-mellom"><div><strong>➕ Legg til ny paragraf</strong></div></div>
      <p class="bk-liten-tekst" style="margin-bottom:10px">Bruk denne til f.eks. en jokerparagraf for rare/morsomme episoder som ikke passer noe annet sted.</p>
      <label>Emoji</label>
      <input type="text" id="bk-ny-par-emoji" placeholder="🃏" maxlength="4" style="margin-bottom:10px">
      <label>Tittel</label>
      <input type="text" id="bk-ny-par-tittel" placeholder="F.eks. «Annet (skjønnssak)»" style="margin-bottom:10px">
      <label>Type</label>
      <select id="bk-ny-par-type" onchange="window.botkassaByttNyParagrafType()" style="margin-bottom:10px">
        <option value="fast">Fast beløp</option>
        <option value="skjonn">Skjønn — botansvarlig bestemmer beløp ved godkjenning</option>
      </select>
      <div id="bk-ny-par-fast-felt">
        <label>Beløp (kr)</label>
        <input type="number" id="bk-ny-par-belop" placeholder="20" style="margin-bottom:10px">
      </div>
      <div id="bk-ny-par-skjonn-felt" style="display:none;gap:8px" class="bk-inline-input">
        <input type="number" id="bk-ny-par-min" placeholder="Min kr">
        <input type="number" id="bk-ny-par-maks" placeholder="Maks kr">
      </div>
      <button class="knapp knapp-primaer" style="margin-top:4px" onclick="window.botkassaLeggTilParagraf()">Legg til</button>
    </div>
  `;
}
window.botkassaByttNyParagrafType = function() {
  const type = document.getElementById('bk-ny-par-type').value;
  document.getElementById('bk-ny-par-fast-felt').style.display   = type === 'fast'   ? 'block' : 'none';
  document.getElementById('bk-ny-par-skjonn-felt').style.display = type === 'skjonn' ? 'flex'  : 'none';
};
window.botkassaLagreParagraf = async function(i) {
  const klubbId = _getAktivKlubbId();
  const p = paragrafer[i];
  const nyttBelop = Number(document.getElementById('bk-par-belop-' + p.id).value);
  if (isNaN(nyttBelop) || nyttBelop < 0) return visMelding('Ugyldig beløp', 'advarsel');
  paragrafer[i] = { ...p, belop: nyttBelop };
  try {
    await lagreParagrafer(klubbId, paragrafer);
    visMelding('Paragraf oppdatert');
  } catch (e) { visMelding('Kunne ikke lagre — sjekk firestore-reglene', 'feil'); }
};
window.botkassaFjernParagraf = async function(i) {
  const klubbId = _getAktivKlubbId();
  const fjernet = paragrafer[i];
  const nyListe = paragrafer.filter((_, idx) => idx !== i);
  try {
    await lagreParagrafer(klubbId, nyListe);
    paragrafer = nyListe;
    visMelding(`«${fjernet.tittel}» fjernet`);
    renderParagrafer();
  } catch (e) { visMelding('Kunne ikke lagre — sjekk firestore-reglene', 'feil'); }
};
window.botkassaLeggTilParagraf = async function() {
  const klubbId = _getAktivKlubbId();
  const emoji   = document.getElementById('bk-ny-par-emoji').value.trim() || '📌';
  const tittel  = document.getElementById('bk-ny-par-tittel').value.trim();
  const type    = document.getElementById('bk-ny-par-type').value;
  if (!tittel) return visMelding('Skriv en tittel', 'advarsel');

  let felter;
  if (type === 'skjonn') {
    const min  = Number(document.getElementById('bk-ny-par-min').value)  || 0;
    const maks = Number(document.getElementById('bk-ny-par-maks').value) || 100;
    if (maks < min) return visMelding('Maks må være større enn min', 'advarsel');
    felter = { skjonn: true, skjonnMin: min, skjonnMax: maks, belop: 0, ingenFast: true };
  } else {
    const belop = Number(document.getElementById('bk-ny-par-belop').value);
    if (!belop || belop <= 0) return visMelding('Skriv et gyldig beløp', 'advarsel');
    felter = { skjonn: false, belop };
  }

  const nyNum = paragrafer.reduce((maks, p) => Math.max(maks, p.num || 0), 0) + 1;
  const nyParagraf = { id: `p_${Date.now()}`, num: nyNum, emoji, tittel, ...felter };

  const nyListe = [...paragrafer, nyParagraf];
  try {
    await lagreParagrafer(klubbId, nyListe);
    paragrafer = nyListe;
    visMelding('Paragraf lagt til! 🥒');
    renderParagrafer();
  } catch (e) { visMelding('Kunne ikke lagre — sjekk firestore-reglene', 'feil'); }
};

// ── Del appen (QR-kode + lenke) ──
function renderDel() {
  const el    = document.getElementById('botkassa-admin-innhold');
  const lenke = location.origin + location.pathname;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=12&data=${encodeURIComponent(lenke)}`;

  el.innerHTML = `
    <p class="bk-verkty-notis">Del lenken eller QR-koden med spillerne — de åpner den rett i nettleseren, ingen app store nødvendig. Fungerer best hvis de i tillegg legger den til på hjemskjermen.</p>
    <div style="display:flex;justify-content:center;margin-bottom:18px">
      <img src="${qrUrl}" alt="QR-kode til Botkassa" width="220" height="220" style="border-radius:14px;background:#fff;padding:10px">
    </div>
    <label>Lenke til appen</label>
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
  navigator.share({ title: 'Botkassa', text: 'Meld inn og se bøter i Botkassa 🥒', url: lenke }).catch(() => {});
};

// ── Nullstill sesongen (sletter historikk/feed/statistikk) ──
function renderNullstill() {
  const el = document.getElementById('botkassa-admin-innhold');
  el.innerHTML = `
    <div class="bk-verkty-notis" style="border-color:rgba(220,38,38,.4);background:rgba(220,38,38,.08);color:var(--red2)">
      ⚠️ Dette sletter <strong>alle</strong> godkjente bøter permanent — historikk, feed og statistikk nullstilles for hele klubben. Paragrafene og eventuelle innmeldinger til behandling beholdes. Dette kan ikke angres.
    </div>
    <p class="bk-liten-tekst" style="margin-bottom:14px">Typisk brukt ved sesongstart, når fjorårets bøter skal starte helt på nytt.</p>
    <label>Skriv <strong>NULLSTILL</strong> for å bekrefte</label>
    <input type="text" id="bk-nullstill-bekreft" placeholder="NULLSTILL" style="margin-bottom:14px" oninput="window.botkassaOppdaterNullstillKnapp()" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
    <button class="knapp knapp-fare" id="bk-nullstill-btn" disabled onclick="window.botkassaUtforNullstilling()">🗑️ Nullstill sesongen</button>
    <div id="bk-nullstill-resultat" style="margin-top:14px"></div>
  `;
}
window.botkassaOppdaterNullstillKnapp = function() {
  const felt = document.getElementById('bk-nullstill-bekreft');
  const btn  = document.getElementById('bk-nullstill-btn');
  if (!felt || !btn) return;
  btn.disabled = felt.value.trim().toUpperCase() !== 'NULLSTILL';
};
window.botkassaUtforNullstilling = async function() {
  const klubbId  = _getAktivKlubbId();
  const btn      = document.getElementById('bk-nullstill-btn');
  const resultat = document.getElementById('bk-nullstill-resultat');
  btn.disabled = true;
  btn.textContent = 'Nullstiller …';
  if (resultat) resultat.innerHTML = '';
  try {
    const antall = await nullstillSesong(klubbId);
    visMelding(`Nullstilt! ${antall} bøter slettet.`);
    if (resultat) resultat.innerHTML = `<p class="bk-liten-tekst" style="color:var(--green2)">✅ Ferdig — ${antall} bøter slettet.</p>`;
    renderNullstill();
  } catch (e) {
    console.error('[Botkassa] nullstilling feilet:', e);
    visMelding('Kunne ikke nullstille', 'feil');
    if (resultat) resultat.innerHTML = `<p class="bk-liten-tekst" style="color:var(--red2)">❌ Feilet: ${escHtml(e?.message ?? String(e))}</p>`;
    btn.disabled = false;
    btn.textContent = '🗑️ Nullstill sesongen';
  }
};
