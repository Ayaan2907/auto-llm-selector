/* eslint-disable no-console */
import { confirm } from '@inquirer/prompts';
import { AutoPromptRouter } from '../router.js';
import { parseTryArgs, helpText, ArgError } from './args.js';
import { resolveApiKey } from './key-store.js';
import { resolveRunConfig, resolveRepeatRun } from './wizard.js';
import { buildTelemetryHooks, renderHeader } from './renderer.js';
import { printEquivalentSnippet } from './snippet.js';

const VERSION = '0.0.0';

async function main(): Promise<number> {
  const raw = process.argv.slice(2);
  const sub = raw[0];
  const rest = raw.slice(1);

  if (sub === undefined || sub === '-h' || sub === '--help') {
    console.log(
      'Usage: als <command>\n\nCommands:\n  try    Run an interactive recommendation\n'
    );
    console.log(helpText());
    return 0;
  }
  if (sub === '-v' || sub === '--version') {
    console.log(VERSION);
    return 0;
  }
  if (sub !== 'try') {
    console.error(`Unknown command: ${sub}\n`);
    console.log(helpText());
    return 2;
  }

  let args;
  try {
    args = parseTryArgs(rest);
  } catch (e) {
    if (e instanceof ArgError) {
      console.error(`Argument error: ${e.message}\n`);
      console.log(helpText());
      return 2;
    }
    throw e;
  }
  if (args.help) {
    console.log(helpText());
    return 0;
  }
  if (args.version) {
    console.log(VERSION);
    return 0;
  }

  const useColor = args.color !== false;
  renderHeader({ color: useColor }, 'interactive try');

  const keyResult = await resolveApiKey({
    nonInteractive: args.nonInteractive ?? false,
  });

  const hooks = buildTelemetryHooks({ color: useColor });

  const firstCfg = await resolveRunConfig(args);

  const router = new AutoPromptRouter({
    OPEN_ROUTER_API_KEY: keyResult.key,
    enableLogging: false,
    telemetry: hooks,
    ...(firstCfg.strategy !== 'deterministic' && {
      selectionStrategy: firstCfg.strategy,
    }),
    ...(firstCfg.selectorModel !== undefined && {
      selectorModel: firstCfg.selectorModel,
    }),
    ...(firstCfg.multiLabel && { multiLabelClassification: true }),
    ...(firstCfg.allow.length > 0 && {
      allowedModelPatterns: firstCfg.allow,
    }),
    ...(firstCfg.deny.length > 0 && {
      excludedModelPatterns: firstCfg.deny,
    }),
  });

  await router.initialize();

  await router.getModelRecommendation(firstCfg.prompt, firstCfg.properties);
  printEquivalentSnippet({
    prompt: firstCfg.prompt,
    properties: firstCfg.properties,
    multiLabel: firstCfg.multiLabel,
    allow: firstCfg.allow,
    deny: firstCfg.deny,
    strategy: firstCfg.strategy,
    ...(firstCfg.selectorModel !== undefined && {
      selectorModel: firstCfg.selectorModel,
    }),
    color: useColor,
  });

  let lastProps = firstCfg.properties;
  while (args.repeat && !args.nonInteractive) {
    const again = await confirm({
      message: 'Try another system prompt?',
      default: false,
    });
    if (!again) break;
    const next = await resolveRepeatRun(lastProps);
    await router.getModelRecommendation(next.prompt, next.properties);
    printEquivalentSnippet({
      prompt: next.prompt,
      properties: next.properties,
      multiLabel: firstCfg.multiLabel,
      allow: firstCfg.allow,
      deny: firstCfg.deny,
      strategy: firstCfg.strategy,
      ...(firstCfg.selectorModel !== undefined && {
        selectorModel: firstCfg.selectorModel,
      }),
      color: useColor,
    });
    lastProps = next.properties;
  }

  await router.shutdown();
  return 0;
}

main()
  .then(code => process.exit(code))
  .catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
