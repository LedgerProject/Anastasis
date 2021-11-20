// rollup.config.js
import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";
import builtins from "builtin-modules";
import sourcemaps from "rollup-plugin-sourcemaps";

const cli = {
  input: "lib/index.node.js",
  output: {
    file: "dist/anastasis-cli.js",
    format: "es",
    sourcemap: true,
  },
  external: builtins,
  plugins: [
    nodeResolve({
      preferBuiltins: true,
    }),

    sourcemaps(),

    commonjs({
      sourceMap: true,
      transformMixedEsModules: true,
    }),

    json(),
  ],
};

const standalone = {
  input: "lib/cli-entry.js",
  output: {
    file: "dist/anastasis-cli-standalone.js",
    format: "es",
    sourcemap: true,
  },
  external: [...builtins, "source-map-support"],
  plugins: [
    nodeResolve({
      preferBuiltins: true,
    }),

    sourcemaps(),

    commonjs({
      sourceMap: true,
      transformMixedEsModules: true,
    }),

    json(),
  ],
};

export default [standalone, cli];
