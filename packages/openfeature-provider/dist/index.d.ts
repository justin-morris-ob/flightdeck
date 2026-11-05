import type { EvaluationContext, EvaluationDetails, FlagValue, JsonValue, Provider, ResolutionDetails } from '@openfeature/server-sdk';
export interface FlightdeckProviderOptions {
    baseUrl: string;
    token: string;
    projectId: string;
    environmentId: string;
    timeoutMs?: number;
}
export type FlightdeckErrorCategory = 'authorization' | 'invalid-context' | 'rejected' | 'not-found' | 'unavailable' | 'invalid-response' | 'type-mismatch';
export declare class FlightdeckAuthorizationError extends Error {
    readonly status: number;
    constructor(status: number);
}
export declare class FlightdeckContractError extends Error {
    constructor();
}
export declare function enforceFlightdeckPolicy<T extends FlagValue>(details: EvaluationDetails<T>): EvaluationDetails<T>;
export declare class FlightdeckProvider implements Provider {
    #private;
    readonly metadata: {
        readonly name: "Flightdeck";
    };
    readonly runsOn: "server";
    constructor(options: FlightdeckProviderOptions);
    resolveBooleanEvaluation(key: string, defaultValue: boolean, context: EvaluationContext): Promise<ResolutionDetails<boolean>>;
    resolveStringEvaluation(key: string, defaultValue: string, context: EvaluationContext): Promise<ResolutionDetails<string>>;
    resolveNumberEvaluation(key: string, defaultValue: number, context: EvaluationContext): Promise<ResolutionDetails<number>>;
    resolveObjectEvaluation<T extends JsonValue>(key: string, defaultValue: T, context: EvaluationContext): Promise<ResolutionDetails<T>>;
    private evaluate;
}
