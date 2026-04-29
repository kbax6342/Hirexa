import "server-only";

import { diag, DiagLogLevel, type DiagLogger } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK, tracing } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

declare global {
  // eslint-disable-next-line no-var
  var __hirexaOtelSdk: NodeSDK | undefined;
  // eslint-disable-next-line no-var
  var __hirexaOtelShutdownRegistered: boolean | undefined;
  // eslint-disable-next-line no-var
  var __hirexaOtelGoogleTraceExportWarningLogged: boolean | undefined;
  // eslint-disable-next-line no-var
  var __hirexaOtelUsingGoogleExporter: boolean | undefined;
  // eslint-disable-next-line no-var
  var __HIREXA_OTEL_STARTED: boolean | undefined;
  // eslint-disable-next-line no-var
  var __HIREXA_OTEL_STARTING: boolean | undefined;
  // eslint-disable-next-line no-var
  var __HIREXA_OTEL_DIAG_LOGGER_INSTALLED: boolean | undefined;
}

type OTelExporterMode = "console" | "google";

function isEnabled(value: string | undefined) {
  return value === "true";
}

function getServiceName() {
  return process.env.OTEL_SERVICE_NAME || "hirexa-ai";
}

function getExporterModes(): OTelExporterMode[] {
  const raw = process.env.OTEL_EXPORTER?.trim();
  const requested = raw
    ? raw
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    : ["google"];
  const modes: OTelExporterMode[] = [];

  for (const value of requested) {
    if (value !== "console" && value !== "google") {
      console.warn("[OTEL] unsupported trace exporter ignored", {
        exporter: value,
      });
      continue;
    }
    if (!modes.includes(value)) {
      modes.push(value);
    }
  }

  return modes.length > 0 ? modes : ["google"];
}

function shouldLogTelemetrySetup() {
  return ["debug", "info"].includes(
    String(process.env.OTEL_LOG_LEVEL ?? "").toLowerCase(),
  );
}

function resolveDiagLogLevel() {
  const value = String(process.env.OTEL_LOG_LEVEL ?? "info").toLowerCase();
  if (value === "debug") return DiagLogLevel.DEBUG;
  if (value === "verbose") return DiagLogLevel.VERBOSE;
  if (value === "warn") return DiagLogLevel.WARN;
  if (value === "error") return DiagLogLevel.ERROR;
  if (value === "none" || value === "silent") return DiagLogLevel.NONE;
  return DiagLogLevel.INFO;
}

