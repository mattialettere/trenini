import type { LevelDef, Theme } from '../core/types';
import l01 from './01.json';
import l02 from './02.json';
import l03 from './03.json';
import l04 from './04.json';
import l05 from './05.json';
import l06 from './06.json';
import l07 from './07.json';
import l08 from './08.json';
import l09 from './09.json';
import l10 from './10.json';
import l11 from './11.json';
import l12 from './12.json';
import l13 from './13.json';
import l14 from './14.json';
import l15 from './15.json';
import l16 from './16.json';
import l17 from './17.json';
import l18 from './18.json';
import l19 from './19.json';
import l20 from './20.json';
import lD01 from './D01.json';
import lD02 from './D02.json';
import lD03 from './D03.json';
import lD04 from './D04.json';
import lD05 from './D05.json';
import lD06 from './D06.json';
import lD07 from './D07.json';
import lD08 from './D08.json';
import lD09 from './D09.json';
import lD10 from './D10.json';
import lD11 from './D11.json';
import lD12 from './D12.json';
import lD13 from './D13.json';
import lD14 from './D14.json';
import lD15 from './D15.json';
import lD16 from './D16.json';
import lD17 from './D17.json';
import lD18 from './D18.json';
import lD19 from './D19.json';
import lD20 from './D20.json';
import lN01 from './N01.json';
import lN02 from './N02.json';
import lN03 from './N03.json';
import lN04 from './N04.json';
import lN05 from './N05.json';
import lN06 from './N06.json';
import lN07 from './N07.json';
import lN08 from './N08.json';
import lN09 from './N09.json';
import lN10 from './N10.json';
import lN11 from './N11.json';
import lN12 from './N12.json';
import lN13 from './N13.json';
import lN14 from './N14.json';
import lN15 from './N15.json';
import lN16 from './N16.json';
import lN17 from './N17.json';
import lN18 from './N18.json';
import lN19 from './N19.json';
import lN20 from './N20.json';

const L = (list: unknown[]) => list as LevelDef[];

/** I tre mondi, ognuno con i suoi livelli in ordine di difficoltà. */
export const WORLDS: { id: Theme; levels: LevelDef[] }[] = [
  { id: 'country', levels: L([l01, l02, l03, l04, l05, l06, l07, l08, l09, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20]) },
  { id: 'snow', levels: L([lN01, lN02, lN03, lN04, lN05, lN06, lN07, lN08, lN09, lN10, lN11, lN12, lN13, lN14, lN15, lN16, lN17, lN18, lN19, lN20]) },
  { id: 'desert', levels: L([lD01, lD02, lD03, lD04, lD05, lD06, lD07, lD08, lD09, lD10, lD11, lD12, lD13, lD14, lD15, lD16, lD17, lD18, lD19, lD20]) },
];

/** Tutti i livelli in fila: prima la campagna, poi la neve, poi il deserto. */
export const LEVELS: LevelDef[] = WORLDS.flatMap((w) => w.levels);

export const worldOf = (l: LevelDef): Theme => l.theme ?? 'country';
