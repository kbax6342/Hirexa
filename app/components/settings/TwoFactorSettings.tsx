"use client";

import type { FormEvent } from "react";
import { useState } from "react";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

type TwoFactorSettingsProps = {
  initialEnabled: boolean;
  initialBackupCodeCount: number;
};

type SetupState = {
  qrCodeDataUrl: string;
  manualEntryKey: string;
};

type ApiResponse = {
  ok?: boolean;
  error?: string;
  qrCodeDataUrl?: string;
  manualEntryKey?: string;
  backupCodes?: string[];
};

export default function TwoFactorSettings({
  initialEnabled,
  initialBackupCodeCount,
}: TwoFactorSettingsProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [backupCodeCount, setBackupCodeCount] = useState(initialBackupCodeCount);
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [regenerateCode, setRegenerateCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  async function readApi(response: Response) {
    const data = (await response.json().catch(() => null)) as ApiResponse | null;
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error ?? "Request failed.");
    }
    return data;
  }

  async function startSetup() {
    setError(null);
    setMessage(null);
    setLoadingAction("setup");

    try {
      const response = await fetch("/api/account/2fa/setup/start", {
        method: "POST",
        credentials: "include",
      });
      const data = await readApi(response);

      if (!data.qrCodeDataUrl || !data.manualEntryKey) {
        throw new Error("Could not start two-factor setup.");
      }

      setSetup({
        qrCodeDataUrl: data.qrCodeDataUrl,
        manualEntryKey: data.manualEntryKey,
      });
      setMessage("Scan the QR code, then enter the 6-digit code from your app.");
    } catch (setupError) {
      setError(
        setupError instanceof Error
          ? setupError.message
          : "Could not start two-factor setup."
      );
    } finally {
      setLoadingAction(null);
    }
  }

  async function confirmSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoadingAction("confirm");

    try {
      const response = await fetch("/api/account/2fa/setup/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: setupCode }),
      });
      const data = await readApi(response);
      const codes = data.backupCodes ?? [];

      setEnabled(true);
      setBackupCodeCount(codes.length);
      setBackupCodes(codes);
      setSetup(null);
      setSetupCode("");
      setMessage("Two-factor authentication is enabled. Save your backup codes now.");
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : "Could not confirm two-factor setup."
      );
    } finally {
      setLoadingAction(null);
    }
  }

  async function disableTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoadingAction("disable");

    try {
      const response = await fetch("/api/account/2fa/disable", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableCode }),
      });
      await readApi(response);

      setEnabled(false);
      setBackupCodeCount(0);
      setBackupCodes([]);
      setDisableCode("");
      setMessage("Two-factor authentication is disabled.");
    } catch (disableError) {
      setError(
        disableError instanceof Error
          ? disableError.message
          : "Could not disable two-factor authentication."
      );
    } finally {
      setLoadingAction(null);
    }
  }

  async function regenerateBackupCodes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoadingAction("regenerate");

    try {
      const response = await fetch("/api/account/2fa/backup-codes/regenerate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: regenerateCode }),
      });
      const data = await readApi(response);
      const codes = data.backupCodes ?? [];

      setBackupCodes(codes);
      setBackupCodeCount(codes.length);
      setRegenerateCode("");
      setMessage("New backup codes generated. Save them now.");
    } catch (regenerateError) {
      setError(
        regenerateError instanceof Error
          ? regenerateError.message
          : "Could not regenerate backup codes."
      );
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">
            Two-factor authentication
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Use an authenticator app like Google Authenticator to add an extra
            layer of security to your Hirexa AI account.
          </p>
          <p className="mt-3 text-sm font-medium text-slate-800">
            Status:{" "}
            <span className={enabled ? "text-emerald-700" : "text-slate-600"}>
              {enabled ? "Enabled" : "Not enabled"}
            </span>
          </p>
          {enabled ? (
            <p className="mt-1 text-sm text-slate-500">
              Unused backup codes: {backupCodeCount}
            </p>
          ) : null}
        </div>

        {!enabled ? (
          <Button
            type="button"
            className="rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            disabled={loadingAction === "setup"}
            onClick={() => void startSetup()}
          >
            {loadingAction === "setup" ? "Starting..." : "Enable 2FA"}
          </Button>
        ) : null}
      </div>

      {message ? (
        <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {error}
        </div>
      ) : null}

      {setup ? (
        <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50/50 p-5">
          <div className="grid gap-5 md:grid-cols-[240px_1fr]">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={setup.qrCodeDataUrl}
                alt="Authenticator app QR code"
                className="h-auto w-full"
              />
            </div>
            <form className="space-y-4" onSubmit={confirmSetup}>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Scan this QR code with your authenticator app.
                </p>
                <p className="mt-2 break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-600">
                  {setup.manualEntryKey}
                </p>
              </div>
              <div>
                <label
                  htmlFor="two-factor-setup-code"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  6-digit code
                </label>
                <Input
                  id="two-factor-setup-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={setupCode}
                  onChange={(event) =>
                    setSetupCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="000000"
                />
              </div>
              <Button
                type="submit"
                className="bg-blue-600 text-white hover:bg-blue-700"
                disabled={loadingAction === "confirm"}
              >
                {loadingAction === "confirm" ? "Confirming..." : "Confirm setup"}
              </Button>
            </form>
          </div>
        </div>
      ) : null}

      {backupCodes.length > 0 ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h4 className="font-semibold text-amber-950">Save these backup codes</h4>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            These codes are shown once. Store them somewhere safe in case you lose
            access to your authenticator app.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {backupCodes.map((backupCode) => (
              <code
                key={backupCode}
                className="rounded-lg bg-white px-3 py-2 text-center font-mono text-sm text-slate-950"
              >
                {backupCode}
              </code>
            ))}
          </div>
        </div>
      ) : null}

      {enabled ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <form
            className="rounded-xl border border-slate-200 p-4"
            onSubmit={regenerateBackupCodes}
          >
            <h4 className="font-semibold text-slate-950">Regenerate backup codes</h4>
            <p className="mt-2 text-sm text-slate-600">
              Enter a current authenticator code to replace your backup codes.
            </p>
            <Input
              className="mt-4"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={regenerateCode}
              onChange={(event) =>
                setRegenerateCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="000000"
            />
            <Button
              type="submit"
              variant="outline"
              className="mt-4"
              disabled={loadingAction === "regenerate"}
            >
              {loadingAction === "regenerate" ? "Generating..." : "Generate new codes"}
            </Button>
          </form>

          <form
            className="rounded-xl border border-red-200 bg-red-50/50 p-4"
            onSubmit={disableTwoFactor}
          >
            <h4 className="font-semibold text-red-950">Disable 2FA</h4>
            <p className="mt-2 text-sm text-red-800">
              Enter a current authenticator code to remove two-factor protection.
            </p>
            <Input
              className="mt-4 border-red-200 bg-white"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={disableCode}
              onChange={(event) =>
                setDisableCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="000000"
            />
            <Button
              type="submit"
              variant="destructive"
              className="mt-4"
              disabled={loadingAction === "disable"}
            >
              {loadingAction === "disable" ? "Disabling..." : "Disable 2FA"}
            </Button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
