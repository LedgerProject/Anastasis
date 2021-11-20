#!/usr/bin/env node

async function r() {
  try {
    (await import("source-map-support")).install();
  } catch (e) {
    console.warn("can't load souremaps");
    // Do nothing.
  }

  (await import("../dist/anastasis-cli.js")).reducerCliMain();
}

r();
