import { password } from '@inquirer/prompts';

const ENV_KEY = 'OPEN_ROUTER_API_KEY';

export interface KeyResolution {
  key: string;
  source: 'env' | 'prompt';
}

export async function resolveApiKey(options: {
  nonInteractive: boolean;
}): Promise<KeyResolution> {
  const fromEnv = process.env[ENV_KEY]?.trim();
  if (fromEnv) return { key: fromEnv, source: 'env' };

  if (options.nonInteractive) {
    throw new Error(
      `${ENV_KEY} is not set. In --non-interactive mode the env var is required.`
    );
  }

  const key = await password({
    message: 'OpenRouter API key:',
    mask: '*',
    validate: input =>
      input.trim().length === 0 ? 'API key is required' : true,
  });
  return { key: key.trim(), source: 'prompt' };
}
