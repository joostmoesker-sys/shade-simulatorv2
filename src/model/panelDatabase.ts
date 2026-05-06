import type { AddPanelTypeInput } from '../store/projectStore';

export interface PanelDatabaseEntry extends AddPanelTypeInput {
  label: string;
}

export const PANEL_DATABASE: PanelDatabaseEntry[] = [
  {
    label: 'Generiek 400 Wp mono',
    manufacturer: 'Generiek',
    model: '400 Wp mono',
    pmaxW: 400,
    vmpV: 34,
    impA: 11.8,
    vocV: 41,
    iscA: 12.6,
    tempCoeffPmaxPctPerC: -0.35,
    tempCoeffVocPctPerC: -0.28,
    cells: 108,
    bypassDiodes: 3,
    widthM: 1.13,
    heightM: 1.72,
  },
  {
    label: 'Generiek 430 Wp full black',
    manufacturer: 'Generiek',
    model: '430 Wp full black',
    pmaxW: 430,
    vmpV: 32.4,
    impA: 13.27,
    vocV: 38.7,
    iscA: 14.0,
    tempCoeffPmaxPctPerC: -0.29,
    tempCoeffVocPctPerC: -0.25,
    cells: 108,
    bypassDiodes: 3,
    widthM: 1.134,
    heightM: 1.762,
  },
  {
    label: 'Generiek 540 Wp groot formaat',
    manufacturer: 'Generiek',
    model: '540 Wp groot formaat',
    pmaxW: 540,
    vmpV: 41.6,
    impA: 13.0,
    vocV: 49.5,
    iscA: 13.9,
    tempCoeffPmaxPctPerC: -0.34,
    tempCoeffVocPctPerC: -0.27,
    cells: 144,
    bypassDiodes: 3,
    widthM: 1.134,
    heightM: 2.278,
  },
];
