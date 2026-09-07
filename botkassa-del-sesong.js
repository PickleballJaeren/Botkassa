// ════════════════════════════════════════════════════════
// botkassa-del-sesong.js — Genererer et delbart PNG-bilde av
// sesongoppsummeringen ("wrapped"), tegnet med Canvas API.
// Ingen avhengigheter, ingen server involvert — samme filosofi
// som resten av appen: ren klientkode, ingen byggesteg.
//
// Kalles fra Statistikk-skjermen i botkassa-ui.js, med et
// ferdig sesongdata-objekt (se beregnSesongData() der).
// ════════════════════════════════════════════════════════

const FARGER = {
  bakgrunn:   '#050f1f',
  navy2:      '#0b1a30',
  gul:        '#eab308',
  hvit:       '#f1f5f9',
  gra:        '#94a3b8',
  graMork:    '#64748b',
  fotFarge:   '#334155',
  gronnBg:    'rgba(22,163,74,0.16)',
  gronnKant:  'rgba(22,163,74,0.5)',
  gronnTekst: '#4ade80',
};

const FORMATER = {
  story:   { bredde: 1080, hoyde: 1920 },
  kvadrat: { bredde: 1080, hoyde: 1080 },
};

function tegnAvrundetRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Sørger for at webfontene faktisk er lastet før vi tegner tekst på canvas —
 * canvas venter IKKE automatisk på fonter slik vanlig HTML gjør.
 */
async function lastFonter() {
  try {
    await Promise.all([
      document.fonts.load('400 100px "Bebas Neue"'),
      document.fonts.load('500 60px "DM Sans"'),
      document.fonts.load('700 60px "DM Sans"'),
      document.fonts.load('700 60px "DM Mono"'),
    ]);
  } catch (e) {
    console.warn('[Botkassa] Kunne ikke forhåndslaste fonter, bruker systemfont som reserve:', e?.message);
  }
}

function wrapText(ctx, tekst, x, y, maxW, lineHeight) {
  const ord = String(tekst ?? '').split(' ');
  let linje = '';
  let yy = y;
  ord.forEach(o => {
    const test = linje + o + ' ';
    if (ctx.measureText(test).width > maxW && linje) {
      ctx.fillText(linje.trim(), x, yy);
      linje = o + ' ';
      yy += lineHeight;
    } else {
      linje = test;
    }
  });
  ctx.fillText(linje.trim(), x, yy);
}

function tegnTittelKort(ctx, x, y, w, h, emoji, navn, label, storTekst) {
  ctx.fillStyle = FARGER.navy2;
  tegnAvrundetRect(ctx, x, y, w, h, 24);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = FARGER.hvit;
  ctx.font = `${storTekst ? 60 : 44}px "DM Sans"`;
  ctx.fillText(emoji, x + w / 2, y + h * 0.36);

  ctx.font = `700 ${storTekst ? 42 : 32}px "DM Sans"`;
  ctx.fillText(navn || '—', x + w / 2, y + h * 0.62);

  ctx.font = `${storTekst ? 24 : 19}px "DM Sans"`;
  ctx.fillStyle = FARGER.graMork;
  wrapText(ctx, label, x + w / 2, y + h * 0.80, w - 28, storTekst ? 28 : 22);
}

/**
 * Tegner selve sesongbildet på et frittstående (usynlig) canvas og
 * returnerer det som en PNG-Blob. `data` kommer fra beregnSesongData()
 * i botkassa-ui.js — se der for nøyaktig form.
 */
