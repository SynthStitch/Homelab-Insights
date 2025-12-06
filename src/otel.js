/* eslint-env node */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { Resource } from "@opentelemetry/resources";

// If this module ever executes outside Node (e.g., mis-imported on the client),
// bail out to avoid "process is undefined" errors.
if (typeof process === "undefined") {
  // eslint-disable-next-line no-console
  console.warn("OpenTelemetry SDK not started: process is undefined (likely client-side)");
} else {
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318";
  const serviceName = process.env.OTEL_SERVICE_NAME || "homelab-insights-api";

  const traceExporter = new OTLPTraceExporter({
    url: `${otlpEndpoint.replace(/\/$/, "")}/v1/traces`,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${otlpEndpoint.replace(/\/$/, "")}/v1/metrics`,
  });

  const sdk = new NodeSDK({
    resource: new Resource({
      "service.name": serviceName,
    }),
    traceExporter,
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 30000,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  const start = sdk.start?.();
  if (start && typeof start.then === "function") {
    start
      .then(() => {
        // eslint-disable-next-line no-console
        console.log("OpenTelemetry SDK started");
      })
      .catch((err) => {
        console.error("Failed to start OpenTelemetry SDK", err);
      });
  } else {
    // eslint-disable-next-line no-console
    console.warn("OpenTelemetry SDK not started: start() unavailable");
  }

  process.on("SIGTERM", () => {
    const shutdown = sdk.shutdown?.();
    if (shutdown && typeof shutdown.then === "function") {
      shutdown
        .then(() => {
          process.exit(0);
        })
        .catch((err) => {
          console.error("Error shutting down OpenTelemetry SDK", err);
          process.exit(1);
        });
    } else {
      process.exit(0);
    }
  });
}
