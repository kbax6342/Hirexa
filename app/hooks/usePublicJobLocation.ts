"use client";

import { useEffect, useState } from "react";

import {
  deriveLocationLabel,
  getStateNameFromCode,
  normalizeStateInput,
} from "@/app/lib/locationOptions";

type ReverseLocationResponse = {
  label?: string;
  city?: string;
  stateCode?: string;
  stateName?: string;
};

type CachedPublicJobLocation = {
  expiresAt: number;
  locationLabel: string;
  permissionDenied: boolean;
  resolved: boolean;
  stateCode: string;
  stateName: string;
};

type PublicJobLocationState = {
  locationLabel: string;
  loading: boolean;
  permissionDenied: boolean;
  resolved: boolean;
  stateCode: string;
  stateName: string;
};

const STORAGE_KEY = "hirexa:public-job-location:v1";
const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const DENIED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function emptyState(overrides?: Partial<PublicJobLocationState>) {
  return {
    locationLabel: "",
    loading: true,
    permissionDenied: false,
    resolved: false,
    stateCode: "",
    stateName: "",
    ...overrides,
  };
}

function readCachedLocation(): CachedPublicJobLocation | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CachedPublicJobLocation>;
    if (!parsed || typeof parsed.expiresAt !== "number") {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    if (Date.now() >= parsed.expiresAt) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return {
      expiresAt: parsed.expiresAt,
      locationLabel: typeof parsed.locationLabel === "string" ? parsed.locationLabel : "",
      permissionDenied: parsed.permissionDenied === true,
      resolved: parsed.resolved !== false,
      stateCode: typeof parsed.stateCode === "string" ? parsed.stateCode : "",
      stateName: typeof parsed.stateName === "string" ? parsed.stateName : "",
    };
  } catch {
    return null;
  }
}

function writeCachedLocation(cache: CachedPublicJobLocation) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage write failures and fall back to in-memory state.
  }
}

function resolveLocationParts(data: ReverseLocationResponse) {
  const stateCode = typeof data.stateCode === "string" ? data.stateCode.trim().toUpperCase() : "";
  const matchedState =
    (typeof data.stateName === "string" && normalizeStateInput(data.stateName)) ||
    (stateCode
      ? (() => {
          const stateName = getStateNameFromCode(stateCode);
          return stateName ? { name: stateName, code: stateCode } : null;
        })()
      : null);

  const stateName = matchedState?.name ?? "";
  const normalizedLabel =
    (typeof data.label === "string" ? data.label.trim() : "") ||
    deriveLocationLabel(
      typeof data.city === "string" ? data.city : "",
      matchedState?.code ?? stateName
    ) ||
    "";

  return {
    locationLabel: normalizedLabel,
    stateCode: matchedState?.code ?? stateCode,
    stateName,
  };
}

export function usePublicJobLocation() {
  const [state, setState] = useState<PublicJobLocationState>(emptyState());

  useEffect(() => {
    let cancelled = false;

    if (typeof window === "undefined") {
      return;
    }

    const cached = readCachedLocation();
    if (cached) {
      setState(
        emptyState({
          loading: false,
          locationLabel: cached.locationLabel,
          permissionDenied: cached.permissionDenied,
          resolved: cached.resolved,
          stateCode: cached.stateCode,
          stateName: cached.stateName,
        })
      );
      return;
    }

    async function resolveLocation() {
      if (!navigator.geolocation) {
        if (!cancelled) {
          setState(emptyState({ loading: false, resolved: true }));
        }
        return;
      }

      try {
        const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (position) => resolve(position.coords),
            (error) => reject(error),
            { enableHighAccuracy: false, timeout: 7000 }
          );
        });

        const res = await fetch(
          `/api/locations/reverse?lat=${coords.latitude}&lon=${coords.longitude}`,
          { cache: "no-store" }
        );
        const text = await res.text();
        const data = text ? (JSON.parse(text) as ReverseLocationResponse & { error?: string }) : {};

        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to resolve location");
        }

        const resolved = resolveLocationParts(data);
        writeCachedLocation({
          expiresAt: Date.now() + SUCCESS_TTL_MS,
          locationLabel: resolved.locationLabel,
          permissionDenied: false,
          resolved: true,
          stateCode: resolved.stateCode,
          stateName: resolved.stateName,
        });

        if (!cancelled) {
          setState(
            emptyState({
              loading: false,
              locationLabel: resolved.locationLabel,
              resolved: true,
              stateCode: resolved.stateCode,
              stateName: resolved.stateName,
            })
          );
        }
      } catch (error) {
        const permissionDenied =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          Number((error as { code?: number }).code) === 1;

        if (permissionDenied) {
          writeCachedLocation({
            expiresAt: Date.now() + DENIED_TTL_MS,
            locationLabel: "",
            permissionDenied: true,
            resolved: true,
            stateCode: "",
            stateName: "",
          });
        }

        if (!cancelled) {
          setState(
            emptyState({
              loading: false,
              permissionDenied,
              resolved: true,
            })
          );
        }
      }
    }

    void resolveLocation();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
