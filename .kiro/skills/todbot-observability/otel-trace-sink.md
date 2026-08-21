# Making OTel traces queryable in a dev branch deployment

**Status: proposed, not deployed.** `traces.sh` speaks to both options below; neither is wired until
someone lands the manifest. Until then `probe.sh` reports `traces: dark` and recon works from logs.

## The problem

The platform *pushes* OTLP out. A todbot needs to *pull* a specific trace back — by id, or by
searching for the error it just provoked. Push-only telemetry is invisible to the agent that caused
it, which is exactly backwards for debugging: the one process that knows the trace id can't read the
trace.

## Option A — file sink (recommended for dev)

An OTel Collector alongside the branch deployment, receiving OTLP and writing JSON lines to a volume.
The agent `kubectl exec`s in and greps by trace id.

No query service, no storage backend, no new API to secure, and it survives a pod restart if the
volume does. `grep` on a JSONL file is a perfectly good index when the corpus is one dev branch's
last few hours.

```yaml
# deploy/dev/otel-trace-sink.yaml   (sketch — namespace and labels to match your chart)
apiVersion: v1
kind: ConfigMap
metadata: { name: otel-trace-sink-config, namespace: tool-platform }
data:
  config.yaml: |
    receivers:
      otlp:
        protocols:
          grpc: { endpoint: 0.0.0.0:4317 }
          http: { endpoint: 0.0.0.0:4318 }
    processors:
      batch: { timeout: 2s }
    exporters:
      file:
        path: /data/traces.jsonl
        rotation: { max_megabytes: 64, max_backups: 2 }
    service:
      pipelines:
        traces: { receivers: [otlp], processors: [batch], exporters: [file] }
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: otel-trace-sink, namespace: tool-platform }
spec:
  replicas: 1
  selector: { matchLabels: { app: otel-trace-sink } }
  template:
    metadata: { labels: { app: otel-trace-sink } }
    spec:
      containers:
        - name: collector
          image: otel/opentelemetry-collector-contrib:latest   # pin a digest in real life
          args: ["--config=/etc/otel/config.yaml"]
          ports: [{ containerPort: 4317 }, { containerPort: 4318 }]
          volumeMounts:
            - { name: config, mountPath: /etc/otel }
            - { name: data,   mountPath: /data }
          resources:
            requests: { cpu: 50m, memory: 128Mi }
            limits:   { cpu: 500m, memory: 512Mi }
      volumes:
        - { name: config, configMap: { name: otel-trace-sink-config } }
        - { name: data,   emptyDir: { sizeLimit: 1Gi } }
---
apiVersion: v1
kind: Service
metadata: { name: otel-trace-sink, namespace: tool-platform }
spec:
  selector: { app: otel-trace-sink }
  ports:
    - { name: otlp-grpc, port: 4317, targetPort: 4317 }
    - { name: otlp-http, port: 4318, targetPort: 4318 }
```

Point the branch deployment at it:

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-trace-sink.tool-platform.svc.cluster.local:4317
OTEL_TRACES_SAMPLER=always_on          # dev only — you want the trace you just caused
```

Then, per machine:

```bash
# .kiro/todbots.config.local.sh
TODBOT_TRACE_SINK_POD=$(kubectl get pod -n tool-platform -l app=otel-trace-sink \
  -o jsonpath='{.items[0].metadata.name}')
TODBOT_TRACE_SINK_FILE=/data/traces.jsonl
```

**Sampling matters more than storage here.** A todbot provokes one request and needs *that* trace;
head sampling at 1% means the evidence it just created is gone. `always_on` in dev, and if the volume
of traffic makes that untenable, a tail sampler keeping errors plus anything carrying a debug header
the bot can set.

**Deliberate limits:** one branch's traces, retained until the volume rotates, no UI, no cross-service
correlation beyond what's in the spans. That is the right size for the job — this exists so an agent
can answer "where did my request stop", not to replace whatever runs in production.

## Option B — an existing Tempo/Jaeger

If one is already reachable from dev, skip all of the above:

```bash
TODBOT_TRACE_SINK_URL=http://tempo.observability.svc.cluster.local:3200
```

`traces.sh` will use `/api/traces/<id>` and `/api/search`. Adjust the paths in `traces.sh` if the
backend's API differs — both endpoints are one line each.

## What recon does with it

The point of a trace is the **transition**: which span is the last one that succeeded, and what the
next one did. That is a much sharper instrument than a log line, because it carries the parent chain
and the attributes without anyone having decided in advance to log them.

```bash
S=.kiro/skills/todbot-observability
$S/logs.sh --since 5m --grep 'trace_id|ERROR'        # find the id
$S/traces.sh --trace-id 4bf92f3577b34da6a3ce929d0e0e4736
$S/traces.sh --search 'tool.resolve' --limit 5       # or search by span name
```

If the origin can be named from a trace instead of from a log line recon had to add, say so in the
repro guide — that is one fewer instrument in the ledger and one fewer thing to clean up.

## Metrics

Not this file's problem, and mostly not the todbots' problem either. `metrics.sh` scrapes the pod's
own `/metrics` endpoint through `kubectl exec` — the same endpoint Grafana scrapes — which is enough
for the resource-class bugs (leak, CPU, pool exhaustion) where a metric is genuinely the right
evidence. For everything else, a metric tells you *that* something is wrong; you already knew that.
