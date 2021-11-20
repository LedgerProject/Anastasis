import { reducerCliMain } from "./cli.js";

async function r() {
  try {
    // @ts-ignore
    (await import("source-map-support")).install();
  } catch (e) {
    console.warn("can't load souremaps, please install source-map-support");
    // Do nothing.
  }

  reducerCliMain();
}

r();
