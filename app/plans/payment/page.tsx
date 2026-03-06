"use client";

import { useEffect, useMemo, useState } from "react";

type Status = {
  accountId: string;
  readyToProcessPayments: boolean;
  requirementsStatus: string | null | undefined;
  onboardingComplete: boolean;
};

export default function ConnectDashboardPage() {
  const [displayName, setDisplayName] = useState("Hirexa Seller");
  const [contactEmail, setContactEmail] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [status, setStatus] = useState<Status | null>(null);
  const [msg, setMsg] = useState<string>("");

  const canQuery = useMemo(() => accountId.startsWith("acct_"), [accountId]);

  async function refreshStatus(aid = accountId) {
    if (!aid.startsWith("acct_")) return;
    const res = await fetch(`/api/connect/accounts/status?accountId=${aid}`);
    const data = await res.json();
    if (!res.ok) {
      setMsg(data?.error ?? "Failed to fetch status");
      return;
    }
    setStatus(data);
  }

  useEffect(() => {
    if (canQuery) refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canQuery]);

  async function createAccount() {
    setMsg("");
    setStatus(null);

    const res = await fetch("/api/connect/accounts/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName, contactEmail }),
    });

    const data = await res.json();
    if (!res.ok) {
      setMsg(data?.error ?? "Failed to create account");
      return;
    }

    setAccountId(data.accountId);
    setMsg(`Created connected account: ${data.accountId}`);
  }

  async function startOnboarding() {
    setMsg("");
    const res = await fetch("/api/connect/accounts/onboard-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data?.error ?? "Failed to create onboarding link");
      return;
    }
    window.location.href = data.url;
  }

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
        Connect Onboarding (Demo)
      </h1>
      <p style={{ color: "#555", marginBottom: 20 }}>
        Create a connected account, check onboarding status, and send the user to
        Stripe to complete onboarding.
      </p>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
          1) Create Connected Account
        </h2>

        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#444" }}>Display name</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid #d1d5db",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#444" }}>
              Contact email (required)
            </span>
            <input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="seller@example.com"
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid #d1d5db",
              }}
            />
          </label>

          <button
            onClick={createAccount}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #111827",
              background: "#111827",
              color: "white",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Create connected account
          </button>
        </div>
      </section>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
          2) Onboarding Status
        </h2>

        <label style={{ display: "grid", gap: 6, marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: "#444" }}>
            Connected account ID (acct_...)
          </span>
          <input
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="acct_..."
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #d1d5db",
            }}
          />
        </label>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => refreshStatus()}
            disabled={!canQuery}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: canQuery ? "white" : "#f3f4f6",
              cursor: canQuery ? "pointer" : "not-allowed",
              fontWeight: 700,
            }}
          >
            Refresh status
          </button>

          <button
            onClick={startOnboarding}
            disabled={!canQuery}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #111827",
              background: canQuery ? "#111827" : "#9ca3af",
              color: "white",
              cursor: canQuery ? "pointer" : "not-allowed",
              fontWeight: 700,
            }}
          >
            Onboard to collect payments
          </button>
        </div>

        <div style={{ marginTop: 12, color: "#111827" }}>
          {status ? (
            <ul style={{ lineHeight: 1.8 }}>
              <li>
                <b>readyToProcessPayments:</b>{" "}
                {String(status.readyToProcessPayments)}
              </li>
              <li>
                <b>requirementsStatus:</b> {String(status.requirementsStatus)}
              </li>
              <li>
                <b>onboardingComplete:</b> {String(status.onboardingComplete)}
              </li>
            </ul>
          ) : (
            <p style={{ color: "#6b7280" }}>
              Enter an <code>acct_...</code> and click “Refresh status”.
            </p>
          )}
        </div>
      </section>

      {msg ? (
        <p style={{ color: "#065f46", fontWeight: 700 }}>{msg}</p>
      ) : null}
    </main>
  );
}
