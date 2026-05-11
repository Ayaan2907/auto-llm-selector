/* eslint-env node */
import { z } from 'zod';

/**
 * Optional environment parsing for host applications.
 * This module does not read `process.env` at import time.
 */
const routerEnvSchema = z.object({
  OPEN_ROUTER_API_KEY: z.string().min(1),
  MODEL_SELECTOR_MODEL: z.string().min(1).optional(),
  NODE_ENV: z.string().optional(),
});

export type ParsedRouterEnvironment = z.infer<typeof routerEnvSchema>;

export function parseRouterEnvironment(
  env: typeof process.env = process.env
): ParsedRouterEnvironment {
  return routerEnvSchema.parse({
    OPEN_ROUTER_API_KEY: env.OPEN_ROUTER_API_KEY,
    MODEL_SELECTOR_MODEL: env.MODEL_SELECTOR_MODEL,
    NODE_ENV: env.NODE_ENV,
  });
}
