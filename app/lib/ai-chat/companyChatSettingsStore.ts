import type { AiChatCompanySettings } from "@/app/types/ai-chat-settings";
import {
  DEFAULT_MINUTEMEN_CHAT_SETTINGS,
  getDefaultCompanyChatSettings,
  getSafeDefaultCompanyChatSettings,
  getSeedCompanyChatSettings,
} from "@/app/lib/ai-chat/defaultCompanyChatSettings";
import {
  normalizeCompanyChatSettings,
  normalizeCompanySlug,
} from "@/app/lib/ai-chat/validateCompanyChatSettings";

type CompanyChatSettingsStore = {
  currentSlug: string;
  bySlug: Map<string, AiChatCompanySettings>;
};

declare global {
  // This in-memory store keeps the demo lightweight today and can be swapped
  // for Prisma-backed persistence later.
  var __hirexaCompanyChatSettingsStore: CompanyChatSettingsStore | undefined;
}

function cloneSettings(settings: AiChatCompanySettings) {
  return JSON.parse(JSON.stringify(settings)) as AiChatCompanySettings;
}

function createInitialStore(): CompanyChatSettingsStore {
  const seededSettings = getSeedCompanyChatSettings().map((settings) =>
    normalizeCompanyChatSettings(settings)
  );

  return {
    currentSlug: DEFAULT_MINUTEMEN_CHAT_SETTINGS.companySlug,
    bySlug: new Map(
      seededSettings.map((settings) => [settings.companySlug, settings])
    ),
  };
}

function getStore() {
  if (!globalThis.__hirexaCompanyChatSettingsStore) {
    globalThis.__hirexaCompanyChatSettingsStore = createInitialStore();
  }

  return globalThis.__hirexaCompanyChatSettingsStore;
}

export function getCurrentCompanyChatSettings() {
  const store = getStore();
  const current = store.bySlug.get(store.currentSlug);
  return current ? cloneSettings(current) : getDefaultCompanyChatSettings();
}

export function getCompanyChatSettingsBySlug(companySlug?: string | null) {
  const normalizedSlug = normalizeCompanySlug(companySlug ?? "");
  const store = getStore();

  if (!normalizedSlug) {
    return getCurrentCompanyChatSettings();
  }

  const settings = store.bySlug.get(normalizedSlug);
  if (settings) {
    return cloneSettings(settings);
  }

  return getSafeDefaultCompanyChatSettings();
}

export function saveCompanyChatSettings(settings: AiChatCompanySettings) {
  const store = getStore();
  const now = new Date().toISOString();
  const normalized = normalizeCompanyChatSettings({
    ...settings,
    createdAt: settings.createdAt ?? now,
    updatedAt: now,
  });

  for (const [slug, existingSettings] of store.bySlug.entries()) {
    if (
      existingSettings.id === normalized.id ||
      slug === normalized.companySlug
    ) {
      store.bySlug.delete(slug);
    }
  }

  store.bySlug.set(normalized.companySlug, normalized);
  store.currentSlug = normalized.companySlug;

  return cloneSettings(normalized);
}

export function listCompanyChatSettings() {
  return [...getStore().bySlug.values()].map((settings) => cloneSettings(settings));
}
