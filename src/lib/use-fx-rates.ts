"use client";

import { useCallback, useEffect, useState } from "react";
import { BUNDLED_RATES, getFxRates, loadCachedRates, type FxRates } from "./currency";

export type FxStatus = "loading" | "live" | "cached" | "bundled" | "error";

export interface FxResult {
  rates: FxRates;
  status: FxStatus;
  refresh: () => Promise<void>;
}

const statusOf = (r: FxRates | null): FxStatus => {
  if (!r) return "loading";
  if (r.source === "frankfurter" || r.source === "er-api") return "live";
  if (r.source === "cache") return "cached";
  return "bundled";
};

export function useFxRates(): FxResult {
  const [rates, setRates] = useState<FxRates>(() => BUNDLED_RATES);
  const [status, setStatus] = useState<FxStatus>("loading");

  const refresh = useCallback(async () => {
    setStatus("loading");
    try {
      const r = await getFxRates(true);
      setRates(r);
      setStatus(statusOf(r));
    } catch {
      const cached = loadCachedRates();
      if (cached) {
        setRates(cached);
        setStatus("cached");
      } else {
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    getFxRates()
      .then((r) => {
        if (!mounted) return;
        setRates(r);
        setStatus(statusOf(r));
      })
      .catch(() => {
        if (!mounted) return;
        const cached = loadCachedRates();
        if (cached) {
          setRates(cached);
          setStatus("cached");
        } else {
          setStatus("error");
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  return { rates, status, refresh };
}
