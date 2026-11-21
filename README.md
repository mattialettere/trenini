# Trainland

Un puzzle rilassante di treni su isole sospese, giocabile nel browser (prima di tutto dal telefono).
Posi pochi binari sulla griglia, premi **Via!** e guardi i treni consegnare latte, carbone, legname e passeggeri.

Stato: **60 livelli** in tre mondi (campagna, neve, deserto), 20 per mondo, di difficoltà crescente: scambi,
ponti, gallerie, incroci, fattorie, miniere e boschi dove i treni vuoti caricano la merce, semafori e passaggi
a livello (trattore, gatto delle nevi, diligenza).

Monete e negozio: le stelle danno monete (1 stella 10, 2 stelle 20, 3 stelle 50; rigiocando si prende solo la
differenza). Tra un livello e l'altro si apre il negozio, dove si comprano bonus da usare durante la costruzione:
pezzo extra, semaforo extra, orologio (+3 al tempo per la stella) e suggerimento (posa un pezzo della soluzione).
Le monete si guadagnano solo giocando: niente acquisti con soldi veri.

## Sviluppo

```sh
npm install
npm run dev      # server locale
npm test         # test della logica di gioco (Vitest)
npm run build    # sito statico in dist/
```

Il sito viene pubblicato su GitHub Pages da `.github/workflows/pages.yml`.

## itch.io

La build è già pronta per itch.io: `vite.config.ts` usa `base: './'`, quindi tutti i percorsi sono relativi e il gioco funziona anche dentro l'iframe di itch.

- `.github/workflows/itch.yml` (manuale da Actions, o con un tag `v*`) fa test e build, salva lo zip `trainland-itch-html5` tra gli artefatti del run e, se configurato, lo carica con butler nel canale `html5`.
- Configurazione nel repo: segreto `BUTLER_API_KEY` (chiave API di itch.io) e variabile `ITCH_TARGET` (es. `utente/trainland`).
- I `.glb` vanno solo dentro lo zip HTML5 giocabile nel browser: non caricarli mai come download separati. I crediti CC BY 4.0 vanno anche nella descrizione della pagina (vedi `CREDITS.md`).

## Struttura

- `src/core/` logica di gioco pura e deterministica: griglia, pezzi, simulazione a tick, stelle. Nessuna dipendenza da Three.js.
- `src/render/` scena Three.js: isola, binari, treni, camera isometrica.
- `src/levels/` livelli in JSON, ognuno con una soluzione di riferimento da 3 stelle verificata dai test.
- `scripts/solve.ts` strumento per chi crea livelli: disegna la soluzione da `scripts/solutions.json` come farebbe
  un giocatore, la simula e con `--write` aggiorna soluzione e obiettivi del livello
- `scripts/design.ts` progettista automatico per i livelli di neve (`N..`) e deserto (`D..`): da una bozza
  (terreno, depositi, stazioni, treni) trova i percorsi, imposta gli scambi, prova i semafori e scrive soluzione,
  obiettivi e scorte
  (`npx vite-node scripts/solve.ts [id] --write`).
- `src/i18n/` testi in italiano e inglese.
- `tests/` test unitari della logica.

## Modelli 3D

I modelli low-poly sono di [Polyfork](https://polyfork.dev), file GLB sotto licenza
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). L'elenco con la riga di credito di ogni modello è in
[CREDITS.md](CREDITS.md) e nella pagina Crediti del gioco. Le curve e gli scambi sono ottenuti piegando il modello
"Straight Track". Per riscaricare i modelli: `npm run models` (legge `scripts/models.json`).

Polyfork non è affiliato a questo progetto.
