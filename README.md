# Trainland

Un puzzle rilassante di treni su isole sospese, giocabile nel browser (prima di tutto dal telefono).
Posi pochi binari sulla griglia, premi **Via!** e guardi i treni consegnare latte, carbone, legname e passeggeri.

Stato: **prototipo con 3 livelli tutorial**.

## Sviluppo

```sh
npm install
npm run dev      # server locale
npm test         # test della logica di gioco (Vitest)
npm run build    # sito statico in dist/
```

Il sito viene pubblicato su GitHub Pages da `.github/workflows/pages.yml`.

## Struttura

- `src/core/` logica di gioco pura e deterministica: griglia, pezzi, simulazione a tick, stelle. Nessuna dipendenza da Three.js.
- `src/render/` scena Three.js: isola, binari, treni, camera isometrica.
- `src/levels/` livelli in JSON, ognuno con una soluzione di riferimento da 3 stelle verificata dai test.
- `src/i18n/` testi in italiano e inglese.
- `tests/` test unitari della logica.

## Modelli 3D

I modelli low-poly sono di [Polyfork](https://polyfork.dev), file GLB sotto licenza
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). L'elenco con la riga di credito di ogni modello è in
[CREDITS.md](CREDITS.md) e nella pagina Crediti del gioco. Le curve e gli scambi sono ottenuti piegando il modello
"Straight Track". Per riscaricare i modelli: `npm run models` (legge `scripts/models.json`).

Polyfork non è affiliato a questo progetto.
