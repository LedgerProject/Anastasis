// rollup.config.js
import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";
import builtins from "builtin-modules";
import pkg from "./package.json";

export default {
  input: "lib/index.js",
  output: {
    file: pkg.main,
    format: "cjs",
    sourcemap: true
  },
  external: builtins,
  plugins: [
    nodeResolve({
      preferBuiltins: true,
    }),

    commonjs({
      include: [/node_modules/],
      extensions: [".js", ".ts"],
      ignoreGlobal: false,
      sourceMap: false,
    }),

    json(),
  ],
}

