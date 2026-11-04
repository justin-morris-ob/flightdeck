import { z } from 'zod';

import { apiErrorSchema } from '../shared/contracts.ts';

export type Request = (path: string, init?: RequestInit) => Promise<unknown>;

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const browserRequest: Request = async (path, init) => {
  const response = await fetch(path, { ...init, credentials: 'include' });
  if (response.status === 204) return undefined;
  const data: unknown = await response.json();
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(data);
    throw new ApiError(response.status, error.success ? error.data.error : 'The request failed.');
  }
  return data;
};

export async function get<T>(request: Request, path: string, schema: z.ZodType<T>): Promise<T> {
  return schema.parse(await request(path, { credentials: 'include' }));
}

export async function send<T>(
  request: Request,
  path: string,
  method: string,
  body: unknown,
  schema: z.ZodType<T>
): Promise<T> {
  return schema.parse(
    await request(path, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

export function errorMessage(error: unknown): string {
  if (
    (error instanceof ApiError && error.status === 409) ||
    (error instanceof Error && /409|revision conflict/i.test(error.message))
  ) {
    return `Revision conflict. Another operator changed this configuration. Reload the latest revision before trying again. ${error.message}`;
  }
  if (error instanceof z.ZodError)
    return 'The service returned an invalid response or the form contains invalid values. Reload and try again.';
  return error instanceof Error ? error.message : 'The request could not be completed.';
}

export function dateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
