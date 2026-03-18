"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { ArrowPathIcon, ExclamationTriangleIcon, TrashIcon } from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import { clearAppliedJobsSession } from "@/app/lib/appliedJobsSession";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";

type DeleteStep = "warning" | "confirm";

export default function DeleteAccountModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<DeleteStep>("warning");
  const [confirmationText, setConfirmationText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep("warning");
    setConfirmationText("");
    setLoading(false);
    setError(null);
  }

  async function deleteAccount() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmationText,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error ?? "Unable to delete your account right now.");
      }

      clearAppliedJobsSession();
      await signOut({ callbackUrl: "/" });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to delete your account right now."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        className="rounded-xl"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <TrashIcon className="h-4 w-4" />
        Delete account
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) reset();
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Delete account</DialogTitle>
            <DialogDescription>
              This permanently deletes your Hirexa profile data and related account records.
            </DialogDescription>
          </DialogHeader>

          {step === "warning" ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                <div className="flex items-center gap-2 font-semibold">
                  <ExclamationTriangleIcon className="h-4 w-4" />
                  This action is permanent
                </div>
                <ul className="mt-3 list-disc space-y-1 pl-5">
                  <li>Your profile, resumes, job applications, and related account data will be removed.</li>
                  <li>Any active Hirexa AI or HirePilot subscriptions will be cancelled before deletion completes.</li>
                  <li>You will be signed out immediately after the account is deleted.</li>
                </ul>
              </div>
            </div>
          ) : null}

          {step === "confirm" ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                Type <strong>DELETE</strong> to confirm permanent account deletion.
              </div>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-900">Confirmation</span>
                <input
                  value={confirmationText}
                  onChange={(event) => setConfirmationText(event.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  placeholder="Type DELETE"
                />
              </label>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            {step === "warning" ? (
              <>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Keep account
                </Button>
                <Button type="button" variant="destructive" onClick={() => setStep("confirm")}>
                  Continue
                </Button>
              </>
            ) : null}

            {step === "confirm" ? (
              <>
                <Button type="button" variant="outline" onClick={() => setStep("warning")}>
                  Back
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={loading || confirmationText.trim() !== "DELETE"}
                  onClick={() => void deleteAccount()}
                >
                  {loading ? (
                    <>
                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    "Delete account permanently"
                  )}
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
