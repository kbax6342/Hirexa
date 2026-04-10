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

type StoredPublicJobLocation = {
  consent: "accepted" | "declined" | null;
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
const CONSENT_KEY = "hirexa.jobs.locationConsent";
const LABEL_KEY = "hirexa.jobs.locationLabel";
const STATE_CODE_KEY = "hirexa.jobs.locationStateCode";
const STATE_NAME_KEY = "hirexa.jobs.locationStateName";

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

function writeAcceptedLocation(args: {
  locationLabel: string;
  stateCode: string;
  stateName: string;
}) {
  try {
    window.localStorage.setItem(CONSENT_KEY, "accepted");
    window.localStorage.setItem(LABEL_KEY, args.locationLabel);
    window.localStorage.setItem(STATE_CODE_KEY, args.stateCode);
    window.localStorage.setItem(STATE_NAME_KEY, args.stateName);
  } catch {
    // Ignore storage write failures and fall back to in-memory state.
  }
}

function writeDeclinedLocation() {
  try {
    window.localStorage.setItem(CONSENT_KEY, "declined");
    window.localStorage.removeItem(LABEL_KEY);
    window.localStorage.removeItem(STATE_CODE_KEY);
    window.localStorage.removeItem(STATE_NAME_KEY);
  } catch {
    // Ignore storage write failures and fall back to in-memory state.
  }
}

function readSavedLocation(): StoredPublicJobLocation {
  try {
    const consentValue = window.localStorage.getItem(CONSENT_KEY);
    const consent =
      consentValue === "accepted" || consentValue === "declined"
        ? consentValue
        : null;

    if (consent === "accepted") {
      return {
        consent,
        locationLabel: window.localStorage.getItem(LABEL_KEY) ?? "",
        permissionDenied: false,
        resolved: true,
        stateCode: window.localStorage.getItem(STATE_CODE_KEY) ?? "",
        stateName: window.localStorage.getItem(STATE_NAME_KEY) ?? "",
      };
    }

    if (consent === "declined") {
      return {
        consent,
        locationLabel: "",
        permissionDenied: true,
        resolved: true,
        stateCode: "",
        stateName: "",
      };
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        consent: null,
        locationLabel: "",
        permissionDenied: false,
        resolved: true,
        stateCode: "",
        stateName: "",
      };
    }

    const parsed = JSON.parse(raw) as Partial<{
      locationLabel: string;
      permissionDenied: boolean;
      resolved: boolean;
      stateCode: string;
      stateName: string;
    }>;
    const locationLabel =
      typeof parsed.locationLabel === "string" ? parsed.locationLabel : "";
    const permissionDenied = parsed.permissionDenied === true;
    const stateCode = typeof parsed.stateCode === "string" ? parsed.stateCode : "";
    const stateName = typeof parsed.stateName === "string" ? parsed.stateName : "";

    if (permissionDenied) {
      writeDeclinedLocation();
      return {
        consent: "declined",
        locationLabel: "",
        permissionDenied: true,
        resolved: true,
        stateCode: "",
        stateName: "",
      };
    }

    if (locationLabel) {
      writeAcceptedLocation({
        locationLabel,
        stateCode,
        stateName,
      });
      return {
        consent: "accepted",
        locationLabel,
        permissionDenied: false,
        resolved: parsed.resolved !== false,
        stateCode,
        stateName,
      };
    }
  } catch {
    // Ignore malformed storage and fall back to the default public feed.
  }

  return {
    consent: null,
    locationLabel: "",
    permissionDenied: false,
    resolved: true,
    stateCode: "",
    stateName: "",
  };
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

    const saved = readSavedLocation();
    if (saved.consent !== "accepted") {
      setState(
        emptyState({
          loading: false,
          locationLabel: saved.locationLabel,
          permissionDenied: saved.permissionDenied,
          resolved: saved.resolved,
          stateCode: saved.stateCode,
          stateName: saved.stateName,
        })
      );
      return;
    }

    if (saved.locationLabel || saved.stateName || saved.stateCode) {
      setState(
        emptyState({
          loading: false,
          locationLabel: saved.locationLabel,
          permissionDenied: false,
          resolved: true,
          stateCode: saved.stateCode,
          stateName: saved.stateName,
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
        writeAcceptedLocation({
          locationLabel: resolved.locationLabel,
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
          writeDeclinedLocation();
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
