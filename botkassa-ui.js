// ════════════════════════════════════════════════════════
// botkassa-ui.js — Medlemsflatene i Botkassen
// (hjem, meld inn bot, Fair Play, feed, statistikk, regler, Min side)
//
// Admin-siden («Botkontroll») ligger i botkassa-admin-ui.js.
// Data kommer fra det felles datalageret i botkassa-data.js.
// ════════════════════════════════════════════════════════
import { escHtml, visMelding, renderTrygt } from './ui.js';
import {
  opprettInnmelding, svarPaInnmelding, likeBot,
  opprettFairPlayPoeng, likeFairPlay, FAIRPLAY_KATEGORIER,
  MAKS_BOT, MAKS_BOT_KARMA, belopTekst,
  rangering, unikePerInnmelding, hentMineInnmeldinger,
} from './botkassa-logikk.js';
import { startData, hentData, abonner } from './botkassa-data.js';
import { delSesongbilde } from './botkassa-del-sesong.js';

const ANTALL_I_HJEMFEED = 3;

let _naviger         = () => {};
let _getAktivKlubbId = () => null;
let _klubbNavn       = () => '';
let _krevAdmin       = (tittel, tekst, cb) => cb();
let _getErAdmin      = () => false;

const data = hentData();

let mineInnmeldinger    = [];
let mineInnmeldingerFor = null;
let minSideHentNr       = 0;
let valgteSpillereIds   = new Set();
let valgtParagrafId     = null;
let valgteSpillereIdsFP = new Set();
let valgtKategoriId     = null;

export function botkassaUIInit({ naviger, getAktivKlubbId, getKlubbNavn, krevAdmin, getErAdmin }) {
  _naviger = naviger;
  _getAktivKlubbId = getAktivKlubbId;
  _klubbNavn = getKlubbNavn ?? (() => '');
  if (krevAdmin) _krevAdmin = krevAdmin;
  if (getErAdmin) _getErAdmin = getErAdmin;

  abonner(hva => {
    if (hva === 'boter' || hva === 'fairPlay') {
      renderHjemStats();
      renderFeedPreview();
      if (skjermErAktiv('botkassa-feed'))     renderFeedFull();
      if (skjermErAktiv('botkassa-stats'))    renderStats();
      if (skjermErAktiv('botkassa-min-side')) renderMinSide();
    }
    if (hva === 'ventende') {
      renderVenterVarsel();
      // Status på egne innmeldinger kan ha endret seg → hent på nytt.
      if (skjermErAktiv('botkassa-min-side')) renderMinSide({ hentPaNytt: true });
    }
    if (hva === 'paragrafer') {
      if (skjermErAktiv('botkassa-regler')) renderRegler();
      if (skjermErAktiv('botkassa-meld'))   renderMeldParagrafer();
    }
  });
}

export async function visBotkassaOversikt() {
  const klubbId = _getAktivKlubbId();
  if (!klubbId) return;

  _naviger('botkassa-hjem');
  document.getElementById('botkassa-hjem-klubbnavn').textContent = _klubbNavn();

  await startData(klubbId);
  renderHjemStats();
  renderFeedPreview();
  renderVenterVarsel();
}

function skjermErAktiv(navn) {
  return document.getElementById('skjerm-' + navn)?.classList.contains('active');
}

function lasterHtml(tekst) {
  return `<div class="laster"><span class="laster-snurr"></span> ${escHtml(tekst)}</div>`;
}

// ════════════════════════════════════════════════════════
// «HVEM ER JEG» — lokalt lagret valg, ingen ekte innlogging
// ════════════════════════════════════════════════════════
function mittNavnNokkel() {
  const klubbId = _getAktivKlubbId();
  return klubbId ? 'bk_mitt_navn_id_' + klubbId : null;
}
function mittId() {
  const n = mittNavnNokkel();
  return n ? localStorage.getItem(n) : null;
}
function settMittId(id) {
  const n = mittNavnNokkel();
  if (n && id) localStorage.setItem(n, id);
}

/** Fyller en «Velg deg selv»-nedtrekksliste og velger lagret navn. */
function fyllMittNavnSelect(selectId) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = `<option value="" disabled selected>Velg deg selv …</option>` +
    data.spillere.map(s => `<option value="${escHtml(s.id)}">${escHtml(s.navn)}</option>`).join('');
  const lagret = mittId();
  if (lagret && data.spillere.some(s => s.id === lagret)) sel.value = lagret;
}

