import { z } from 'zod';
import { Logger } from '../utils/logger.js';

const logger = new Logger('Config:Env');

// Schema for environment variables
const envSchema = z.object({
  OPEN_ROUTER_API_KEY: z.string(),
  MODEL_SELECTOR_MODEL: z.string().default('openai/gpt-oss-20b:free'),
  NODE_ENV: z.string().default('development'),
  SUPABASE_ANALYTICS_ENDPOINT: z.string(),
});

// Function to validate environment variables
const validateEnv = () => {
  try {
    logger.info('Validating environment variables');
    const env = {
      OPEN_ROUTER_API_KEY: process.env.OPEN_ROUTER_API_KEY,
      MODEL_SELECTOR_MODEL: process.env.MODEL_SELECTOR_MODEL,
      NODE_ENV: process.env.NODE_ENV,
      SUPABASE_ANALYTICS_ENDPOINT: process.env.SUPABASE_ANALYTICS_ENDPOINT,
    };
    const parsed = envSchema.parse(env);
    logger.info('Environment variables validated successfully');
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.issues.map(err => err.path.join('.'));
      logger.error('Invalid environment variables', { error: { missingVars } });
      throw new Error(
        `❌ Invalid environment variables: ${missingVars.join(
          ', '
        )}. Please check your .env file`
      );
    }
    throw error;
  }
};

export const env = validateEnv();
