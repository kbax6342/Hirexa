"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

type PasswordChangeFormProps = {
  hasPassword: boolean;
  email?: string | null;
};

const PASSWORD_RULES = [
  "At least 10 characters",
  "At least 1 uppercase letter",
  "At least 1 lowercase letter",
  "At least 1 number",
];

export default function PasswordChangeForm({
  hasPassword,
  email,
}: PasswordChangeFormProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const resetMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasPassword) return;

    resetMessages();

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Please fill out all fields.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/settings/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      let payload: { ok?: boolean; error?: string } | null = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok || !payload?.ok) {
        setError(payload?.error || "Unable to change your password.");
        return;
      }

      setSuccess("Your password has been updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to change your password."
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!hasPassword) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900">
          Password changes unavailable
        </h3>
        <p className="mt-2 text-sm text-gray-600">
          {email ? (
            <>
              The account <span className="font-medium">{email}</span> does not
              currently have a password set.
            </>
          ) : (
            "This account does not currently have a password set."
          )}{" "}
          If you signed in with Google, continue using Google sign-in. To set a
          password, use the password reset flow.
        </p>
        <div className="mt-4">
          <Link href="/login" className="text-sm font-semibold text-blue-700">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="currentPassword" className="text-sm text-gray-900">
          Current password
        </label>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          className="mt-2 bg-white text-gray-900 placeholder:text-gray-400"
          placeholder="Enter current password"
        />
      </div>

      <div>
        <label htmlFor="newPassword" className="text-sm text-gray-900">
          New password
        </label>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          className="mt-2 bg-white text-gray-900 placeholder:text-gray-400"
          placeholder="Create a new password"
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="text-sm text-gray-900">
          Confirm new password
        </label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="mt-2 bg-white text-gray-900 placeholder:text-gray-400"
          placeholder="Re-enter new password"
        />
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        <p className="font-semibold text-gray-900">Password requirements</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {PASSWORD_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <Link
          href="/settings"
          className="text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          Back to settings
        </Link>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Updating..." : "Update password"}
        </Button>
      </div>
    </form>
  );
}
