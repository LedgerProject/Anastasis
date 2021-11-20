import { TalerErrorCode } from "@gnu-taler/taler-util";
import {
  BackupStates,
  getBackupStartState,
  getRecoveryStartState,
  RecoveryStates,
  reduceAction,
  ReducerState,
} from "anastasis-core";
import { useState } from "preact/hooks";

const reducerBaseUrl = "http://localhost:5000/";
const remoteReducer = false;

interface AnastasisState {
  reducerState: ReducerState | undefined;
  currentError: any;
}

async function getBackupStartStateRemote(): Promise<ReducerState> {
  let resp: Response;

  try {
    resp = await fetch(new URL("start-backup", reducerBaseUrl).href);
  } catch (e) {
    return {
      code: TalerErrorCode.ANASTASIS_REDUCER_NETWORK_FAILED,
      message: `Network request to remote reducer ${reducerBaseUrl} failed`,
    } as any;
  }
  try {
    return await resp.json();
  } catch (e) {
    return {
      code: TalerErrorCode.ANASTASIS_REDUCER_NETWORK_FAILED,
      message: `Could not parse response from reducer`,
    } as any;
  }
}

async function getRecoveryStartStateRemote(): Promise<ReducerState> {
  let resp: Response;
  try {
    resp = await fetch(new URL("start-recovery", reducerBaseUrl).href);
  } catch (e) {
    return {
      code: TalerErrorCode.ANASTASIS_REDUCER_NETWORK_FAILED,
      message: `Network request to remote reducer ${reducerBaseUrl} failed`,
    } as any;
  }
  try {
    return await resp.json();
  } catch (e) {
    return {
      code: TalerErrorCode.ANASTASIS_REDUCER_NETWORK_FAILED,
      message: `Could not parse response from reducer`,
    } as any;
  }
}

async function reduceStateRemote(
  state: any,
  action: string,
  args: any,
): Promise<ReducerState> {
  let resp: Response;
  try {
    resp = await fetch(new URL("action", reducerBaseUrl).href, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        state,
        action,
        arguments: args,
      }),
    });
  } catch (e) {
    return {
      code: TalerErrorCode.ANASTASIS_REDUCER_NETWORK_FAILED,
      message: `Network request to remote reducer ${reducerBaseUrl} failed`,
    } as any;
  }
  try {
    return await resp.json();
  } catch (e) {
    return {
      code: TalerErrorCode.ANASTASIS_REDUCER_NETWORK_FAILED,
      message: `Could not parse response from reducer`,
    } as any;
  }
}

export interface ReducerTransactionHandle {
  transactionState: ReducerState;
  transition(action: string, args: any): Promise<ReducerState>;
}

export interface AnastasisReducerApi {
  currentReducerState: ReducerState | undefined;
  currentError: any;
  dismissError: () => void;
  startBackup: () => void;
  startRecover: () => void;
  reset: () => void;
  back: () => Promise<void>;
  transition(action: string, args: any): Promise<void>;
  /**
   * Run multiple reducer steps in a transaction without
   * affecting the UI-visible transition state in-between.
   */
  runTransaction(
    f: (h: ReducerTransactionHandle) => Promise<void>,
  ): Promise<void>;
}

function storageGet(key: string): string | null {
  if (typeof localStorage === "object") {
    return localStorage.getItem(key);
  }
  return null;
}

function storageSet(key: string, value: any): void {
  if (typeof localStorage === "object") {
    return localStorage.setItem(key, value);
  }
}

function restoreState(): any {
  let state: any;
  try {
    const s = storageGet("anastasisReducerState");
    if (s === "undefined") {
      state = undefined;
    } else if (s) {
      console.log("restoring state from", s);
      state = JSON.parse(s);
    }
  } catch (e) {
    console.log(e);
  }
  return state ?? undefined;
}

