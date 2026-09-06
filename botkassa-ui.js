// ════════════════════════════════════════════════════════
// botkassa-ui.js — Medlemsflatene i Botkassa
// (hjem, meld inn bot, feed, statistikk, regler)
//
// Admin-siden («Botkontroll») ligger i botkassa-admin-ui.js.
//
// Forventer disse skjermene i index.html (se botkassa-index-tillegg.html):
//   skjerm-botkassa-hjem, skjerm-botkassa-meld, skjerm-botkassa-feed,
//   skjerm-botkassa-stats, skjerm-botkassa-regler
// ════════════════════════════════════════════════════════
import { escHtml, visMelding } from './ui.js';
import {
  hentSpillere, hentParagrafer, lyttPaBoter,
  opprettInnmelding, likeBot, topListe, sumListe,
} from './botkassa-logikk.js';

let _naviger        = () => {};
let _getAktivKlubbId = () => null;
let _klubbNavn       = '';

let spillere   = [];
let paragrafer = [];
let boter      = [];
let valgteSpillereIds = new Set();
let valgtParagrafId   = null;
let avslyttBoter = null;
let lastetForKlubb = null;

export function botkassaUIInit({ naviger, getAktivKlubbId, getKlubbNavn }) {
  _naviger = naviger;
  _getAktivKlubbId = getAktivKlubbId;
  _klubbNavn = getKlubbNavn ?? (() => '');
}

/** Kalles fra "Åpne Botkassa"-knappen på hjem-skjermen. */
export async function visBotkassaOversikt() {
  const klubbId = _getAktivKlubbId();
  if (!klubbId) { visMelding('Velg klubb først', 'advarsel'); return; }

  _naviger('botkassa-hjem');
  document.getElementById('botkassa-hjem-klubbnavn').textContent = _klubbNavn();

  if (lastetForKlubb !== klubbId) {
    lastetForKlubb = klubbId;
    document.getElementById('botkassa-hjem-stats').innerHTML = lasterHtml('Henter tall …');
    document.getElementById('botkassa-hjem-feed').innerHTML  = lasterHtml('Laster feed …');

    spillere   = await hentSpillere(klubbId);
    paragrafer = await hentParagrafer(klubbId);

    if (avslyttBoter) avslyttBoter();
    avslyttBoter = lyttPaBoter(klubbId, nyeBoter => {
      boter = nyeBoter;
      renderHjemStats();
      renderFeedPreview();
      if (skjermErAktiv('botkassa-feed')) renderFeedFull();
      if (skjermErAktiv('botkassa-stats')) renderStats();
    });
  } else {
    renderHjemStats();
    renderFeedPreview();
  }
}

function skjermErAktiv(navn) {
  return document.getElementById('skjerm-' + navn)?.classList.contains('active');
}
function lasterHtml(tekst) {
  return `<div class="laster"><span class="laster-snurr"></span> ${escHtml(tekst)}</div>`;
}

/**
 * Stabil, anonym ID for denne enheten/nettleseren — brukes til å hindre at
 * samme person kan like samme bot flere ganger (se botkassaLike/likeBot).
 * Ingen ekte identitet: sletter man localStorage eller bruker en annen
 * enhet, kan man like på nytt. Samme tillitsnivå som resten av appen.
 */
function enhetsId() {
  let id = localStorage.getItem('bk_enhet_id');
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : 'e_' + Math.random().toString(36).slice(2) + Date.now();
    localStorage.setItem('bk_enhet_id', id);
  }
  return id;
}

