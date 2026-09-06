# 🥒 Botkassa

Botkasse-app for **Pickleball Jæren** — meld inn bøter, botansvarlig
godkjenner, feed, statistikk og "Hensikt og regler". Bygget som en
installerbar PWA med samme design som klubbens andre apper
(Stafettligaen/Mesteren), og kobler til samme Firebase-prosjekt for å
bruke den ekte spillerlisten.

Appen har også en positiv motvekt til bøtene: **Fair Play-poeng**.
Alle kan gi hverandre et poeng for fair play, en utrolig prestasjon
eller å ha gjort noens dag — postes rett i feeden uten godkjenning,
og rangeres i **Fair Play-ordenen** ved siden av Botligaen.

## Filer i dette repoet

| Fil | Hva den gjør |
|---|---|
| `index.html` | Siden selv — alle Botkassa-skjermene |
| `app.js` | Oppstart, kobler modulene sammen (klubben er hardkodet til Pickleball Jæren) |
| `firebase.js` | Firebase-oppsett og delte samlingsreferanser |
| `ui.js` | Toast-meldinger, navigasjon, XSS-escaping |
| `admin.js` | PIN-beskyttelse for botkontroll |
| `botkassa-logikk.js` | Alt som snakker med Firestore (paragrafer, innmeldinger, bøter, karma, Fair Play-poeng) |
| `botkassa-ui.js` | Medlemsskjermene: hjem, meld inn bot, meld Fair Play-poeng, feed, statistikk, regler, venter på deg |
| `botkassa-admin-ui.js` | Botkontroll: godkjenn/avvis/juster, betaling, rediger paragrafer, del appen (QR/lenke), nullstill sesongen |
| `botkassa.css` | Alle stiler (design-tokens + komponenter) |
| `manifest.json` | Gjør appen installerbar som PWA |
| `sw.js` | Service worker — cacher appen for offline-bruk |
| `icon-192.png` / `icon-512.png` | Enkle plassholder-ikoner — bytt gjerne ut med klubbens egen logo |

## Kom i gang

### 1. Legg til Firestore-regler (obligatorisk)

Botkassa skriver til tre nye samlinger i det delte Firebase-prosjektet:
`botkasseParagrafer`, `botkasseInnmeldinger`, `botkasseBoter`. Disse må
legges til i firestore.rules før noe kan lagres. Fair Play-poeng
bruker en fjerde samling, `botkasseFairPlay`.

Gå til: https://console.firebase.google.com/project/pickle-rank-5fbe5/firestore/rules

Lim inn rett før den siste `}}` i reglene dine:

```
match /botkasseParagrafer/{klubbId} {
  allow read: if true;
  allow write: if request.resource.data.paragrafer is list;
}
match /botkasseInnmeldinger/{id} {
  allow read: if true;
  allow create, update: if request.resource.data.status in ['venter','godkjent','avvist'];
  allow delete: if true;
}
match /botkasseBoter/{id} {
  allow read: if true;
  allow create, update: if request.resource.data.klubbId is string && request.resource.data.belop is number;
  allow delete: if true;
}
match /botkasseFairPlay/{id} {
  allow read: if true;
  allow create, update: if request.resource.data.klubbId is string && request.resource.data.spillerId is string;
  allow delete: if true;
}
```

Trykk **Publiser**.

### 2. Publiser repoet

Alle filene er statiske (ingen byggesteg nødvendig). Du kan bruke
f.eks. GitHub Pages, Netlify, Vercel eller Firebase Hosting — pek
bare rot-domenet til denne mappen.

### 3. Åpne appen

Appen går rett til Botkassa-hjem for Pickleball Jæren — ingen
klubbvelger lenger, siden dette repoet er dedikert til én klubb.

### 4. Del appen med spillerne

Under **Botkontroll → Del appen** finner admin en QR-kode og en
delbar lenke til appen (klar til å skrive ut, sende i gruppechat,
eller dele via mobilens del-meny). Fungerer best hvis spillerne
legger siden til på hjemskjermen etterpå.

### 5. Nullstille sesongen

Under **Botkontroll → Nullstill** kan admin slette all bot-historikk
og alle Fair Play-poeng permanent — feed, statistikk, botligaen og
Fair Play-ordenen bygger alle på samme data, så dette nullstiller alt
samtidig. Paragrafer og eventuelle innmeldinger til behandling blir
ikke rørt. Krever at man skriver "NULLSTILL" for å bekrefte, og kan
ikke angres.

## PIN-kode

| Klubb | PIN |
|---|---|
| Pickleball Jæren | 9436 |

## Kjente begrensninger (bevisste, for en første versjon)

- **Ingen ekte autentisering.** PIN-en sjekkes kun i nettleseren, akkurat
  som i klubbens andre apper. Alle som finner Firebase-konfigurasjonen
  kan i prinsippet lese/skrive gyldige dokumenter direkte. Dette er
  samme tillitsmodell som resten av appfamilien.
- **Betaling er manuell.** "Merk betalt" er en enkel av/på-bryter — ekte
  Vipps-integrasjon (automatisk betaling + kvittering) krever et eget
  Vipps-avtalenummer og betalings-API, og er ikke laget her.
- **Tre roller er slått sammen til én PIN.** Botansvarlig og admin deler
  samme PIN-nivå foreløpig (medlem er fortsatt uten PIN).
- **QR-koden genereres via en ekstern tjeneste** (api.qrserver.com) —
  lenken sendes dit for å tegnes som bilde, men lagres ikke der.
- **"Årets unnskyldning"** kåres manuelt av styret ved sesongslutt —
  den er ikke automatisk utregnet ("Fair Play-ordenens leder" derimot
  er automatisk, basert på flest Fair Play-poeng mottatt).
- **Fair Play-poeng har ingen godkjenning eller moderering.** Alle kan
  sende et poeng til hvem som helst, uten at botansvarlig kan avvise
  det (kun slette hele sesongen via Nullstill). Bevisst valg for å
  holde terskelen lav — men det betyr også at det ikke er noen
  innebygd sperre mot useriøs bruk, utover samme tillitsnivå som
  resten av appen.
- **Fair Play-poeng påvirker aldri bøter eller karma.** De to systemene
  er bevisst holdt adskilt — et poeng kan ikke redusere eller
  nøytralisere en bot, for å unngå at noen "kjøper seg fri" ved å be
  en venn sende et poeng rett før de blir meldt inn.
