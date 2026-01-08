/**
 * tslib shim for Metro/Hermes release bundles.
 *
 * Some deps import tslib as a default export (e.g. `import tslib from 'tslib'`).
 * In Hermes release bundles this can end up as `g.default` being undefined,
 * causing errors like: `Cannot read property '__extends' of undefined`.
 *
 * This shim loads the real tslib implementation from node_modules and exposes
 * it both as CommonJS exports and as a `.default` export.
 */

'use strict';

const path = require('path');

// IMPORTANT: use a direct file path so we don't recurse back into this shim.
const realTslibPath = path.resolve(__dirname, '../../node_modules/tslib/tslib.js');
// eslint-disable-next-line import/no-dynamic-require, global-require
const real = require(realTslibPath);

// Provide both named exports and a default export.
const out = Object.assign({}, real);
out.default = real;

module.exports = out;