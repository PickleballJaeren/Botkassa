# 🥒 Botkassen

Botkasse-app for **Pickleball Jæren** — meld inn bøter, botansvarlig
godkjenner, feed, statistikk, «Min side» (personlig saldo og oversikt)
og «Hensikt og regler». Bygget som en installerbar PWA med samme
design som klubbens andre apper (Stafettligaen/Mesteren), og kobler
til samme Firebase-prosjekt for å bruke den ekte spillerlisten.

Appen har også en positiv motvekt til bøtene: **Fair Play-poeng**.
Alle kan gi hverandre et poeng for fair play, en utrolig prestasjon
eller å ha gjort noens dag — postes rett i feeden uten godkjenning,
og rangeres i **Fair Play-ordenen** ved siden av Botligaen.

## Bøtegrenser

- En vanlig hendelse gir **maks 50 kr**.
- **Karma** kan doble boten, men **aldri over 100 kr**.
- Grensene ligger i `MAKS_BOT` og `MAKS_BOT_KARMA` øverst i
  `botkassa-logikk.js`. Paragrafer som er lagret med høyere beløp fra
  før, klemmes automatisk ned til grensen når de lastes.
- Melder du inn deg selv (§4), lader det ikke opp karma mot deg, og
  botkontrollen får et forslag om 50 % reduksjon.

## Filer

| Fil | Hva den gjør |
|---|---|
| `index.html` | Siden selv — alle skjermene |
| `app.js` | Oppstart og modulkobling (klubben er hardkodet til Pickleball Jæren) |
| `firebase.js` | Firebase-oppsett |
| `ui.js` | Toast, navigasjon, XSS-escaping og `renderTrygt` (oppdaterer innhold uten å slette det brukeren skriver) |
| `admin.js` | PIN-beskyttelse for botkontroll |
| `botkassa-logikk.js` | Alt som snakker med Firestore, bøtegrenser, karma og statistikk-hjelpere |
| `botkassa-data.js` | Felles datalager — én sett sanntidslyttere som hele appen deler |
| `botkassa-ui.js` | Medlemsskjermene: hjem, meld inn bot, Fair Play, feed, statistikk, regler, Min side |
| `botkassa-admin-ui.js` | Botkontroll: godkjenn/avvis/juster, betaling, paragrafer, del appen, nullstill |
| `botkassa-del-sesong.js` | Lager delbart sesongbilde («wrapped») med Canvas API |
| `botkassa.css` | Alle stiler |
| `manifest.json` / `sw.js` | PWA og offline-cache |

Filnavnene og Firestore-samlingene beholder `botkassa`/`botkasse`-navnet
med vilje. Å endre samlingsnavnene ville gjort all eksisterende data
usynlig, og localStorage-nøklene beholdes så ingen mister «hvem er jeg».

## Kom i gang

### 1. Firestore-regler (obligatorisk)

Gå til Firebase Console → Firestore → Rules og lim inn dette rett før
den siste `}}`. Reglene er strammet inn: beløp kan ikke settes over
100 kr, en godkjent bot kan ikke endres i ettertid (bare betalt-status
og likes), og en innmelding kan bare behandles én gang.

```
match /botkasseParagrafer/{klubbId} {
  allow read: if true;
  allow write: if request.resource.data.paragrafer is list
               && request.resource.data.paragrafer.size() <= 50;
}
match /botkasseInnmeldinger/{id} {
  allow read: if true;
  allow create: if request.resource.data.status == 'venter'
                && request.resource.data.klubbId is string
                && request.resource.data.motSpillere is list
                && request.resource.data.foreslattBelop is number
                && request.resource.data.foreslattBelop <= 50;
  allow update: if resource.data.status == 'venter' && (
                   request.resource.data.diff(resource.data).affectedKeys().hasOnly(['svar'])
                || (request.resource.data.status in ['godkjent', 'avvist']
                    && request.resource.data.diff(resource.data).affectedKeys()
                         .hasOnly(['status', 'behandletAvNavn', 'behandletTidspunkt'])));
  allow delete: if false;
}
match /botkasseBoter/{id} {
  allow read: if true;
  allow create: if request.resource.data.klubbId is string
                && request.resource.data.belop is number
                && request.resource.data.belop > 0
                && request.resource.data.belop <= 100;
  allow update: if request.resource.data.diff(resource.data).affectedKeys()
                   .hasOnly(['betalt', 'likes', 'likedAv']);
  allow delete: if true; // brukes av «Nullstill sesongen»
}
match /botkasseFairPlay/{id} {
  allow read: if true;
  allow create: if request.resource.data.klubbId is string
                && request.resource.data.spillerId is string;
  allow update: if request.resource.data.diff(resource.data).affectedKeys()
                   .hasOnly(['likes', 'likedAv']);
  allow delete: if true; // brukes av «Nullstill sesongen»
}
```

Trykk **Publiser**.

### 2. Indekser

«Min side» og karma-sjekken bruker sammensatte spørringer. Mangler en
indeks, står det en feilmelding i nettleserkonsollen med en lenke som
oppretter den med ett klikk.

### 3. Publiser

Alle filene er statiske (ingen byggesteg). GitHub Pages, Netlify,
Vercel eller Firebase Hosting fungerer. **Ikke publiser denne README-en
sammen med appen** hvis den inneholder noe dere vil holde for dere selv.

### 4. Del appen

Under **Botkontroll → Del appen** finnes QR-kode og lenke.

### 5. Nullstille sesongen

Under **Botkontroll → Nullstill** slettes alle bøter og Fair Play-poeng
permanent. Paragrafer og ventende innmeldinger røres ikke. Del gjerne
sesongbildet fra Statistikk først.

## PIN-kode

PIN-en for botkontroll står i `app.js` og deles muntlig med
botansvarlig/styret. Trykk **Logg ut** i Botkontroll når du låner bort
telefonen.

## Kjente begrensninger

- **Ingen ekte autentisering.** PIN-en sjekkes kun i nettleseren og er
  synlig i kildekoden. Den hindrer uhell, ikke målrettet juks. Neste
  naturlige steg er Firebase Authentication med en admin-rolle, slik at
  reglene kan nekte sletting og godkjenning for vanlige brukere.
- **Betaling er manuell.** «Merk betalt» er en av/på-bryter.
- **QR-koden genereres via api.qrserver.com** — lenken sendes dit.
- **«Årets unnskyldning»** kåres manuelt av styret.
- **Fair Play-poeng har ingen godkjenning** og påvirker aldri bøter
  eller karma — bevisst holdt adskilt.