// ════════════════════════════════════════════════════════
// HJEM
// ════════════════════════════════════════════════════════
function renderHjemStats() {
  const el = document.getElementById('botkassa-hjem-stats');
  if (!boter.length) {
    el.innerHTML = `<div class="tom-tilstand" style="grid-column:1/-1">Ingen bøter registrert ennå denne sesongen. <img class="agurk-emoji" src="agurkseddel.png" alt="🥒"></div>`;
    return;
  }
  const sum         = boter.reduce((s,b) => s + (b.belop||0), 0);
  const botkonge    = topListe(boter, 'spillerNavn')[0];
  const botpoliti   = topListe(boter, 'meldtAvNavn')[0];
  const topParagraf = topListe(boter, 'paragrafTittel')[0];
  el.innerHTML = `
    <div class="bk-stat-tile"><div class="bk-stat-value">${sum.toLocaleString('nb-NO')} kr</div><div class="bk-stat-label">💰 Samlet inn</div></div>
    <div class="bk-stat-tile"><div class="bk-stat-value">${boter.length}</div><div class="bk-stat-label">🚨 Bøter gitt</div></div>
    <div class="bk-stat-tile"><div class="bk-stat-value">${escHtml(botkonge?.key ?? '—')}</div><div class="bk-stat-label">🏆 Botkonge/-dronning</div></div>
    <div class="bk-stat-tile"><div class="bk-stat-value">${escHtml(botpoliti?.key ?? '—')}</div><div class="bk-stat-label">👮 Botpoliti</div></div>
    <div class="bk-stat-tile full"><span class="bk-stat-label" style="margin:0">😂 Mest brukte paragraf</span><span class="bk-stat-value" style="font-size:14px">${escHtml(topParagraf?.key ?? '—')}</span></div>
  `;
}

function renderFeedPreview() {
  const el = document.getElementById('botkassa-hjem-feed');
  if (!boter.length) { el.innerHTML = `<div class="tom-tilstand-liten">Feeden er tom foreløpig.</div>`; return; }
  el.innerHTML = boter.slice(0,5).map(feedKortHtml).join('');
}

function renderFeedFull() {
  const el = document.getElementById('botkassa-feed-innhold');
  if (!boter.length) { el.innerHTML = `<div class="tom-tilstand">Ingen godkjente bøter ennå. Vær den første til å melde inn en! <img class="agurk-emoji" src="agurkseddel.png" alt="🥒"></div>`; return; }
  el.innerHTML = boter.map(feedKortHtml).join('');
}

function feedKortHtml(b) {
  const karma     = b.karmaDoblet ? `<span class="bk-karma-badge">⚖️ KARMA — doblet</span>` : '';
  const harLikt   = Array.isArray(b.likedAv) && b.likedAv.includes(enhetsId());
  return `<div class="bk-feed-card">
    <div class="bk-feed-head">
      <div class="bk-feed-navn">${escHtml(b.spillerNavn)} ${karma}</div>
      <div class="bk-feed-belop">${b.belop} kr</div>
    </div>
    <div class="bk-feed-paragraf">${escHtml(b.paragrafTittel)}</div>
    ${b.kommentar ? `<div class="bk-feed-kommentar">«${escHtml(b.kommentar)}»</div>` : ''}
    <div class="bk-feed-footer">
      <span class="bk-feed-meldtav">Meldt inn av ${escHtml(b.meldtAvNavn || '?')} · ${b.betalt ? '🟢 Betalt' : '🟠 Ikke betalt'}</span>
      <button class="bk-like-btn${harLikt ? ' likt' : ''}" onclick="window.botkassaLike('${b.id}')">😂 ${b.likes || 0}</button>
    </div>
  </div>`;
}
window.botkassaLike = async function(id) {
  const b = boter.find(x => x.id === id);
  const harAlleredeLikt = Array.isArray(b?.likedAv) && b.likedAv.includes(enhetsId());
  try { await likeBot(id, enhetsId(), harAlleredeLikt); }
  catch (e) { visMelding('Kunne ikke like — sjekk firestore-reglene', 'feil'); }
};

export function visBotkassaFeed()  { _naviger('botkassa-feed');  renderFeedFull(); }
export function visBotkassaStats() { _naviger('botkassa-stats'); renderStats(); }
export function visBotkassaRegler(){ _naviger('botkassa-regler'); renderRegler(); }
window.visBotkassaFeed   = visBotkassaFeed;
window.visBotkassaStats  = visBotkassaStats;
window.visBotkassaRegler = visBotkassaRegler;

// ════════════════════════════════════════════════════════
// STATISTIKK
// ════════════════════════════════════════════════════════