/**
 * Stabil, anonym ID for denne enheten — hindrer at samme person liker
 * samme post flere ganger. Ingen ekte identitet.
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
// VARSEL — badge og banner når noe venter på svar fra «meg»
// ════════════════════════════════════════════════════════
function renderVenterVarsel() {
  const badge  = document.getElementById('botkassa-hjem-venter-badge');
  const banner = document.getElementById('botkassa-hjem-varsel-banner');
  const tekst  = document.getElementById('botkassa-hjem-varsel-tekst');
  if (!badge || !banner || !tekst) return;

  const id   = mittId();
  const mine = id ? data.ventende.filter(im => im.motSpillere?.some(m => m.id === id)) : [];

  if (!mine.length) {
    badge.classList.remove('vis');
    banner.classList.remove('vis');
    if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
    return;
  }

  badge.textContent = mine.length;
  badge.classList.add('vis');
  const flertall = mine.length === 1 ? 'Én sak gjelder deg' : `${mine.length} saker gjelder deg`;
  tekst.innerHTML = `<strong>${flertall}</strong> — åpne Min side for å se og svare.`;
  banner.classList.add('vis');

  if (navigator.setAppBadge) navigator.setAppBadge(mine.length).catch(() => {});
}
window.botkassaOppdaterHjemVarsel = renderVenterVarsel;

// ════════════════════════════════════════════════════════
// HJEM
// ════════════════════════════════════════════════════════
function renderHjemStats() {
  const el = document.getElementById('botkassa-hjem-stats');
  if (!el) return;
  if (!data.klar.boter || !data.klar.fairPlay) {
    el.innerHTML = `<div style="grid-column:1/-1">${lasterHtml('Henter tall …')}</div>`;
    return;
  }
  const { boter, fairPlay } = data;
  if (!boter.length && !fairPlay.length) {
    el.innerHTML = `<div class="tom-tilstand" style="grid-column:1/-1">Ingen bøter eller Fair Play-poeng ennå denne sesongen. <img class="agurk-emoji" src="agurkseddel.png" alt="🥒"></div>`;
    return;
  }
  let html = '';
  if (boter.length) {
    const sum         = boter.reduce((s, b) => s + (b.belop || 0), 0);
    const botkonge    = rangering(boter, 'spillerId', 'spillerNavn')[0];
    const botpoliti   = botpolitiRangering()[0];
    const topParagraf = rangering(boter, 'paragrafId', 'paragrafTittel')[0];
    html += `
      <div class="bk-stat-tile"><div class="bk-stat-value">${sum.toLocaleString('nb-NO')} kr</div><div class="bk-stat-label">💰 Samlet inn</div></div>
      <div class="bk-stat-tile"><div class="bk-stat-value">${boter.length}</div><div class="bk-stat-label">🚨 Bøter gitt</div></div>
      <div class="bk-stat-tile"><div class="bk-stat-value">${escHtml(botkonge?.navn ?? '—')}</div><div class="bk-stat-label">🏆 Botkonge/-dronning</div></div>
      <div class="bk-stat-tile"><div class="bk-stat-value">${escHtml(botpoliti?.navn ?? '—')}</div><div class="bk-stat-label">👮 Botpoliti</div></div>
      <div class="bk-stat-tile full"><span class="bk-stat-label" style="margin:0">😂 Mest brukte paragraf</span><span class="bk-stat-value" style="font-size:14px">${escHtml(topParagraf?.navn ?? '—')}</span></div>
    `;
  }
  html += `
    <div class="bk-stat-tile full bk-stat-tile-fairplay"><span class="bk-stat-label" style="margin:0">🤝 Fair Play-poeng</span><span class="bk-stat-value bk-stat-value-fairplay">${fairPlay.length}</span></div>
  `;
  el.innerHTML = html;
}

/**
 * Botpoliti = flest innmeldinger av ANDRE som ble godkjent. En lagstraff
 * mot fire teller som én innmelding, og selvrapportering teller ikke.
 */
function botpolitiRangering() {
  const avAndre = data.boter.filter(b => b.meldtAvId && b.meldtAvId !== b.spillerId);
  return rangering(unikePerInnmelding(avAndre), 'meldtAvId', 'meldtAvNavn');
}

// ════════════════════════════════════════════════════════
// FEED
// ════════════════════════════════════════════════════════
function feedSamlet() {
  const alle = [
    ...data.boter.map(b => ({ ...b, _type: 'bot' })),
    ...data.fairPlay.map(f => ({ ...f, _type: 'fairplay' })),
  ];
  alle.sort((a, b) => (b.opprettet?.toMillis?.() ?? Date.now()) - (a.opprettet?.toMillis?.() ?? Date.now()));
  return alle;
}

function renderFeedPreview() {
  const el = document.getElementById('botkassa-hjem-feed');
  if (!el) return;
  if (!data.klar.boter || !data.klar.fairPlay) { el.innerHTML = lasterHtml('Laster feed …'); return; }
  const alle = feedSamlet();
  if (!alle.length) { el.innerHTML = `<div class="tom-tilstand-liten">Feeden er tom foreløpig.</div>`; return; }
  const resten = alle.length - ANTALL_I_HJEMFEED;
  el.innerHTML = alle.slice(0, ANTALL_I_HJEMFEED).map(feedKortHtml).join('') +
    (resten > 0 ? `<button class="knapp knapp-omriss" onclick="window.visBotkassaFeed()">Se hele feeden (${resten} til)</button>` : '');
}

function renderFeedFull() {
  const el = document.getElementById('botkassa-feed-innhold');
  const alle = feedSamlet();
  if (!alle.length) { el.innerHTML = `<div class="tom-tilstand">Ingen bøter eller Fair Play-poeng ennå. Vær den første til å melde inn noe! <img class="agurk-emoji" src="agurkseddel.png" alt="🥒"></div>`; return; }
  el.innerHTML = alle.map(feedKortHtml).join('');
}

function feedKortHtml(item) {
  return item._type === 'fairplay' ? fairPlayKortHtml(item) : botKortHtml(item);
}

