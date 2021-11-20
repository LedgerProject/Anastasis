// rollup.config.js
import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";
import builtins from "builtin-modules";
import pkg from "./package.json";
import sourcemaps from 'rollup-plugin-sourcemaps';

const nodeEntryPoint = {
  input: "lib/index.node.js",
  output: {
    file: pkg.main,
    format: "cjs",
    sourcemap: true,
  },
  external: builtins,
  plugins: [
    nodeResolve({
      preferBuiltins: true,
    }),

    sourcemaps(),

    commonjs({
      include: [/node_modules/, /dist/],
      extensions: [".js"],
      ignoreGlobal: false,
      sourceMap: true,
    }),

    json(),
  ],
}

const browserEntryPoint = {
  input: "lib/index.browser.js",
  output: {
    file: pkg.browser[pkg.main],
    format: "cjs",
    sourcemap: true,
  },
  external: builtins,
  plugins: [
    nodeResolve({
      browser: true,
      preferBuiltins: true,
    }),

    sourcemaps(),

    commonjs({
      include: [/node_modules/, /dist/],
      extensions: [".js"],
      ignoreGlobal: false,
      sourceMap: true,
    }),

    json(),
  ],
}

export default [
  nodeEntryPoint,
  browserEntryPoint
]

