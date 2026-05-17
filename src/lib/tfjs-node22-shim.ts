import { createRequire } from 'node:module';
import * as nodeUtil from 'node:util';

const requireUtil = createRequire(import.meta.url);
const utilCjs = requireUtil('util') as typeof nodeUtil & {
  isNullOrUndefined?: (value: unknown) => boolean;
};

if (typeof utilCjs.isNullOrUndefined !== 'function') {
  utilCjs.isNullOrUndefined = (value: unknown) =>
    value === null || value === undefined;
}
