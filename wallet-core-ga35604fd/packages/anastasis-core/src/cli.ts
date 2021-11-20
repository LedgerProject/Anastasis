import { clk } from "@gnu-taler/taler-util";
import {
  getBackupStartState,
  getRecoveryStartState,
  reduceAction,
} from "./index.js";
import fs from "fs";

export const reducerCli = clk
  .program("reducer", {
    help: "Command line interface for Anastasis.",
  })
  .flag("initBackup", ["-b", "--backup"])
  .flag("initRecovery", ["-r", "--restore"])
  .maybeOption("argumentsJson", ["-a", "--arguments"], clk.STRING)
  .maybeArgument("action", clk.STRING)
  .maybeArgument("stateFile", clk.STRING);

async function read(stream: NodeJS.ReadStream): Promise<string> {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

reducerCli.action(async (x) => {
  if (x.reducer.initBackup) {
    console.log(JSON.stringify(await getBackupStartState()));
    return;
  } else if (x.reducer.initRecovery) {
    console.log(JSON.stringify(await getRecoveryStartState()));
    return;
  }

  const action = x.reducer.action;
  if (!action) {
    console.log("action required");
    return;
  }

  let lastState: any;
  if (x.reducer.stateFile) {
    const s = fs.readFileSync(x.reducer.stateFile, { encoding: "utf-8" });
    lastState = JSON.parse(s);
  } else {
    const s = await read(process.stdin);
    lastState = JSON.parse(s);
  }

  let args: any;
  if (x.reducer.argumentsJson) {
    args = JSON.parse(x.reducer.argumentsJson);
  } else {
    args = {};
  }

  const nextState = await reduceAction(lastState, action, args);
  console.log(JSON.stringify(nextState));
});

export function reducerCliMain() {
  reducerCli.run();
}