// Betalingsstatus vises bevisst IKKE i feeden — den hører hjemme på
// Min side og i Botkontroll. Feeden skal være moro, ikke en gjeldsliste (§10).
function botKortHtml(b) {
  const karma   = b.karmaDoblet ? `<span class="bk-karma-badge">⚖️ KARMA — doblet</span>` : '';
  const harLikt = Array.isArray(b.likedAv) && b.likedAv.includes(enhetsId());
  return `<div class="bk-feed-card">
    <div class="bk-feed-head">
      <div class="bk-feed-navn">${escHtml(b.spillerNavn)} ${karma}</div>
      <div class="bk-feed-belop">${b.belop} kr</div>
    </div>
    <div class="bk-feed-paragraf">${escHtml(b.paragrafTittel)}</div>
    ${b.kommentar ? `<div class="bk-feed-kommentar">«${escHtml(b.kommentar)}»</div>` : ''}
    ${b.forklaring ? `<div class="bk-feed-forklaring">😅 ${escHtml(b.spillerNavn)} forklarer: «${escHtml(b.forklaring)}»</div>` : ''}
    <div class="bk-feed-footer">
      <span class="bk-feed-meldtav">Meldt inn av ${escHtml(b.meldtAvNavn || '?')}</span>
      <button class="bk-like-btn${harLikt ? ' likt' : ''}" aria-pressed="${harLikt}" aria-label="Morsomt" onclick="window.botkassaLike('${escHtml(b.id)}','bot')">😂 ${b.likes || 0}</button>
    </div>
  </div>`;
}

function fairPlayKortHtml(f) {
  const harLikt = Array.isArray(f.likedAv) && f.likedAv.includes(enhetsId());
  return `<div class="bk-feed-card bk-feed-card-fairplay">
    <div class="bk-feed-head">
      <div class="bk-feed-navn">${escHtml(f.spillerNavn)}</div>
      <span class="bk-fairplay-badge">🤝 FAIR PLAY</span>
    </div>
    <div class="bk-feed-paragraf bk-feed-paragraf-fairplay">${escHtml(f.kategoriTittel)}</div>
    ${f.kommentar ? `<div class="bk-feed-kommentar">«${escHtml(f.kommentar)}»</div>` : ''}
    <div class="bk-feed-footer">
      <span class="bk-feed-meldtav">Fra ${escHtml(f.meldtAvNavn || '?')}</span>
      <button class="bk-like-btn bk-like-btn-fairplay${harLikt ? ' likt' : ''}" aria-pressed="${harLikt}" aria-label="Applaus" onclick="window.botkassaLike('${escHtml(f.id)}','fairplay')">👏 ${f.likes || 0}</button>
    </div>
  </div>`;
}

const likerNa = new Set();
window.botkassaLike = async function(id, type) {
  if (likerNa.has(id)) return; // hindrer at et dobbelttrykk teller to ganger
  likerNa.add(id);
  const kilde = type === 'fairplay' ? data.fairPlay : data.boter;
  const item  = kilde.find(x => x.id === id);
  const harAlleredeLikt = Array.isArray(item?.likedAv) && item.likedAv.includes(enhetsId());
  try {
    if (type === 'fairplay') await likeFairPlay(id, enhetsId(), harAlleredeLikt);
    else await likeBot(id, enhetsId(), harAlleredeLikt);
  } catch (e) {
    console.warn('[Botkassen] like feilet:', e?.message);
    visMelding('Kunne ikke lagre — prøv igjen', 'feil');
  } finally {
    likerNa.delete(id);
  }
};

export function visBotkassaFeed()   { _naviger('botkassa-feed');   renderFeedFull(); }
export function visBotkassaStats()  { _naviger('botkassa-stats');  renderStats(); }
export function visBotkassaRegler() { _naviger('botkassa-regler'); renderRegler(); }
window.visBotkassaFeed   = visBotkassaFeed;
window.visBotkassaStats  = visBotkassaStats;
window.visBotkassaRegler = visBotkassaRegler;

// ════════════════════════════════════════════════════════
// STATISTIKK
// ════════════════════════════════════════════════════════

/**
 * «Årets nesten-helgen»: blant spillere med minst én bot, den med færrest.
 * Ved likhet vinner den som sist fikk en bot (boter er sortert nyest først).
 */
function finnArsNestenHelgen() {
  const liste = rangering(data.boter, 'spillerId', 'spillerNavn');
  if (!liste.length) return null;
  const minAntall  = liste[liste.length - 1].verdi;
  const kandidater = new Set(liste.filter(r => r.verdi === minAntall).map(r => r.id));
  const sisteBot   = data.boter.find(b => kandidater.has(b.spillerId));
  return { navn: sisteBot.spillerNavn, antall: minAntall };
}

/** Alt statistikkvisningen og sesongbildet trenger — så de alltid viser samme tall. */
function beregnSesongData() {
  const { boter, fairPlay } = data;
  const botligaen     = rangering(boter, 'spillerId', 'spillerNavn').slice(0, 8);
  const fairPlayLiga  = rangering(fairPlay, 'spillerId', 'spillerNavn').slice(0, 8);
  const bidragsyter   = rangering(boter, 'spillerId', 'spillerNavn', b => b.belop || 0)[0];
  const botpoliti     = botpolitiRangering()[0];
  const nestenHelgen  = finnArsNestenHelgen();

  return {
    klubbNavn:     _klubbNavn(),
    sesongAar:     new Date().getFullYear(),
    botligaen, fairPlayLiga,
    sylteagurk:    botligaen[0]?.navn ?? null,
    botpoliti:     botpoliti?.navn ?? null,
    nestenHelgen:  nestenHelgen?.navn ?? null,
    bidragsyter:   bidragsyter?.navn ?? null,
    fairPlayLeder: fairPlayLiga[0]?.navn ?? null,
    sum:           boter.reduce((s, b) => s + (b.belop || 0), 0),
    antallBoter:   boter.length,
  };
}

