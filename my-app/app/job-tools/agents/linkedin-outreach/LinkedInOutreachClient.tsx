"use client";

import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowPathIcon,
  ChartBarIcon,
  CheckCircleIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  UserCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/solid";
import { Button } from "@/app/components/ui/button";
import { interpolateTemplate, parseCommaList } from "@/app/lib/agents/linkedinSim";

type Campaign = {
  id: string;
  targetCompanies: string[];
  targetRoles: string[];
  targetTitles: string[];
  location: string | null;
  dailyLimit: number;
  autoFollowUp: boolean;
  followUpDays: number;
  templates: Template[];
};
type Template = { id: string; name: string; body: string; isDefault: boolean };
type Lead = { id: string; name: string; company: string; title: string; connectionLevel: string; status: string };
type Analytics = { leadsTotal: number; leadsReady: number; messagesSent: number; leadsReplied: number };

const emptyAnalytics: Analytics = { leadsTotal: 0, leadsReady: 0, messagesSent: 0, leadsReplied: 0 };

export default function LinkedInOutreachClient() {
  const [connected, setConnected] = useState(false);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>(emptyAnalytics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [companies, setCompanies] = useState("");
  const [roles, setRoles] = useState("");
  const [titles, setTitles] = useState("");
  const [location, setLocation] = useState("");
  const [dailyLimit, setDailyLimit] = useState(10);
  const [autoFollowUp, setAutoFollowUp] = useState(true);
  const [followUpDays, setFollowUpDays] = useState(5);

  const [newTemplateName, setNewTemplateName] = useState("New Template");
  const [newTemplateBody, setNewTemplateBody] = useState("Hi {first_name}, I wanted to introduce myself regarding roles at {company}.");
  const [previewLead, setPreviewLead] = useState<Lead | null>(null);

  async function fetchJson(url: string, options?: RequestInit) {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  const defaultTemplate = useMemo(() => campaign?.templates.find((template) => template.isDefault) ?? null, [campaign]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [connectData, campaignData, leadsData, analyticsData] = await Promise.all([
        fetchJson("/api/agents/linkedin/connect"),
        fetchJson("/api/agents/linkedin/campaign"),
        fetchJson("/api/agents/linkedin/leads?take=50&skip=0"),
        fetchJson("/api/agents/linkedin/analytics"),
      ]);
      setConnected(connectData.connected);
      setCampaign(campaignData.campaign);
      setLeads(leadsData.leads ?? []);
      setAnalytics(analyticsData.analytics ?? emptyAnalytics);

      if (campaignData.campaign) {
        setCompanies(campaignData.campaign.targetCompanies.join(", "));
        setRoles(campaignData.campaign.targetRoles.join(", "));
        setTitles(campaignData.campaign.targetTitles.join(", "));
        setLocation(campaignData.campaign.location ?? "");
        setDailyLimit(campaignData.campaign.dailyLimit);
        setAutoFollowUp(campaignData.campaign.autoFollowUp);
        setFollowUpDays(campaignData.campaign.followUpDays);
      }
    } catch (refreshError: unknown) {
      setError(refreshError instanceof Error ? refreshError.message : "Failed to load LinkedIn Outreach Agent");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  async function saveCampaign() {
    await fetchJson("/api/agents/linkedin/campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetCompanies: parseCommaList(companies),
        targetRoles: parseCommaList(roles),
        targetTitles: parseCommaList(titles),
        location,
        dailyLimit,
        autoFollowUp,
        followUpDays,
      }),
    });
    await refreshAll();
  }

  async function sendMessage(leadId: string) {
    await fetchJson("/api/agents/linkedin/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    });
    await refreshAll();
  }

  async function discoverLeads() {
    await fetchJson("/api/agents/linkedin/leads/discover", { method: "POST" });
    await refreshAll();
  }

  function generateDraft() {
    const focusCompany = parseCommaList(companies)[0] ?? "your company";
    setNewTemplateBody(
      `Hi {first_name},\n\nI noticed you're hiring at ${focusCompany}. I bring strong experience aligned with {job_title} and would value connecting.\n\nBest,\nCandidate`
    );
  }

  if (loading) return <div className="p-6">Loading LinkedIn Outreach Agent...</div>;

  return (
    <div className="space-y-6 p-6">
      {error ? <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <section className="rounded-2xl border p-6">
        <div className="mb-4 flex items-center gap-2 text-lg font-semibold"><UserCircleIcon className="h-6 w-6" /> Connection</div>
        <p className="mb-4 text-sm">Status: {connected ? "Connected (simulated)" : "Not connected"}</p>
        <div className="flex gap-2">
          <Button onClick={async () => { await fetchJson("/api/agents/linkedin/connect", { method: "POST" }); await refreshAll(); }}>Connect LinkedIn</Button>
          <Button variant="outline" onClick={async () => { await fetchJson("/api/agents/linkedin/connect", { method: "DELETE" }); await refreshAll(); }}>Disconnect</Button>
        </div>
      </section>

      <section className="rounded-2xl border p-6">
        <h2 className="mb-4 text-lg font-semibold">Campaign Builder</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <textarea className="rounded-lg border p-2" placeholder="Target Companies (comma-separated)" value={companies} onChange={(event) => setCompanies(event.target.value)} />
          <textarea className="rounded-lg border p-2" placeholder="Target Roles (comma-separated)" value={roles} onChange={(event) => setRoles(event.target.value)} />
          <textarea className="rounded-lg border p-2" placeholder="Target Titles (comma-separated)" value={titles} onChange={(event) => setTitles(event.target.value)} />
          <input className="rounded-lg border p-2" placeholder="Location" value={location} onChange={(event) => setLocation(event.target.value)} />
          <input className="rounded-lg border p-2" type="number" min={1} value={dailyLimit} onChange={(event) => setDailyLimit(Number(event.target.value) || 1)} />
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={autoFollowUp} onChange={(event) => setAutoFollowUp(event.target.checked)} /> Auto Follow-up
            <input className="w-20 rounded-lg border p-2" type="number" min={1} value={followUpDays} onChange={(event) => setFollowUpDays(Number(event.target.value) || 1)} />
          </div>
        </div>
        <Button className="mt-4" onClick={saveCampaign}>Save Campaign</Button>
      </section>

      <section className="rounded-2xl border p-6">
        <div className="mb-4 flex items-center gap-2 text-lg font-semibold"><SparklesIcon className="h-6 w-6" /> Templates</div>
        {campaign?.templates?.length ? campaign.templates.map((template) => (
          <div key={template.id} className="mb-3 rounded-xl border p-3">
            <input className="mb-2 w-full rounded border p-2" value={template.name} onChange={(event) => setCampaign((prev) => prev ? { ...prev, templates: prev.templates.map((item) => item.id === template.id ? { ...item, name: event.target.value } : item) } : prev)} />
            <textarea className="mb-2 w-full rounded border p-2" rows={4} value={template.body} onChange={(event) => setCampaign((prev) => prev ? { ...prev, templates: prev.templates.map((item) => item.id === template.id ? { ...item, body: event.target.value } : item) } : prev)} />
            <div className="flex gap-2">
              <Button size="sm" onClick={async () => { await fetchJson("/api/agents/linkedin/templates", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(template) }); await refreshAll(); }}>{template.isDefault ? "Default" : "Save"}</Button>
              <Button size="sm" variant="outline" onClick={async () => { await fetchJson("/api/agents/linkedin/templates", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...template, isDefault: true }) }); await refreshAll(); }}>Set Default</Button>
              <Button size="sm" variant="ghost" onClick={async () => { await fetchJson("/api/agents/linkedin/templates", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: template.id }) }); await refreshAll(); }}>Delete</Button>
            </div>
          </div>
        )) : <p className="text-sm text-gray-500">No templates yet. Save a campaign to auto-create one.</p>}

        <div className="mt-4 rounded-xl border p-3">
          <input className="mb-2 w-full rounded border p-2" value={newTemplateName} onChange={(event) => setNewTemplateName(event.target.value)} />
          <textarea className="mb-2 w-full rounded border p-2" rows={4} value={newTemplateBody} onChange={(event) => setNewTemplateBody(event.target.value)} />
          <div className="flex gap-2">
            <Button onClick={async () => { await fetchJson("/api/agents/linkedin/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newTemplateName, body: newTemplateBody }) }); await refreshAll(); }}>Create Template</Button>
            <Button variant="outline" onClick={generateDraft}>Generate Draft</Button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border p-6">
        <div className="mb-4 flex items-center gap-2 text-lg font-semibold"><ArrowPathIcon className="h-6 w-6" /> Leads</div>
        <Button className="mb-4" onClick={discoverLeads}>Discover Leads</Button>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left"><th>Name</th><th>Company</th><th>Title</th><th>Connection</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-t">
                  <td>{lead.name}</td><td>{lead.company}</td><td>{lead.title}</td><td>{lead.connectionLevel}</td><td>{lead.status}</td>
                  <td className="space-x-2 py-2">
                    <Button size="sm" variant="outline" onClick={() => setPreviewLead(lead)}>Preview Message</Button>
                    <Button size="sm" onClick={() => sendMessage(lead.id)}><PaperAirplaneIcon className="mr-1 h-4 w-4" />Send</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {leads.length === 0 ? <p className="py-4 text-sm text-gray-500">No leads yet. Use Discover Leads.</p> : null}
        </div>
      </section>

      <section className="rounded-2xl border p-6">
        <div className="mb-4 flex items-center gap-2 text-lg font-semibold"><ChartBarIcon className="h-6 w-6" /> Analytics</div>
        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="Total Leads" value={analytics.leadsTotal} icon={<UserCircleIcon className="h-5 w-5" />} />
          <Stat label="Ready Leads" value={analytics.leadsReady} icon={<CheckCircleIcon className="h-5 w-5" />} />
          <Stat label="Messages Sent" value={analytics.messagesSent} icon={<PaperAirplaneIcon className="h-5 w-5" />} />
          <Stat label="Replies" value={analytics.leadsReplied} icon={<XCircleIcon className="h-5 w-5" />} />
        </div>
      </section>

      {previewLead ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6">
            <h3 className="mb-2 text-lg font-semibold">Message Preview</h3>
            <p className="whitespace-pre-wrap text-sm">
              {interpolateTemplate(
                defaultTemplate?.body ?? "Hi {first_name}, I'd love to connect about {job_title} roles at {company}.",
                { name: previewLead.name, company: previewLead.company, title: previewLead.title }
              )}
            </p>
            <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setPreviewLead(null)}>Close</Button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="mb-1 flex items-center justify-between text-gray-500"><span>{label}</span>{icon}</div>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}
