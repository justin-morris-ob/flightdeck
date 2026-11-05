# Feature flags — implemented local behavior

Flightdeck lets an authorized local operator publish typed environment configuration, ordered targeting, pinned reusable segments and scoped overrides. Separately authorized backend consumers evaluate within explicit project/environment/tenant grants. Scalar/string-list predicates and the server OpenFeature provider use the same evaluator. Decisions must be durable, scoped, explainable and attributable.

[Stage 2 requirements](requirements/stage-two.md) define current evaluation and authoring behavior. [Stage 1 requirements](requirements/stage-one.md) retain the original lifecycle/security baseline; Stage 2 explicitly replaces boolean-only evaluation and GET contracts. Evidence: [Stage 1](../../stage-one-verification.md), [Stage 2](../../stage-two-verification.md).

The management identity picker and consumer lab personas are synthetic and loopback-only. Backend-asserted traits and credential tenant grants are not production sign-in or independently verified BC membership. The separate BC adapter supplies its own authenticated UUID/membership context; it does not create a directory connection in Flightdeck. Experiment measurement, shared-environment deployment and production identity remain outside the implemented scope.
