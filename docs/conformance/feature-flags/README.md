# Feature flags — Stage 1

Flightdeck lets an authorized local operator publish boolean flag configuration and lets a separately scoped backend consumer evaluate it. Configuration changes must be durable, scoped, explainable and attributable.

[Requirements](requirements/stage-one.md) describe implemented local behavior. [Verification](../../stage-one-verification.md) records actual evidence and its limits.

The local identity picker is explicitly synthetic and loopback-only. It is not production sign-in or a BC identity mapping. Typed configuration, targeting rules, segments, rollouts, variants, experiment measurement, shared-environment deployment and production identity are outside Stage 1.
