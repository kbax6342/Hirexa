import "server-only";

import { TraceExporter } from "@google-cloud/opentelemetry-cloud-trace-exporter";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

declare global {
  // eslint-disable-next-line no-var
  var __hirexaOtelSdk: NodeSDK | undefined;
  // eslint-disable-next-line no-var
  var __hirexaOtelShutdownRegistered: boolean | undefined;
}

function shouldLogTelemetrySetup() {
  return ["debug", "info"].includes(
    String(process.env.OTEL_LOG_LEVEL ?? "").toLowerCase(),
  );
}

function startTelemetry() {
  if (globalThis.__hirexaOtelSdk) return;

  try {
    const hasGoogleCloudRuntime =
      Boolean(process.env.GOOGLE_CLOUD_PROJECT) ||
      Boolean(process.env.GCLOUD_PROJECT) ||
      Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS) ||
      Boolean(process.env.K_SERVICE) ||
      Boolean(process.env.GAE_SERVICE) ||
      Boolean(process.env.GCE_METADATA_HOST);

    if (!hasGoogleCloudRuntime) {
      if (shouldLogTelemetrySetup()) {
        console.info("[OTEL] telemetry skipped: Google Cloud project/credentials not configured");
      }
      return;
    }

    const sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || "hirexa-ai",
      }),
      traceExporter: new TraceExporter(),
      instrumentations: [
        getNodeAutoInstrumentations({
          "@opentelemetry/instrumentation-fs": {
            enabled: false,
          },
          "@opentelemetry/instrumentation-winston": {
            enabled: false,
          },
        }),
      ],
    });

    sdk.start();
    globalThis.__hirexaOtelSdk = sdk;

    if (shouldLogTelemetrySetup()) {
      console.info("[OTEL] Google Cloud Trace telemetry initialized", {
        serviceName: process.env.OTEL_SERVICE_NAME || "hirexa-ai",
        projectConfigured: Boolean(process.env.GOOGLE_CLOUD_PROJECT),
        credentialsConfigured: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
      });
    }

    if (!globalThis.__hirexaOtelShutdownRegistered) {
      globalThis.__hirexaOtelShutdownRegistered = true;
      process.once("SIGTERM", () => {
        sdk
          .shutdown()
          .then(() => {
            if (shouldLogTelemetrySetup()) {
              console.info("[OTEL] telemetry shutdown complete");
            }
          })
          .catch((error: unknown) => {
            console.warn("[OTEL] telemetry shutdown failed", {
              error: error instanceof Error ? error.message : "Unknown error",
            });
          })
          .finally(() => {
            process.exit(0);
          });
      });
    }
  } catch (error) {
    globalThis.__hirexaOtelSdk = undefined;
    console.warn("[OTEL] telemetry initialization skipped", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

startTelemetry();
