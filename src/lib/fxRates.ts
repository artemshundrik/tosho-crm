import * as React from "react";
import type { MinfinFxResponse } from "@/lib/minfinFx";

// Курс, який показує шапка застосунку (AppLayout), лежить у localStorage.
// Тут — тільки читання цього кешу + разовий дозавантаж, якщо кеш порожній/протух.
// Джерело істини лишається одне: /.netlify/functions/fx-rates (Мінфін, міжбанк, продаж).

export const FX_RATES_STORAGE_KEY = "tosho_fx_rates";
export const FX_RATES_UPDATED_EVENT = "tosho:fx-rates-updated";

const FX_RATES_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export type FxCurrency = "UAH" | "USD" | "EUR";

export type FxRates = {
  usdUah: number | null;
  eurUah: number | null;
  updatedAt: string | null;
  sourceLabel: string | null;
};

const EMPTY_RATES: FxRates = { usdUah: null, eurUah: null, updatedAt: null, sourceLabel: null };

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export function readCachedFxRates(): FxRates {
  if (typeof window === "undefined") return EMPTY_RATES;
  try {
    const raw = window.localStorage.getItem(FX_RATES_STORAGE_KEY);
    if (!raw) return EMPTY_RATES;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : null;
    const cachedAt = updatedAt ? new Date(updatedAt).getTime() : NaN;
    if (Number.isNaN(cachedAt) || Date.now() - cachedAt > FX_RATES_MAX_AGE_MS) return EMPTY_RATES;
    return {
      usdUah: isPositiveNumber(parsed.usdUah) ? parsed.usdUah : null,
      eurUah: isPositiveNumber(parsed.eurUah) ? parsed.eurUah : null,
      updatedAt,
      sourceLabel: typeof parsed.sourceLabel === "string" ? parsed.sourceLabel : null,
    };
  } catch {
    return EMPTY_RATES;
  }
}

async function fetchFxRates(signal?: AbortSignal): Promise<FxRates | null> {
  for (const endpoint of ["/.netlify/functions/fx-rates", "/api/fx-rates"]) {
    try {
      const response = await fetch(endpoint, { method: "GET", cache: "no-store", signal });
      if (!response.ok) continue;
      const payload = (await response.json()) as Partial<MinfinFxResponse>;
      if (!isPositiveNumber(payload?.usd?.sell) || !isPositiveNumber(payload?.eur?.sell)) continue;
      return {
        usdUah: payload.usd.sell,
        eurUah: payload.eur.sell,
        updatedAt: typeof payload.fetchedAt === "string" ? payload.fetchedAt : new Date().toISOString(),
        sourceLabel: typeof payload.updatedAtLabel === "string" ? payload.updatedAtLabel : null,
      };
    } catch {
      // Пробуємо наступний ендпоінт; помилку показувати не треба — курс не критичний.
    }
  }
  return null;
}

/** Курс для розрахунків усередині сторінки. Не тягне мережу, якщо шапка вже оновила кеш. */
export function useFxRates(): FxRates {
  const [rates, setRates] = React.useState<FxRates>(() => readCachedFxRates());

  React.useEffect(() => {
    const sync = () => setRates(readCachedFxRates());
    window.addEventListener("storage", sync);
    window.addEventListener(FX_RATES_UPDATED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(FX_RATES_UPDATED_EVENT, sync);
    };
  }, []);

  React.useEffect(() => {
    if (rates.usdUah && rates.eurUah) return;
    const controller = new AbortController();
    void fetchFxRates(controller.signal).then((next) => {
      if (next) setRates(next);
    });
    return () => controller.abort();
  }, [rates.usdUah, rates.eurUah]);

  return rates;
}

export function fxRateFor(currency: FxCurrency, rates: FxRates): number | null {
  if (currency === "UAH") return 1;
  if (currency === "USD") return rates.usdUah;
  return rates.eurUah;
}

/**
 * Гривневий еквівалент. `explicitRate` — зафіксований курс операції (факт оплати),
 * має пріоритет над поточним. Повертає null, якщо курсу нема звідки взяти.
 */
export function convertToUah(
  amount: number,
  currency: FxCurrency,
  rates: FxRates,
  explicitRate?: number | null
): number | null {
  if (currency === "UAH") return amount;
  const rate = isPositiveNumber(explicitRate) ? explicitRate : fxRateFor(currency, rates);
  if (!isPositiveNumber(rate)) return null;
  return amount * rate;
}

const CURRENCY_SYMBOLS: Record<FxCurrency, string> = { UAH: "₴", USD: "$", EUR: "€" };

export const currencySymbol = (currency: FxCurrency) => CURRENCY_SYMBOLS[currency] ?? currency;

/** «$200» / «200 ₴» — сума в тій валюті, в якій її виставили. */
export function formatCurrencyAmount(amount: number, currency: FxCurrency): string {
  const value = new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return currency === "UAH" ? `${value} ₴` : `${currencySymbol(currency)}${value}`;
}

export const isFxCurrency = (value: unknown): value is FxCurrency =>
  value === "UAH" || value === "USD" || value === "EUR";
