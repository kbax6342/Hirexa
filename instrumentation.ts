export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.OTEL_ENABLED === "true"
  ) {
    await import("./app/lib/telemetry/otel");
  }
}
