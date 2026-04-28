import { SpanStatusCode, trace, type AttributeValue } from "@opentelemetry/api";

type SafeSpanAttributes = Record<
  string,
  string | number | boolean | null | undefined
>;

const tracer = trace.getTracer(process.env.OTEL_SERVICE_NAME || "hirexa-ai");

function toSafeAttributes(attributes?: SafeSpanAttributes) {
  const result: Record<string, AttributeValue> = {};
  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (value === null || value === undefined) continue;
    result[key] = value;
  }
  return result;
}

export async function withSpan<T>(
  name: string,
  attributes: SafeSpanAttributes | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const span = tracer.startSpan(name, {
    attributes: toSafeAttributes(attributes),
  });

  try {
    const result = await fn();
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(error as Error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  } finally {
    span.end();
  }
}

export function withSpanSync<T>(
  name: string,
  attributes: SafeSpanAttributes | undefined,
  fn: () => T,
): T {
  const span = tracer.startSpan(name, {
    attributes: toSafeAttributes(attributes),
  });

  try {
    const result = fn();
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(error as Error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  } finally {
    span.end();
  }
}
