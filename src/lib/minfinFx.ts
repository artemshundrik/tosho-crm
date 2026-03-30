export const MINFIN_MB_URL = "https://minfin.com.ua/ua/currency/mb/";

export type MinfinFxRate = {
  buy: number;
  sell: number;
  sellChange: number | null;
};

export type MinfinFxResponse = {
  source: string;
  sourceUrl: string;
  updatedAtLabel: string | null;
  fetchedAt: string;
  usd: MinfinFxRate;
  eur: MinfinFxRate;
};
