# Feature flags — implemented local behavior

Flightdeck lets an authorized local operator publish typed environment configuration, ordered targeting, pinned reusable segments and scoped overrides. Separately authorized backend consumers evaluate within explicit project/environment/tenant grants. Decisions must be durable, scoped, explainable and attributable.

[Stage 2 requirements](requirements/stage-two.md) define current evaluation and authoring behavior. [Stage 1 requirements](requirements/stage-one.md) retain the original lifecycle/security baseline; Stage 2 explicitly replaces boolean-only evaluation and GET contracts. Evidence: [Stage 1](../../stage-one-verification.md), [Stage 2](../../stage-two-verification.md).

The identity picker is synthetic and loopback-only. Backend-asserted traits and credential tenant grants are not verified BC membership or production sign-in. Experiment measurement, shared-environment deployment and production identity remain outside the implemented scope.
