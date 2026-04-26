import { expect, test } from "@playwright/test";
import { runUniversalApplyActionLoop } from "@/app/lib/apply/playwrightCrawl";

test("universal apply loop clicks bridge CTAs until a visible form appears", async ({
  page,
}) => {
  await page.setContent(`
    <main>
      <h1>Senior Software Developer</h1>
      <button id="apply-trigger">Apply</button>
      <section id="bridge-modal" hidden>
        <button id="continue-trigger">Continue to Application</button>
      </section>
      <section id="application-form" hidden>
        <form>
          <label for="first_name">First name</label>
          <input id="first_name" name="firstName" />
          <label for="email">Email</label>
          <input id="email" name="email" />
        </form>
      </section>
    </main>
    <script>
      const applyTrigger = document.getElementById("apply-trigger");
      const continueTrigger = document.getElementById("continue-trigger");
      const bridgeModal = document.getElementById("bridge-modal");
      const applicationForm = document.getElementById("application-form");

      applyTrigger.addEventListener("click", () => {
        applyTrigger.hidden = true;
        bridgeModal.hidden = false;
      });

      continueTrigger.addEventListener("click", () => {
        bridgeModal.hidden = true;
        applicationForm.hidden = false;
      });
    </script>
  `);

  const result = await runUniversalApplyActionLoop({
    page,
    context: page.context(),
    applicationId: "test-application",
    preferredTexts: ["Apply", "Continue to Application"],
    preferredSelectors: ["#apply-trigger", "#continue-trigger"],
  });

  expect(result.ctaFound).toBe(true);
  expect(result.clicks).toHaveLength(2);
  expect(result.attemptedSelectors.length).toBeGreaterThan(0);
  expect(result.signals.formDetected).toBe(true);
  expect(result.lastActionText).toContain("Continue");
  expect(result.lastActionSelector).toContain("continue-trigger");
});

test("universal apply loop records scan evidence before returning no actionable cta", async ({
  page,
}) => {
  await page.setContent(`
    <main>
      <h1>Job Details</h1>
      <button>Save job</button>
      <button>Share</button>
      <a href="/filters">Apply filters</a>
    </main>
  `);

  const result = await runUniversalApplyActionLoop({
    page,
    context: page.context(),
    applicationId: "test-no-cta",
  });

  expect("unavailable" in result && result.unavailable).toBe(true);
  expect(result.ctaFound).toBe(false);
  expect(result.clicks).toHaveLength(0);
  expect(result.attemptedSelectors.length).toBeGreaterThan(0);
  expect(result.finalReason).toContain("No actionable");
});

test("greenhouse saved apply selector is attempted before form discovery", async ({
  page,
}) => {
  await page.setContent(`
    <main>
      <h1>Staff Engineer</h1>
      <button aria-label="Apply" id="greenhouse-apply"></button>
      <form id="application_form" hidden>
        <input name="job_application[first_name]" />
        <input name="job_application[email]" />
      </form>
    </main>
    <script>
      document.getElementById("greenhouse-apply").addEventListener("click", () => {
        document.getElementById("application_form").hidden = false;
      });
    </script>
  `);

  const result = await runUniversalApplyActionLoop({
    page,
    context: page.context(),
    applicationId: "greenhouse-speechify-fixture",
    preferredSelectors: ['button[aria-label="Apply"]'],
  });

  expect(result.attemptedSelectors).toContain('button[aria-label="Apply"]');
  expect(result.ctaFound).toBe(true);
  expect(result.clicks[0]?.selector).toBe('button[aria-label="Apply"]');
  expect(result.signals.formDetected).toBe(true);
});

test("real captcha before form can stop before selector attempts with evidence", async ({
  page,
}) => {
  await page.setContent(`
    <main>
      <h1>Just a moment</h1>
      <p>Verify you are human to continue</p>
      <iframe title="reCAPTCHA challenge" src="https://www.google.com/recaptcha/api2/anchor"></iframe>
    </main>
  `);

  const result = await runUniversalApplyActionLoop({
    page,
    context: page.context(),
    applicationId: "captcha-fixture",
  });

  expect(result.attemptedSelectors).toEqual([]);
  expect(result.signals.verificationEvidence.detected).toBe(true);
  expect(result.signals.verificationEvidence.selector).toContain("recaptcha");
});
