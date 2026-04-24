#!/usr/bin/env node

function resolveStealthFactory(moduleValue) {
  if (!moduleValue) return null;
  if (typeof moduleValue.default === "function") return moduleValue.default;
  if (typeof moduleValue === "function") return moduleValue;
  return null;
}

async function run() {
  const result = {
    playwrightExtraAvailable: false,
    puppeteerExtraAvailable: false,
    stealthDependencyInstalled: false,
    stealthPluginRegistered: false,
  };

  let playwrightExtraModule = null;
  let stealthPluginModule = null;

  try {
    playwrightExtraModule = await import("playwright-extra");
    result.playwrightExtraAvailable = true;
  } catch {
    // Keep result false and continue.
  }

  try {
    await import("puppeteer-extra");
    result.puppeteerExtraAvailable = true;
  } catch {
    // Keep result false and continue.
  }

  try {
    stealthPluginModule = await import("puppeteer-extra-plugin-stealth");
    result.stealthDependencyInstalled = true;
  } catch {
    // Keep result false and continue.
  }

  const chromium = playwrightExtraModule?.chromium;
  const stealthFactory = resolveStealthFactory(stealthPluginModule);

  if (chromium && typeof chromium.use === "function" && stealthFactory) {
    chromium.use(stealthFactory());
    result.stealthPluginRegistered = true;
  }

  console.info("[APPLY_STEALTH_CHECK]", result);

  if (
    !result.playwrightExtraAvailable ||
    !result.puppeteerExtraAvailable ||
    !result.stealthDependencyInstalled ||
    !result.stealthPluginRegistered
  ) {
    process.exitCode = 1;
  }
}

void run();
