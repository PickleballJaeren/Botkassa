# 🥒 Botkassa

Botkasse-app for klubben — meld inn bøter, botansvarlig godkjenner,
feed, statistikk og "Hensikt og regler". Bygget som en installerbar
PWA med samme design som klubbens andre apper (Stafettligaen/Mesteren),
og kobler til samme Firebase-prosjekt for å bruke den ekte spillerlisten.

## Filer i dette repoet

| Fil | Hva den gjør |
|---|---|
| `index.html` | Siden selv — klubbvelger + alle Botkassa-skjermene |
| `app.js` | Oppstart, klubbvalg, kobler modulene sammen |
| `firebase.js` | Firebase-oppsett og delte samlingsreferanser |
| `ui.js` | Toast-meldinger, navigasjon, XSS-escaping |
| `admin.js` | PIN-beskyttelse for botkontroll |
| `botkassa-logikk.js` | Alt som snakker med Firestore (paragrafer, innmeldinger, bøter, karma) |
| `botkassa-ui.js` | Medlemsskjermene: hjem, meld inn bot, feed, statistikk, regler |
| `botkassa-admin-ui.js` | Botkontroll: godkjenn/avvis/juster, betaling, rediger paragrafer |
| `botkassa.css` | Alle stiler (design-tokens + komponenter) |
| `manifest.json` | Gjør appen installerbar som PWA |
| `sw.js` | Service worker — cacher appen for offline-bruk |
| `icon-192.png` / `icon-512.png` | Enkle plassholder-ikoner — bytt gjerne ut med klubbens egen logo |

## Kom i gang

### 1. Legg til Firestore-regler (obligatorisk)

Botkassa skriver til tre nye samlinger i det delte Firebase-prosjektet:
`botkasseParagrafer`, `botkasseInnmeldinger`, `botkasseBoter`. Disse må
legges til i firestore.rules før noe kan lagres.

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
```

Trykk **Publiser**.

### 2. Publiser repoet

Alle filene er statiske (ingen byggesteg nødvendig). Du kan bruke
f.eks. GitHub Pages, Netlify, Vercel eller Firebase Hosting — pek
bare rot-domenet til denne mappen.

### 3. Åpne appen

Velg klubb på forsiden (samme PIN-koder som resten av klubbens apper),
og appen kobler seg automatisk til samme spillerliste. Du kan også
lenke direkte til en klubb med `?klubb=pickleball-jaeren` i URL-en.

## PIN-koder (samme som resten av klubbens apper)

| Klubb | PIN |
|---|---|
| Pickleball Jæren | 9436 |
| Fokus Pickleball | 4350 |
| TSI Pickleball | 9299 |
| Løten Tennisklubb | 2341 |
| Demo | ingen PIN — alle er admin |

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
- **"Årets unnskyldning" og "Årets fair-play-spiller"** kåres manuelt av
  styret ved sesongslutt — de er ikke automatisk utregnet.
