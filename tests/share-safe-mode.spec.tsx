import { expect, test } from "@playwright/test";

import {
  getSensitiveContentDisposition,
  maskShareSafeNotification,
  shouldSuppressShareSafeFloatingUi,
} from "@/app/lib/shareSafe";

declare global {
  interface Window {
    __shareSafeBridgeCalls?: Array<boolean | string>;
  }
}

test("Hide for screen share toggles the overlay and calls the desktop bridge", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__shareSafeBridgeCalls = [];
    window.hirexaDesktop = {
      setShareSafeContentProtection(enabled: boolean) {
        window.__shareSafeBridgeCalls?.push(enabled);
      },
    };
  });

  await page.goto("/");

  await page.getByTestId("share-safe-toggle").click();
  await expect(page.getByTestId("share-safe-overlay")).toBeVisible();
  await expect(page.getByTestId("share-safe-badge")).toBeVisible();

  const enabledCalls = await page.evaluate(
    () => window.__shareSafeBridgeCalls ?? []
  );
  expect(enabledCalls.at(-1)).toBe(true);

  await page.getByRole("button", { name: "Show Hirexa again" }).click();
  await expect(page.getByTestId("share-safe-overlay")).toBeHidden();

  const disabledCalls = await page.evaluate(
    () => window.__shareSafeBridgeCalls ?? []
  );
  expect(disabledCalls.at(-1)).toBe(false);
});

test("Ctrl + Shift + H toggles Share-Safe Mode even without a desktop bridge", async ({
  page,
}) => {
  await page.goto("/");

  await page.keyboard.press("Control+Shift+H");
  await expect(page.getByTestId("share-safe-overlay")).toBeVisible();

  await page.keyboard.press("Control+Shift+H");
  await expect(page.getByTestId("share-safe-overlay")).toBeHidden();
});

test("SensitiveContent resolves replacement and blur modes while Share-Safe Mode is enabled", () => {
  expect(getSensitiveContentDisposition(true, "replace")).toBe("replace");
  expect(getSensitiveContentDisposition(true, "blur")).toBe("blur");
  expect(getSensitiveContentDisposition(false, "replace")).toBe("children");
});

test("notification previews are masked while Share-Safe Mode is on", () => {
  const masked = maskShareSafeNotification(true, {
    title: "Resume ready",
    description: "Your revised resume for Acme is ready.",
  });

  expect(masked.title).toBe("Hirexa notification hidden");
  expect(masked.description).toBe(
    "Sensitive Hirexa content is hidden while Share-Safe Mode is on."
  );
});

test("floating overlays are suppressed while Share-Safe Mode is on", () => {
  expect(shouldSuppressShareSafeFloatingUi(true)).toBe(true);
  expect(shouldSuppressShareSafeFloatingUi(false)).toBe(false);
});

test("Share-Safe Mode works even when the desktop bridge is unavailable", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByTestId("share-safe-toggle").click();
  await expect(page.getByTestId("share-safe-overlay")).toBeVisible();
});