export async function tegnSesongbilde(data, format = 'story') {
  await lastFonter();
  const { bredde, hoyde } = FORMATER[format] || FORMATER.story;
  const erStory = format === 'story';

  const canvas = document.createElement('canvas');
  canvas.width = bredde;
  canvas.height = hoyde;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = FARGER.bakgrunn;
  ctx.fillRect(0, 0, bredde, hoyde);

  const midtX = bredde / 2;
  const sideMargin = erStory ? 64 : 56;
  const innholdsbredde = bredde - sideMargin * 2;
  ctx.textAlign = 'center';

  // ── Header ──
  ctx.fillStyle = FARGER.gra;
  ctx.font = `${erStory ? 30 : 24}px "DM Sans"`;
  ctx.fillText((data.klubbNavn || '').toUpperCase(), midtX, erStory ? 150 : 92);

  ctx.fillStyle = FARGER.gul;
  ctx.font = `${erStory ? 130 : 82}px "Bebas Neue"`;
  ctx.fillText('BOTKASSA', midtX, erStory ? 268 : 164);

  ctx.fillStyle = FARGER.graMork;
  ctx.font = `${erStory ? 26 : 20}px "DM Sans"`;
  ctx.fillText(`SESONGEN ${data.sesongAar}`, midtX, erStory ? 306 : 192);

  // ── Titler — 2×2 grid ──
  const gridY  = erStory ? 380 : 228;
  const gap    = erStory ? 22 : 16;
  const tileW  = (innholdsbredde - gap) / 2;
  const tileH  = erStory ? 250 : 158;

  const titler = [
    { emoji: '🥒', navn: data.sylteagurk,   label: 'Årets sylteagurk' },
    { emoji: '👮', navn: data.botpoliti,    label: 'Årets botpoliti' },
    { emoji: '🙏', navn: data.nestenHelgen, label: 'Nesten-helgen' },
    { emoji: '💰', navn: data.bidragsyter,  label: 'Årets bidragsyter' },
  ];
  titler.forEach((t, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = sideMargin + col * (tileW + gap);
    const y = gridY + row * (tileH + gap);
    tegnTittelKort(ctx, x, y, tileW, tileH, t.emoji, t.navn, t.label, erStory);
  });

  // ── Fair Play-leder — grønt kort, full bredde ──
  const fpY = gridY + 2 * tileH + gap * 2;
  const fpH = erStory ? 120 : 84;
  ctx.fillStyle = FARGER.gronnBg;
  tegnAvrundetRect(ctx, sideMargin, fpY, innholdsbredde, fpH, 20);
  ctx.fill();
  ctx.strokeStyle = FARGER.gronnKant;
  ctx.lineWidth = 1.5;
  tegnAvrundetRect(ctx, sideMargin, fpY, innholdsbredde, fpH, 20);
  ctx.stroke();

  ctx.fillStyle = FARGER.gronnTekst;
  ctx.font = `700 ${erStory ? 38 : 28}px "DM Sans"`;
  ctx.fillText(`🤝 ${data.fairPlayLeder || '—'} — Fair Play-leder`, midtX, fpY + fpH / 2 + 13);

  // ── Statistikk-rad ──
  const statY = erStory ? hoyde - 240 : fpY + fpH + 84;
  ctx.font = `700 ${erStory ? 62 : 44}px "DM Mono"`;
  ctx.fillStyle = FARGER.hvit;
  ctx.fillText(`${(data.sum || 0).toLocaleString('nb-NO')} kr`, midtX - innholdsbredde / 4, statY);
  ctx.fillText(`${data.antallBoter || 0}`, midtX + innholdsbredde / 4, statY);

  ctx.font = `${erStory ? 23 : 17}px "DM Sans"`;
  ctx.fillStyle = FARGER.graMork;
  ctx.fillText('samlet inn', midtX - innholdsbredde / 4, statY + 38);
  ctx.fillText('bøter gitt', midtX + innholdsbredde / 4, statY + 38);

  // ── Footer ──
  ctx.font = `${erStory ? 22 : 17}px "DM Sans"`;
  ctx.fillStyle = FARGER.fotFarge;
  ctx.fillText('LAGET MED BOTKASSA 🥒', midtX, hoyde - (erStory ? 66 : 36));

  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

/**
 * Genererer bildet og åpner mobilens delemeny (Web Share API med fil).
 * Faller tilbake til nedlasting hvis nettleseren ikke støtter fildeling
 * (typisk desktop, eller eldre nettlesere).
 */
export async function delSesongbilde(data, format = 'story') {
  const blob = await tegnSesongbilde(data, format);
  const fil  = new File([blob], `botkassa-sesong-${format}.png`, { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [fil] })) {
    try {
      await navigator.share({
        files: [fil],
        title: 'Botkassa — sesongoppsummering',
        text: `${data.klubbNavn} — Botkassa sesongen ${data.sesongAar} 🥒`,
      });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return; // brukeren avbrøt delingen selv — ikke en feil
      console.warn('[Botkassa] navigator.share feilet, laster ned i stedet:', e?.message);
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `botkassa-sesong-${format}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
