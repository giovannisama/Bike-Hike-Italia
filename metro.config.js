// Learn more https://docs.expo.dev/guides/customizing-metro/

const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Force all `tslib` resolutions to our local shim to avoid `tslib.default` issues in Hermes release
config.resolver = config.resolver || {};
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  tslib: path.resolve(__dirname, 'src/shims/tslib.js'),
};

module.exports = config;