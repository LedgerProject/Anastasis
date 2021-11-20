// rollup.config.js
import linaria from '@linaria/rollup';
import alias from '@rollup/plugin-alias';
import commonjs from "@rollup/plugin-commonjs";
import image from '@rollup/plugin-image';
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import css from 'rollup-plugin-css-only';
import ignore from "rollup-plugin-ignore";

const makePlugins = () => [
    alias({
      entries: [
        { find: 'react', replacement: 'preact/compat' },
        { find: 'react-dom', replacement: 'preact/compat' }
      ]
    }),

    ignore(["module", "os"]),
    nodeResolve({
      browser: true,
      preferBuiltins: true,
    }),

    //terser(),
    

    replace({
      "process.env.NODE_ENV": JSON.stringify("production"),
      "__filename": "'__webextension__'",
    }),

    commonjs({
      include: [/node_modules/, /dist/],
      extensions: [".js"],
      ignoreGlobal: true,
      sourceMap: true,
    }),

    json(),
    image(),

    linaria({
      sourceMap: process.env.NODE_ENV !== 'production',
    }),
    
];


const webExtensionWalletEntryPoint = {
  input: "lib/walletEntryPoint.js",
  output: {
    file: "dist/walletEntryPoint.js",
    format: "iife",
    exports: "none",
    name: "webExtensionWalletEntry",
  },
  plugins: [
    ...makePlugins(),
    css({
      output: 'walletEntryPoint.css',
     }),
   ],
};

const webExtensionPopupEntryPoint = {
  input: "lib/popupEntryPoint.js",
  output: {
    file: "dist/popupEntryPoint.js",
    format: "iife",
    exports: "none",
    name: "webExtensionPopupEntry",
  },
  plugins: [
    ...makePlugins(),
    css({
      output: 'popupEntryPoint.css',
     }),
   ],
};

const webExtensionBackgroundPageScript = {
  input: "lib/background.js",
  output: {
    file: "dist/background.js",
    format: "iife",
    exports: "none",
    name: "webExtensionBackgroundScript",
  },
  plugins: makePlugins(),
};

const webExtensionCryptoWorker = {
  input: "lib/browserWorkerEntry.js",
  output: {
    file: "dist/browserWorkerEntry.js",
    format: "iife",
    exports: "none",
    name: "webExtensionCryptoWorker",
  },
  plugins: makePlugins(),
};

export default [
  webExtensionPopupEntryPoint,
  webExtensionWalletEntryPoint,
  webExtensionBackgroundPageScript,
  webExtensionCryptoWorker,
];
