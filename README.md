# Avtonet Bot

Namizni program za obnavljanje oglasov na avto.net. Electron + TypeScript + React.

Prepis prejšnje Electron aplikacije (`anbot/src/`) v TypeScript, z eno novo
zmožnostjo: program si naredi kopijo uporabnikovega Chrome profila, da ostane
prijavljen v avto.net brez ročnega vpisovanja gesla.

## Razvoj

```sh
npm install
npm run dev        # zažene aplikacijo
npm run typecheck  # preveri tipe
npm run build      # zgradi v out/
npm run package    # zapakira za Windows
```

## Zgradba

```
src/
├── main/          Electron main proces — IPC, shramba, posodobitve
├── preload/       most med main in renderer procesom
├── renderer/      React vmesnik (Menu, Konfiguracija, AdList, Obnavljanje)
├── scraper/       avtomatizacija brskalnika (Puppeteer)
│   ├── browser.ts       zagon Chroma + kopija profila
│   ├── get-active-ads.ts
│   └── renew-ad/        koraki obnove enega oglasa
└── shared/        tipi, ki jih uporabljata oba procesa
```

## Kako deluje prijava

Chrome 136+ zavrne `--remote-debugging-port`, kadar se uporablja privzeta mapa
profila. Zato programa ne moremo pripeti na brskalnik, ki ga uporabnik odpira
vsak dan.

Namesto tega ob prvem zagonu naredimo kopijo profila v
`<userData>/ChromeProfile` in poganjamo Chrome na njej. Piškotek za prijavo na
avto.net je trajen (velja približno teden dni), zato kopija prinese s seboj
tudi sejo in ponovna prijava ni potrebna.

Če seja poteče, program:

1. poskusi s shranjenimi podatki za prijavo (`Konfiguracija`), ali
2. uporabnik v glavnem gumb **Osveži profil iz Chroma** naredi novo kopijo.

## Obnova oglasa

Za vsak izbran oglas:

1. prebere celoten obrazec za urejanje,
2. rahlo spremeni ceno in leto registracije ter obrazec odda,
3. izbriše stari oglas (razen v testnem načinu),
4. ustvari nov oglas z istimi podatki,
5. znova naloži fotografije.

Fotografije se shranijo v `<userData>/AdImages/<hash>` in se pri naslednji
obnovi ponovno uporabijo.