export function useAnastasisReducer(): AnastasisReducerApi {
  const [anastasisState, setAnastasisStateInternal] = useState<AnastasisState>(
    () => ({
      reducerState: restoreState(),
      currentError: undefined,
    }),
  );

  const setAnastasisState = (newState: AnastasisState) => {
    try {
      storageSet(
        "anastasisReducerState",
        JSON.stringify(newState.reducerState),
      );
    } catch (e) {
      console.log(e);
    }
    setAnastasisStateInternal(newState);
  };

  async function doTransition(action: string, args: any) {
    console.log("reducing with", action, args);
    let s: ReducerState;
    if (remoteReducer) {
      s = await reduceStateRemote(anastasisState.reducerState, action, args);
    } else {
      s = await reduceAction(anastasisState.reducerState!, action, args);
    }
    console.log("got response from reducer", s);
    if (s.code) {
      console.log("response is an error");
      setAnastasisState({ ...anastasisState, currentError: s });
    } else {
      console.log("response is a new state");
      setAnastasisState({
        ...anastasisState,
        currentError: undefined,
        reducerState: s,
      });
    }
  }

  return {
    currentReducerState: anastasisState.reducerState,
    currentError: anastasisState.currentError,
    async startBackup() {
      let s: ReducerState;
      if (remoteReducer) {
        s = await getBackupStartStateRemote();
      } else {
        s = await getBackupStartState();
      }
      if (s.code !== undefined) {
        setAnastasisState({
          ...anastasisState,
          currentError: s,
        });
      } else {
        setAnastasisState({
          ...anastasisState,
          currentError: undefined,
          reducerState: s,
        });
      }
    },
    async startRecover() {
      let s: ReducerState;
      if (remoteReducer) {
        s = await getRecoveryStartStateRemote();
      } else {
        s = await getRecoveryStartState();
      }
      if (s.code !== undefined) {
        setAnastasisState({
          ...anastasisState,
          currentError: s,
        });
      } else {
        setAnastasisState({
          ...anastasisState,
          currentError: undefined,
          reducerState: s,
        });
      }
    },
    transition(action: string, args: any) {
      return doTransition(action, args);
    },
    async back() {
      const reducerState = anastasisState.reducerState;
      if (!reducerState) {
        return;
      }
      if (
        reducerState.backup_state === BackupStates.ContinentSelecting ||
        reducerState.recovery_state === RecoveryStates.ContinentSelecting
      ) {
        setAnastasisState({
          ...anastasisState,
          currentError: undefined,
          reducerState: undefined,
        });
      } else {
        await doTransition("back", {});
      }
    },
    dismissError() {
      setAnastasisState({ ...anastasisState, currentError: undefined });
    },
    reset() {
      setAnastasisState({
        ...anastasisState,
        currentError: undefined,
        reducerState: undefined,
      });
    },
    async runTransaction(f) {
      const txHandle = new ReducerTxImpl(anastasisState.reducerState!);
      try {
        await f(txHandle);
      } catch (e) {
        console.log("exception during reducer transaction", e);
      }
      const s = txHandle.transactionState;
      console.log("transaction finished, new state", s);
      if (s.code !== undefined) {
        setAnastasisState({
          ...anastasisState,
          currentError: txHandle.transactionState,
        });
      } else {
        setAnastasisState({
          ...anastasisState,
          reducerState: txHandle.transactionState,
          currentError: undefined,
        });
      }
    },
  };
}

class ReducerTxImpl implements ReducerTransactionHandle {
  constructor(public transactionState: ReducerState) {}
  async transition(action: string, args: any): Promise<ReducerState> {
    let s: ReducerState;
    if (remoteReducer) {
      s = await reduceStateRemote(this.transactionState, action, args);
    } else {
      s = await reduceAction(this.transactionState, action, args);
    }
    console.log("making transition in transaction", action);
    this.transactionState = s;
    // Abort transaction as soon as we transition into an error state.
    if (this.transactionState.code !== undefined) {
      throw Error("transition resulted in error");
    }
    return this.transactionState;
  }
}