function ligaRaderHtml(liste, ekstraKlasse = '') {
  return liste.map((r, i) => `<div class="bk-liga-rad">
    <div class="bk-liga-plass">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</div>
    <div class="bk-liga-navn">${escHtml(r.navn)}</div>
    <div class="bk-liga-antall ${ekstraKlasse}">${r.verdi}</div>
  </div>`).join('');
}

function renderStats() {
  const el = document.getElementById('botkassa-stats-innhold');
  if (!data.boter.length && !data.fairPlay.length) { el.innerHTML = `<div class="tom-tilstand">Ingen data å vise ennå.</div>`; return; }

  const d = beregnSesongData();

  el.innerHTML = `
    <div class="seksjon-etikett">🏆 Årets titler</div>
    <div class="bk-title-grid" style="margin-bottom:20px">
      <div class="bk-title-card"><div class="bk-title-emoji"><img class="agurk-emoji" src="agurkseddel.png" alt="🥒"></div><div class="bk-title-navn">${escHtml(d.sylteagurk ?? '—')}</div><div class="bk-title-label">Årets sylteagurk<br>(flest bøter)</div></div>
      <div class="bk-title-card"><div class="bk-title-emoji">👮</div><div class="bk-title-navn">${escHtml(d.botpoliti ?? '—')}</div><div class="bk-title-label">Årets botpoliti<br>(flest innmeldinger)</div></div>
      <div class="bk-title-card"><div class="bk-title-emoji">🙏</div><div class="bk-title-navn">${escHtml(d.nestenHelgen ?? '—')}</div><div class="bk-title-label">Årets nesten-helgen<br>(færrest bøter, blant de skyldige)</div></div>
      <div class="bk-title-card"><div class="bk-title-emoji">💸</div><div class="bk-title-navn">${escHtml(d.bidragsyter ?? '—')}</div><div class="bk-title-label">Årets bidragsyter<br>(høyest sum)</div></div>
      <div class="bk-title-card bk-title-card-fairplay" style="grid-column:1/-1"><div class="bk-title-emoji">🤝</div><div class="bk-title-navn bk-title-navn-fairplay">${escHtml(d.fairPlayLeder ?? '—')}</div><div class="bk-title-label">Fair Play-ordenens leder<br>(flest Fair Play-poeng)</div></div>
    </div>
    <p class="bk-liten-tekst" style="margin-bottom:20px">😂 Årets unnskyldning kåres av styret ved sesongslutt.</p>

    <div class="seksjon-etikett">Botligaen</div>
    <div class="kort" style="margin-bottom:20px"><div class="kort-innhold">
      ${d.botligaen.length ? ligaRaderHtml(d.botligaen) : `<div class="tom-tilstand-liten">Ingen bøter ennå.</div>`}
    </div></div>

    <div class="seksjon-etikett" style="color:var(--green2)">🤝 Fair Play-ordenen</div>
    <div class="kort bk-kort-fairplay" style="margin-bottom:24px"><div class="kort-innhold">
      ${d.fairPlayLiga.length ? ligaRaderHtml(d.fairPlayLiga, 'bk-liga-antall-fairplay') : `<div class="tom-tilstand-liten">Ingen Fair Play-poeng ennå.</div>`}
    </div></div>

    ${_getErAdmin() ? `
      <div class="seksjon-etikett">📤 Del sesongoppsummering</div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button class="knapp knapp-primaer" style="flex:1;font-size:18px" onclick="window.botkassaDelSesong('story', this)">Story</button>
        <button class="knapp knapp-omriss" style="flex:1" onclick="window.botkassaDelSesong('kvadrat', this)">Kvadrat</button>
      </div>
      <p class="bk-liten-tekst" style="text-align:center">Kun synlig for admin. Lager et bilde med årets titler og åpner delemenyen på mobil.</p>
    ` : ''}
  `;
}

window.botkassaDelSesong = function(format, btn) {
  _krevAdmin('Del sesongoppsummering', 'Kun botansvarlig/admin kan dele sesongoppsummeringen.', async () => {
    const opprinneligTekst = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Lager bilde …'; }
    try {
      await delSesongbilde(beregnSesongData(), format);
    } catch (e) {
      console.warn('[Botkassen] delSesongbilde feilet:', e?.message);
      visMelding('Kunne ikke lage bildet', 'feil');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = opprinneligTekst; }
    }
  });
};