function stringifyDiagArgs(args: unknown[]) {
  return args
    .map((arg) => {
      if (arg instanceof Error) return arg.message;
      if (typeof arg === "string") return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

function installDiagLogger() {
  if (globalThis.__HIREXA_OTEL_DIAG_LOGGER_INSTALLED) return;

  const logger: DiagLogger = {
    verbose: (...args) => console.debug(...args),
    debug: (...args) => console.debug(...args),
    info: (...args) => console.info(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => {
      const message = stringifyDiagArgs(args);
      const isGoogleTraceExportFailure =
        globalThis.__hirexaOtelUsingGoogleExporter ||
        /batchWriteSpans|Google Cloud Trace|Was not able to determine GCP project ID|failed to create client/i.test(
          message,
        );

      if (isGoogleTraceExportFailure) {
        if (!globalThis.__hirexaOtelGoogleTraceExportWarningLogged) {
          globalThis.__hirexaOtelGoogleTraceExportWarningLogged = true;
          console.warn(
            "[OTEL] Google Cloud Trace export failed. Check Cloud Trace API and Cloud Trace Agent IAM role.",
          );
        }
        return;
      }

      console.warn("[OTEL] diagnostic error", { message });
    },
  };

  diag.setLogger(logger, {
    logLevel: resolveDiagLogLevel(),
    suppressOverrideMessage: true,
  });
  globalThis.__HIREXA_OTEL_DIAG_LOGGER_INSTALLED = true;
}

function hasGoogleTraceConfig() {
  return Boolean(process.env.GOOGLE_CLOUD_PROJECT) && Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

function logGoogleTraceExportFailureOnce() {
  if (globalThis.__hirexaOtelGoogleTraceExportWarningLogged) return;
  globalThis.__hirexaOtelGoogleTraceExportWarningLogged = true;
  console.warn(
    "[OTEL] Google Cloud Trace export failed. Check Cloud Trace API and Cloud Trace Agent IAM role.",
  );
}

function createSafeGoogleTraceExporter(exporter: tracing.SpanExporter): tracing.SpanExporter {
  return {
    export(spans, resultCallback) {
      exporter.export(spans, (result) => {
        if (result.code !== 0) {
          logGoogleTraceExportFailureOnce();
        }
        resultCallback(result);
      });
    },
    shutdown() {
      return exporter.shutdown();
    },
    forceFlush() {
      return exporter.forceFlush?.() ?? Promise.resolve();
    },
  };
}

function createConsoleSpanExporter(): tracing.SpanExporter {
  const exporter = new tracing.ConsoleSpanExporter();
  if (process.env.OTEL_CONSOLE_VERBOSE === "true") return exporter;

  return {
    export(spans, resultCallback) {
      const manualSpans = spans.filter((span) => span.name.startsWith("auto_apply."));
      if (manualSpans.length === 0) {
        resultCallback({ code: 0 });
        return;
      }
      exporter.export(manualSpans, resultCallback);
    },
    shutdown() {
      return exporter.shutdown();
    },
    forceFlush() {
      return exporter.forceFlush?.() ?? Promise.resolve();
    },
  };
}

async function createSpanProcessors() {
  const exporterModes = getExporterModes();
  const spanProcessors: tracing.SpanProcessor[] = [];
  const enabledExporters: OTelExporterMode[] = [];

  if (exporterModes.includes("console")) {
    spanProcessors.push(
      new tracing.SimpleSpanProcessor(createConsoleSpanExporter()),
    );
    enabledExporters.push("console");
  }

  if (exporterModes.includes("google")) {
    if (!hasGoogleTraceConfig()) {
      if (shouldLogTelemetrySetup()) {
        console.info(
          "[OTEL] Google Cloud Trace exporter skipped: Google Cloud project and credentials are required",
        );
      }
    } else {
      const { TraceExporter } = await import(
        "@google-cloud/opentelemetry-cloud-trace-exporter"
      );

      // Cloud Trace exporter needs the Cloud Trace API enabled.
      // The service account needs the Cloud Trace Agent role.
      spanProcessors.push(
        new tracing.BatchSpanProcessor(
          createSafeGoogleTraceExporter(new TraceExporter()),
        ),
      );
      enabledExporters.push("google");
    }
  }

  globalThis.__hirexaOtelUsingGoogleExporter = enabledExporters.includes("google");
  return {
    spanProcessors,
    enabledExporters,
  };
}

async function startTelemetry() {
  if (
    globalThis.__HIREXA_OTEL_STARTED ||
    globalThis.__HIREXA_OTEL_STARTING ||
    globalThis.__hirexaOtelSdk
  ) {
    return;
  }

  globalThis.__HIREXA_OTEL_STARTING = true;

  try {
    installDiagLogger();

    const traceExport = await createSpanProcessors();
    if (traceExport.spanProcessors.length === 0) {
      if (shouldLogTelemetrySetup()) {
        console.info("[OTEL] telemetry skipped: no trace exporters configured");
      }
      globalThis.__HIREXA_OTEL_STARTED = true;
      return;
    }

    const metricsEnabled = isEnabled(process.env.OTEL_METRICS_ENABLED);
    const autoInstrumentationsEnabled = isEnabled(
      process.env.OTEL_AUTO_INSTRUMENTATIONS_ENABLED,
    );

    if (!metricsEnabled) {
      process.env.OTEL_METRICS_EXPORTER = "none";
    }

    const originalOtelLogLevel = process.env.OTEL_LOG_LEVEL;
    let sdk: NodeSDK;
    try {
      delete process.env.OTEL_LOG_LEVEL;
      sdk = new NodeSDK({
        resource: resourceFromAttributes({
          [ATTR_SERVICE_NAME]: getServiceName(),
        }),
        spanProcessors: traceExport.spanProcessors,
        // Metrics exporter needs the Monitoring Metric Writer role.
        metricReaders: metricsEnabled ? undefined : [],
        logRecordProcessors: [],
        instrumentations: autoInstrumentationsEnabled
          ? [
              getNodeAutoInstrumentations({
                "@opentelemetry/instrumentation-fs": {
                  enabled: false,
                },
                "@opentelemetry/instrumentation-winston": {
                  enabled: false,
                },
              }),
            ]
          : [],
      });
    } finally {
      if (originalOtelLogLevel === undefined) {
        delete process.env.OTEL_LOG_LEVEL;
      } else {
        process.env.OTEL_LOG_LEVEL = originalOtelLogLevel;
      }
    }

    sdk.start();
    globalThis.__hirexaOtelSdk = sdk;
    globalThis.__HIREXA_OTEL_STARTED = true;

    if (shouldLogTelemetrySetup()) {
      console.info("[OTEL] telemetry initialized", {
        serviceName: getServiceName(),
        exporters: traceExport.enabledExporters,
        metricsEnabled,
        autoInstrumentationsEnabled,
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
    globalThis.__HIREXA_OTEL_STARTED = false;
    console.warn("[OTEL] telemetry initialization skipped", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    globalThis.__HIREXA_OTEL_STARTING = false;
  }
}

void startTelemetry();