/**
 * Finner ÉN spiller — "Årets nesten-helgen" — blant dem som faktisk har fått
 * minst én bot denne sesongen: den med færrest bøter, og ved uavgjort den
 * som SIST havnet i bunnsjiktet (dvs. hvis flere deler laveste antall, er
 * det den med nyeste bot av disse som får tittelen — ikke alle på likt).
 * `boter` kommer allerede sortert nyest-først (se lyttPaBoter), så vi kan
 * bare gå gjennom lista og plukke den første boten som tilhører noen i
 * bunnsjiktet.
 */
function finnArsNestenHelgen() {
  const tellinger = {};
  boter.forEach(b => { tellinger[b.spillerNavn] = (tellinger[b.spillerNavn] ?? 0) + 1; });
  const antallListe = Object.values(tellinger);
  if (!antallListe.length) return null;

  const minAntall  = Math.min(...antallListe);
  const kandidater = new Set(Object.entries(tellinger).filter(([,n]) => n === minAntall).map(([navn]) => navn));

  const sisteBot = boter.find(b => kandidater.has(b.spillerNavn));
  return { navn: sisteBot.spillerNavn, antall: minAntall };
}
function renderStats() {
  const el = document.getElementById('botkassa-stats-innhold');
  if (!boter.length) { el.innerHTML = `<div class="tom-tilstand">Ingen data å vise ennå.</div>`; return; }

  const botligaen    = topListe(boter, 'spillerNavn').slice(0,8);
  const bidragsyter  = sumListe(boter, 'spillerNavn', 'belop')[0];
  const botpoliti    = topListe(boter, 'meldtAvNavn')[0];
  const nestenHelgen = finnArsNestenHelgen();
  const sylteagurk   = botligaen[0];

  el.innerHTML = `
    <div class="seksjon-etikett">🏆 Årets titler</div>
    <div class="bk-title-grid" style="margin-bottom:20px">
      <div class="bk-title-card"><div class="bk-title-emoji"><img class="agurk-emoji" src="agurkseddel.png" alt="🥒"></div><div class="bk-title-navn">${escHtml(sylteagurk?.key ?? '—')}</div><div class="bk-title-label">Årets sylteagurk<br>(flest bøter)</div></div>
      <div class="bk-title-card"><div class="bk-title-emoji">👮</div><div class="bk-title-navn">${escHtml(botpoliti?.key ?? '—')}</div><div class="bk-title-label">Årets botpoliti<br>(flest innmeldinger)</div></div>
      <div class="bk-title-card"><div class="bk-title-emoji">🙏</div><div class="bk-title-navn">${escHtml(nestenHelgen?.navn ?? '—')}</div><div class="bk-title-label">Årets nesten-helgen<br>(færrest bøter, blant de skyldige)</div></div>
      <div class="bk-title-card"><div class="bk-title-emoji">💸</div><div class="bk-title-navn">${escHtml(bidragsyter?.key ?? '—')}</div><div class="bk-title-label">Årets bidragsyter<br>(høyest sum)</div></div>
    </div>
    <p style="font-size:12px;color:var(--muted);margin-bottom:20px">😂 Årets unnskyldning og 🏓 Årets fair-play-spiller kåres manuelt av styret ved sesongslutt.</p>

    <div class="seksjon-etikett">Botligaen</div>
    <div class="kort"><div class="kort-innhold">
      ${botligaen.map((r,i) => `<div class="bk-liga-rad"><div class="bk-liga-plass">${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</div><div class="bk-liga-navn">${escHtml(r.key)}</div><div class="bk-liga-antall">${r.antall}</div></div>`).join('')}
    </div></div>
  `;
}

// ════════════════════════════════════════════════════════
// REGLER
// ════════════════════════════════════════════════════════
function renderRegler() {
  const paragrafHtml = paragrafer.map(p => `
    <p><strong>${p.emoji} §${p.num} — ${escHtml(p.tittel)}.</strong>
    ${p.lagstraff ? 'Lagstraff — hele laget bøtelegges. ' : ''}
    Bot: ${p.ingenFast ? 'vurderes av botansvarlig (0–100 kr)' : p.skjonn ? `${p.skjonnMin}–${p.skjonnMax} kr, avhengig av alvorlighetsgrad` : p.belop + ' kr'}.</p>
  `).join('');

  document.getElementById('botkassa-regler-innhold').innerHTML = `
    <div class="bk-regel-tekst">
      <h3>§1 – Formål</h3>
      <p>Botkassen skal bidra til bedre disiplin og punktlighet, mer fair play og godt klubbmiljø, litt ekstra humor rundt våre pickleball-tabber, og å samle inn penger til sosiale formål. Kort sagt: vi skal bli litt flinkere — og ha det litt morsommere.</p>

      <h3>§2 – Hvem omfattes?</h3>
      <p>Botkassen gjelder alle voksne medlemmer, på treninger, kamper, turneringer og andre klubbaktiviteter.</p>

      <h3>§3 – Hva utløser bot?</h3>
      ${paragrafHtml}

      <h3>§4 – Selvrapportering</h3>
      <p>Innrømmer du selv en forseelse før noen andre rekker å påpeke den, kan boten reduseres med 50 %. Forsøk på å skjule en forseelse kan derimot medføre at boten dobles.</p>

      <h3>§5 – Dommeren er ikke alltid en dommer</h3>
      <p>Alle medlemmer kan foreslå at en bot ilegges, men botkassen skal aldri brukes som våpen mot andre medlemmer. Ved tvilstilfeller avgjør botansvarlig, og avgjørelsen er normalt endelig.</p>

      <h3>§6 – Kreative bøter</h3>
      <p>Det er lov å foreslå bøter for årets mest kreative unnskyldning, mest optimistiske smash, og andre episoder som fortjener en plass i klubbhistorien. Botansvarlig avgjør om hendelsen kvalifiserer.</p>

      <h3>§7 – Maksimal bot</h3>
      <p>Ingen enkeltstående hendelse skal normalt gi mer enn 100 kr i bot. Formålet er god klubbkultur og litt selvironi — ikke økonomisk straff.</p>

      <h3>⚖️ Karma</h3>
      <p>Har du meldt inn noen for en paragraf, og blir du selv tatt for det samme senere i sesongen, dobles din bot automatisk. Botkassa glemmer aldri.</p>

      <h3>§8 – Betaling</h3>
      <p>Bøter betales til botkassen innen 14 dager via Vipps, merket «Bot – [navn]».</p>

      <h3>§9 – Hva går pengene til?</h3>
      <p>Sosiale formål i eller knyttet til klubben — klubbfest, sosial turnering, premier eller lignende, besluttet av klubben. Ved sesongslutt offentliggjøres hvor mye som er samlet inn og hva pengene brukes til.</p>

      <h3>§10 – Viktigste regel</h3>
      <p>Botkassen skal aldri brukes til å henge ut, mobbe eller ydmyke et medlem. Vi skal le med hverandre, ikke av hverandre.</p>
    </div>
  `;
}

// ════════════════════════════════════════════════════════
// MELD INN BOT
// ════════════════════════════════════════════════════════
export function visBotkassaMeld() {
  valgteSpillereIds = new Set();
  valgtParagrafId   = null;
  _naviger('botkassa-meld');

  const navnSelect = document.getElementById('botkassa-meld-mittnavn');
  navnSelect.innerHTML = `<option value="" disabled selected>Velg deg selv …</option>` +
    spillere.map(s => `<option value="${s.id}">${escHtml(s.navn)}</option>`).join('');

  const klubbId  = _getAktivKlubbId();
  const lagretId = klubbId && localStorage.getItem('bk_mitt_navn_id_' + klubbId);
  if (lagretId && spillere.some(s => s.id === lagretId)) navnSelect.value = lagretId;

  const spillerListe = document.getElementById('botkassa-meld-spillerliste');
  spillerListe.innerHTML = spillere.length
    ? spillere.map(s => `
        <div class="bk-spiller-item" id="bk-ms-${s.id}" onclick="window.botkassaToggleSpiller('${s.id}')">
          <div class="bk-checkbox">✓</div><div>${escHtml(s.navn)}</div>
        </div>`).join('')
    : `<div class="tom-tilstand-liten">Fant ingen spillere for klubben.</div>`;

  document.getElementById('botkassa-meld-paragrafliste').innerHTML = paragrafer.map(p => `
    <div class="bk-paragraf-item" id="bk-mp-${p.id}" onclick="window.botkassaVelgParagraf('${p.id}')">
      <div class="bk-paragraf-emoji">${p.emoji}</div>
      <div class="bk-paragraf-tittel">§${p.num} – ${escHtml(p.tittel)}</div>
      <div class="bk-paragraf-belop">${p.ingenFast ? 'Skjønn' : p.skjonn ? p.skjonnMin+'–'+p.skjonnMax+' kr' : p.belop+' kr'}</div>
    </div>`).join('');

  document.getElementById('botkassa-meld-kommentar').value = '';
  document.getElementById('botkassa-meld-belop-info').textContent = '';
}
window.visBotkassaMeld = visBotkassaMeld;

window.botkassaLagreMittNavn = function(id) {
  const klubbId = _getAktivKlubbId();
  if (klubbId && id) localStorage.setItem('bk_mitt_navn_id_' + klubbId, id);
};

window.botkassaToggleSpiller = function(id) {
  if (valgteSpillereIds.has(id)) valgteSpillereIds.delete(id); else valgteSpillereIds.add(id);
  document.getElementById('bk-ms-'+id).classList.toggle('valgt', valgteSpillereIds.has(id));
};

window.botkassaVelgParagraf = function(id) {
  valgtParagrafId = id;
  document.querySelectorAll('#botkassa-meld-paragrafliste .bk-paragraf-item').forEach(el =>
    el.classList.toggle('valgt', el.id === 'bk-mp-'+id));
  const p = paragrafer.find(x => x.id === id);
  const infoEl = document.getElementById('botkassa-meld-belop-info');
  if (p.lagstraff) infoEl.textContent = '⚠️ Dette er en lagstraff — alle du velger over får hver sin bot.';
  else if (p.ingenFast) infoEl.textContent = 'Botansvarlig vurderer og setter beløp ved godkjenning.';
  else if (p.skjonn) infoEl.textContent = `Foreslått ${p.belop} kr — botansvarlig kan justere (${p.skjonnMin}–${p.skjonnMax} kr).`;
  else infoEl.textContent = '';
};

window.botkassaSendInnmelding = async function() {
  const klubbId = _getAktivKlubbId();
  const mittId  = document.getElementById('botkassa-meld-mittnavn').value;
  if (!mittId) return visMelding('Velg hvem du er', 'advarsel');
  if (!valgteSpillereIds.size) return visMelding('Velg minst én spiller', 'advarsel');
  if (!valgtParagrafId) return visMelding('Velg en paragraf', 'advarsel');

  const mittNavn = spillere.find(s => s.id === mittId)?.navn ?? '?';
  const p = paragrafer.find(x => x.id === valgtParagrafId);
  const motSpillere = spillere.filter(s => valgteSpillereIds.has(s.id)).map(s => ({ id: s.id, navn: s.navn }));
  const kommentar = document.getElementById('botkassa-meld-kommentar').value.trim();
  const btn = document.getElementById('botkassa-meld-send-btn');
  btn.disabled = true;

  try {
    await opprettInnmelding({
      klubbId, meldtAvId: mittId, meldtAvNavn: mittNavn, motSpillere,
      paragrafId: p.id, paragrafTittel: `§${p.num} – ${p.tittel}`,
      foreslattBelop: p.ingenFast ? 0 : p.belop,
      kommentar,
    });
    visMelding('Sendt til botkontroll! 🥒');
    _naviger('botkassa-hjem');
  } catch (e) {
    console.warn('[Botkassa] sendInnmelding feilet:', e?.message);
    visMelding('Kunne ikke sende inn — sjekk firestore-reglene', 'feil');
  } finally {
    btn.disabled = false;
  }
};