// ════════════════════════════════════════════════════════
// REGLER
// ════════════════════════════════════════════════════════
function renderRegler() {
  const paragrafHtml = data.paragrafer.map(p => `
    <p><strong>${p.emoji} §${p.num} — ${escHtml(p.tittel)}.</strong>
    ${p.lagstraff ? 'Lagstraff — hele laget bøtelegges. ' : ''}
    Bot: ${p.ingenFast ? `vurderes av botansvarlig (${p.skjonnMin}–${p.skjonnMax} kr)` : p.skjonn ? `${p.skjonnMin}–${p.skjonnMax} kr, avhengig av alvorlighetsgrad` : p.belop + ' kr'}.</p>
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
      <p>Innrømmer du selv en forseelse før noen andre rekker å påpeke den, kan boten reduseres med 50 %. Melder du inn deg selv, lader det heller ikke opp karma mot deg. Forsøk på å skjule en forseelse kan derimot medføre at boten dobles.</p>

      <h3>§5 – Dommeren er ikke alltid en dommer</h3>
      <p>Alle medlemmer kan foreslå at en bot ilegges, men botkassen skal aldri brukes som våpen mot andre medlemmer. Ved tvilstilfeller avgjør botansvarlig, og avgjørelsen er normalt endelig.</p>

      <h3>§6 – Kreative bøter</h3>
      <p>Det er lov å foreslå bøter for årets mest kreative unnskyldning, mest optimistiske smash, og andre episoder som fortjener en plass i klubbhistorien. Botansvarlig avgjør om hendelsen kvalifiserer.</p>

      <h3>§7 – Maksimal bot</h3>
      <p>En enkeltstående hendelse kan aldri gi mer enn ${MAKS_BOT} kr i bot. Eneste unntak er karma (se under), som kan doble boten til maks ${MAKS_BOT_KARMA} kr. Formålet er god klubbkultur og litt selvironi — ikke økonomisk straff.</p>

      <h3>⚖️ Karma</h3>
      <p>Har du meldt inn noen for en paragraf, og blir du selv tatt for det samme senere i sesongen, dobles boten din automatisk — men aldri over ${MAKS_BOT_KARMA} kr. Hver innmelding gir én dobling. Botkassen glemmer aldri.</p>

      <h3>§8 – Betaling</h3>
      <p>Bøter betales til botkassen innen 14 dager via Vipps, merket «Bot – [navn]». Du ser hva du skylder under Min side.</p>

      <h3>§9 – Hva går pengene til?</h3>
      <p>Sosiale formål i eller knyttet til klubben — klubbfest, sosial turnering, premier eller lignende, besluttet av klubben. Ved sesongslutt offentliggjøres hvor mye som er samlet inn og hva pengene brukes til.</p>

      <h3>§10 – Viktigste regel</h3>
      <p>Botkassen skal aldri brukes til å henge ut, mobbe eller ydmyke et medlem. Vi skal le med hverandre, ikke av hverandre.</p>
    </div>
  `;
}

// ════════════════════════════════════════════════════════
// FELLES: spillerliste med søk og avkrysning
// ════════════════════════════════════════════════════════
function spillerlisteHtml(prefiks, toggleFn) {
  return data.spillere.length
    ? data.spillere.map(s => `
        <div class="bk-spiller-item" id="${prefiks}${escHtml(s.id)}" data-navn="${escHtml(s.navn.toLowerCase())}" role="checkbox" aria-checked="false" tabindex="0" onclick="window.${toggleFn}('${escHtml(s.id)}')">
          <div class="bk-checkbox">✓</div><div>${escHtml(s.navn)}</div>
        </div>`).join('')
    : `<div class="tom-tilstand-liten">Fant ingen spillere for klubben.</div>`;
}

/**
 * Filtrerer spillerlisten live — skjuler ikke-treff i stedet for å bygge
 * listen på nytt, så valgte spillere beholder avkrysningen.
 */
window.botkassaFiltrerSpillerliste = function(hvilken, sokTekst) {
  const container = document.getElementById(hvilken === 'fp' ? 'botkassa-fp-spillerliste' : 'botkassa-meld-spillerliste');
  const tomEl     = document.getElementById(hvilken === 'fp' ? 'botkassa-fp-ingen-treff'  : 'botkassa-meld-ingen-treff');
  if (!container) return;

  const sok = sokTekst.trim().toLowerCase();
  let synlige = 0;
  container.querySelectorAll('.bk-spiller-item').forEach(el => {
    const treff = !sok || (el.dataset.navn || '').includes(sok);
    el.style.display = treff ? 'flex' : 'none';
    if (treff) synlige++;
  });
  if (tomEl) tomEl.style.display = synlige === 0 ? 'block' : 'none';
};

function toggleIValgt(sett, id, elementId) {
  if (sett.has(id)) sett.delete(id); else sett.add(id);
  const el = document.getElementById(elementId);
  el?.classList.toggle('valgt', sett.has(id));
  el?.setAttribute('aria-checked', String(sett.has(id)));
}

window.botkassaLagreMittNavn = function(id) {
  settMittId(id);
  renderVenterVarsel();
};

// ════════════════════════════════════════════════════════
// MELD INN BOT
// ════════════════════════════════════════════════════════
export function visBotkassaMeld() {
  valgteSpillereIds = new Set();
  valgtParagrafId   = null;
  _naviger('botkassa-meld');

  fyllMittNavnSelect('botkassa-meld-mittnavn');
  document.getElementById('botkassa-meld-spillerliste').innerHTML = spillerlisteHtml('bk-ms-', 'botkassaToggleSpiller');
  document.getElementById('botkassa-meld-sok').value = '';
  document.getElementById('botkassa-meld-ingen-treff').style.display = 'none';
  document.getElementById('botkassa-meld-kommentar').value = '';
  renderMeldParagrafer();
}
window.visBotkassaMeld = visBotkassaMeld;

function renderMeldParagrafer() {
  if (valgtParagrafId && !data.paragrafer.some(p => p.id === valgtParagrafId)) valgtParagrafId = null;
  document.getElementById('botkassa-meld-paragrafliste').innerHTML = data.paragrafer.map(p => `
    <div class="bk-paragraf-item${p.id === valgtParagrafId ? ' valgt' : ''}" id="bk-mp-${escHtml(p.id)}" role="radio" aria-checked="${p.id === valgtParagrafId}" tabindex="0" onclick="window.botkassaVelgParagraf('${escHtml(p.id)}')">
      <div class="bk-paragraf-emoji">${p.emoji}</div>
      <div class="bk-paragraf-tittel">§${p.num} – ${escHtml(p.tittel)}</div>
      <div class="bk-paragraf-belop">${p.ingenFast ? 'Skjønn' : belopTekst(p)}</div>
    </div>`).join('');
  oppdaterBelopInfo();
}

function oppdaterBelopInfo() {
  const infoEl = document.getElementById('botkassa-meld-belop-info');
  const p = data.paragrafer.find(x => x.id === valgtParagrafId);
  if (!p) infoEl.textContent = '';
  else if (p.lagstraff) infoEl.textContent = '⚠️ Dette er en lagstraff — alle du velger over får hver sin bot.';
  else if (p.ingenFast) infoEl.textContent = `Botansvarlig vurderer og setter beløp ved godkjenning (${p.skjonnMin}–${p.skjonnMax} kr).`;
  else if (p.skjonn) infoEl.textContent = `Foreslått ${p.belop} kr — botansvarlig kan justere (${p.skjonnMin}–${p.skjonnMax} kr).`;
  else infoEl.textContent = '';
}

window.botkassaToggleSpiller = id => toggleIValgt(valgteSpillereIds, id, 'bk-ms-' + id);

window.botkassaVelgParagraf = function(id) {
  valgtParagrafId = id;
  document.querySelectorAll('#botkassa-meld-paragrafliste .bk-paragraf-item').forEach(el => {
    const valgt = el.id === 'bk-mp-' + id;
    el.classList.toggle('valgt', valgt);
    el.setAttribute('aria-checked', String(valgt));
  });
  oppdaterBelopInfo();
};

window.botkassaSendInnmelding = async function() {
  const klubbId = _getAktivKlubbId();
  const meg     = document.getElementById('botkassa-meld-mittnavn').value;
  if (!meg) return visMelding('Velg hvem du er', 'advarsel');
  if (!valgteSpillereIds.size) return visMelding('Velg minst én spiller', 'advarsel');
  const p = data.paragrafer.find(x => x.id === valgtParagrafId);
  if (!p) return visMelding('Velg en paragraf', 'advarsel');

  const mittNavn    = data.spillere.find(s => s.id === meg)?.navn ?? '?';
  const motSpillere = data.spillere.filter(s => valgteSpillereIds.has(s.id)).map(s => ({ id: s.id, navn: s.navn }));
  const kommentar   = document.getElementById('botkassa-meld-kommentar').value.trim();
  const btn = document.getElementById('botkassa-meld-send-btn');
  btn.disabled = true;

  try {
    await opprettInnmelding({
      klubbId, meldtAvId: meg, meldtAvNavn: mittNavn, motSpillere,
      paragrafId: p.id, paragrafTittel: `§${p.num} – ${p.tittel}`,
      foreslattBelop: p.ingenFast ? 0 : Math.min(p.belop, MAKS_BOT),
      kommentar,
    });
    visMelding('Sendt til botkontroll! 🥒');
    _naviger('botkassa-hjem');
  } catch (e) {
    console.warn('[Botkassen] sendInnmelding feilet:', e?.message);
    visMelding('Kunne ikke sende inn — sjekk nettforbindelsen og prøv igjen', 'feil');
  } finally {
    btn.disabled = false;
  }
};

// ════════════════════════════════════════════════════════
// MELD FAIR PLAY-POENG
// ════════════════════════════════════════════════════════
export function visBotkassaFairplay() {
  valgteSpillereIdsFP = new Set();
  valgtKategoriId     = null;
  _naviger('botkassa-fairplay');

  fyllMittNavnSelect('botkassa-fp-mittnavn');
  document.getElementById('botkassa-fp-spillerliste').innerHTML = spillerlisteHtml('bk-fps-', 'botkassaToggleSpillerFP');
  document.getElementById('botkassa-fp-sok').value = '';
  document.getElementById('botkassa-fp-ingen-treff').style.display = 'none';

  document.getElementById('botkassa-fp-kategoriliste').innerHTML = FAIRPLAY_KATEGORIER.map(k => `
    <div class="bk-paragraf-item bk-paragraf-item-fairplay" id="bk-fpk-${k.id}" role="radio" aria-checked="false" tabindex="0" onclick="window.botkassaVelgKategoriFP('${k.id}')">
      <div class="bk-paragraf-emoji">${k.emoji}</div>
      <div class="bk-paragraf-tittel">${escHtml(k.tittel)}</div>
    </div>`).join('');

  document.getElementById('botkassa-fp-kommentar').value = '';
}
window.visBotkassaFairplay = visBotkassaFairplay;

window.botkassaToggleSpillerFP = id => toggleIValgt(valgteSpillereIdsFP, id, 'bk-fps-' + id);

window.botkassaVelgKategoriFP = function(id) {
  valgtKategoriId = id;
  document.querySelectorAll('#botkassa-fp-kategoriliste .bk-paragraf-item').forEach(el => {
    const valgt = el.id === 'bk-fpk-' + id;
    el.classList.toggle('valgt', valgt);
    el.setAttribute('aria-checked', String(valgt));
  });
};

window.botkassaSendFairplay = async function() {
  const klubbId = _getAktivKlubbId();
  const meg     = document.getElementById('botkassa-fp-mittnavn').value;
  if (!meg) return visMelding('Velg hvem du er', 'advarsel');
  if (!valgteSpillereIdsFP.size) return visMelding('Velg minst én spiller', 'advarsel');
  const k = FAIRPLAY_KATEGORIER.find(x => x.id === valgtKategoriId);
  if (!k) return visMelding('Velg en kategori', 'advarsel');

  const mittNavn    = data.spillere.find(s => s.id === meg)?.navn ?? '?';
  const motSpillere = data.spillere.filter(s => valgteSpillereIdsFP.has(s.id)).map(s => ({ id: s.id, navn: s.navn }));
  const kommentar   = document.getElementById('botkassa-fp-kommentar').value.trim();
  const btn = document.getElementById('botkassa-fp-send-btn');
  btn.disabled = true;

  try {
    await opprettFairPlayPoeng({
      klubbId, meldtAvId: meg, meldtAvNavn: mittNavn, motSpillere,
      kategoriId: k.id, kategoriTittel: `${k.emoji} ${k.tittel}`,
      kommentar,
    });
    visMelding('Fair Play-poeng sendt! 🤝');
    _naviger('botkassa-hjem');
  } catch (e) {
    console.warn('[Botkassen] sendFairplay feilet:', e?.message);
    visMelding('Kunne ikke sende — sjekk nettforbindelsen og prøv igjen', 'feil');
  } finally {
    btn.disabled = false;
  }
};

// ════════════════════════════════════════════════════════
// MIN SIDE — saker som venter på svar, saldo, ubetalte bøter,
// eget bidrag, sesongtall og status på egne innmeldinger.
// ════════════════════════════════════════════════════════
export function visBotkassaMinSide() {
  _naviger('botkassa-min-side');
  fyllMittNavnSelect('botkassa-minside-mittnavn');
  renderMinSide({ hentPaNytt: true });
}
window.visBotkassaMinSide = visBotkassaMinSide;

window.botkassaMinSideByttNavn = function(id) {
  settMittId(id);
  renderVenterVarsel();
  renderMinSide({ hentPaNytt: true });
};

function statusBadgeHtml(status) {
  if (status === 'godkjent') return `<span class="bk-status bk-status-godkjent">Godkjent</span>`;
  if (status === 'avvist')   return `<span class="bk-status bk-status-avvist">Avvist</span>`;
  return `<span class="bk-status bk-status-venter">Venter</span>`;
}

function innmeldingRadHtml(im) {
  const flereMot = im.motSpillere?.length
    ? ` <span class="bk-liten-tekst">(${im.motSpillere.map(m => escHtml(m.navn)).join(', ')})</span>` : '';
  return `<div class="bk-rad-mellom bk-minside-rad">
    <span style="font-size:14px">${escHtml(im.paragrafTittel)}${flereMot}</span>
    ${statusBadgeHtml(im.status)}
  </div>`;
}

function venterKortHtml(im, meg) {
  const eksisterende = im.svar?.[meg]?.tekst || '';
  const id = escHtml(im.id);
  return `<div class="bk-admin-card bk-venter-kort">
    <div class="bk-feed-paragraf">🚨 ${escHtml(im.paragrafTittel)}${im.foreslattBelop ? ' · foreslått ' + im.foreslattBelop + ' kr' : ''}</div>
    ${im.kommentar ? `<div class="bk-feed-kommentar">«${escHtml(im.kommentar)}» — ${escHtml(im.meldtAvNavn)}</div>` : `<div class="bk-liten-tekst" style="margin-bottom:6px">Meldt inn av ${escHtml(im.meldtAvNavn)}</div>`}
    <button class="knapp knapp-fare knapp-liten" style="margin-top:8px" onclick="window.botkassaVisSvarBoks('${id}')">${eksisterende ? 'Vis/rediger svar' : 'Svar'}</button>
    <div id="bk-svarboks-${id}" data-bevar-vis style="display:${eksisterende ? 'flex' : 'none'};flex-direction:column;gap:8px;margin-top:10px">
      <label for="bk-svar-${id}" style="margin:0">Din forklaring (valgfritt — vises i feeden hvis boten godkjennes)</label>
      <textarea id="bk-svar-${id}" data-bevar maxlength="500" placeholder="F.eks. «Jeg trodde egentlig at …»">${escHtml(eksisterende)}</textarea>
      <button class="knapp knapp-primaer knapp-liten" onclick="window.botkassaSendSvar('${id}', this)">${eksisterende ? 'Oppdater forklaring' : 'Send forklaring'}</button>
    </div>
  </div>`;
}
window.botkassaVisSvarBoks = function(id) {
  const boks = document.getElementById('bk-svarboks-' + id);
  if (boks) boks.style.display = boks.style.display === 'none' ? 'flex' : 'none';
};

/**
 * @param {object} opts
 * @param {boolean} opts.hentPaNytt — hent egne innmeldinger fra Firestore.
 *   Ellers brukes forrige svar, så vanlige sanntidsoppdateringer (f.eks.
 *   en like) ikke gir et nytt nettverkskall.
 */
async function renderMinSide({ hentPaNytt = false } = {}) {
  const el      = document.getElementById('botkassa-minside-innhold');
  const klubbId = _getAktivKlubbId();
  const meg     = mittId();

  if (!meg) {
    mineInnmeldingerFor = null;
    el.innerHTML = `<div class="tom-tilstand-liten">Velg deg selv over for å se din side.</div>`;
    return;
  }

  if (hentPaNytt || mineInnmeldingerFor !== meg) {
    const nr = ++minSideHentNr;
    if (mineInnmeldingerFor !== meg) el.innerHTML = lasterHtml('Henter din oversikt …');
    const resultat = await hentMineInnmeldinger(klubbId, meg);
    // Et nyere kall, eller et bytte av «hvem er jeg», har tatt over.
    if (nr !== minSideHentNr || meg !== mittId()) return;
    mineInnmeldinger    = resultat;
    mineInnmeldingerFor = meg;
  }

  const mineBoter    = data.boter.filter(b => b.spillerId === meg);
  const ubetalte     = mineBoter.filter(b => !b.betalt);
  const mineFairPlay = data.fairPlay.filter(f => f.spillerId === meg);
  const mineVentende = data.ventende.filter(im => im.motSpillere?.some(m => m.id === meg));
  const saldo        = ubetalte.reduce((s, b) => s + (b.belop || 0), 0);
  const bidrag       = mineBoter.filter(b => b.betalt).reduce((s, b) => s + (b.belop || 0), 0);

  renderTrygt(el, () => `
    ${mineVentende.map(im => venterKortHtml(im, meg)).join('')}

    ${mineBoter.length ? `
      <div class="bk-stat-tile full bk-stat-tile-saldo" style="margin-bottom:10px">
        <div>
          <span class="bk-stat-label bk-stat-value-saldo" style="margin:0">DIN SALDO</span>
          <div class="bk-liten-tekst">${ubetalte.length} ubetalte bøter</div>
        </div>
        <span class="bk-stat-value-saldo">${saldo.toLocaleString('nb-NO')} kr</span>
      </div>
      ${ubetalte.length ? `<div style="margin-bottom:10px">${ubetalte.map(b => `
        <div class="bk-rad-mellom bk-minside-rad">
          <span style="font-size:14px">${escHtml(b.paragrafTittel)}${b.karmaDoblet ? ' ⚖️' : ''}</span>
          <span class="bk-feed-belop" style="font-size:15px">${b.belop} kr</span>
        </div>`).join('')}
        <p class="bk-liten-tekst" style="margin-top:4px">Betal via Vipps, merket «Bot – ditt navn».</p>
      </div>` : ''}
      <div class="bk-stat-tile full bk-stat-tile-fairplay" style="margin-bottom:20px">
        <div>
          <span class="bk-stat-label bk-stat-value-fairplay" style="margin:0">DITT BIDRAG DENNE SESONGEN</span>
          <div class="bk-liten-tekst">Går til sosiale formål i klubben</div>
        </div>
        <span class="bk-stat-value-fairplay">${bidrag.toLocaleString('nb-NO')} kr</span>
      </div>
    ` : `<div class="tom-tilstand-liten" style="margin-bottom:20px">Ingen bøter registrert på deg ennå. 🎉</div>`}

    <div class="seksjon-etikett">Denne sesongen</div>
    <div class="bk-stat-grid" style="margin-bottom:20px">
      <div class="bk-stat-tile"><div class="bk-stat-value">${mineBoter.length}</div><div class="bk-stat-label">🚨 Bøter</div></div>
      <div class="bk-stat-tile bk-stat-tile-fairplay"><div class="bk-stat-value bk-stat-value-fairplay">${mineFairPlay.length}</div><div class="bk-stat-label">🤝 Fair Play mottatt</div></div>
      <div class="bk-stat-tile full"><span class="bk-stat-label" style="margin:0">👮 Meldt inn av deg</span><span class="bk-stat-value">${mineInnmeldinger.length}</span></div>
    </div>

    <div class="seksjon-etikett">Dine siste innmeldinger</div>
    ${mineInnmeldinger.length ? mineInnmeldinger.slice(0, 5).map(innmeldingRadHtml).join('') : `<div class="tom-tilstand-liten">Du har ikke meldt inn noen ennå.</div>`}
  `);
}

window.botkassaSendSvar = async function(innmeldingId, btn) {
  const meg = mittId();
  const felt = document.getElementById('bk-svar-' + innmeldingId);
  if (!meg || !felt) return;
  if (btn) btn.disabled = true;
  try {
    await svarPaInnmelding(innmeldingId, meg, felt.value.trim());
    visMelding('Forklaring sendt! 🥒');
  } catch (e) {
    console.warn('[Botkassen] svarPaInnmelding feilet:', e?.message);
    visMelding('Kunne ikke sende — saken kan allerede være behandlet', 'feil');
  } finally {
    if (btn) btn.disabled = false;
  }
};
