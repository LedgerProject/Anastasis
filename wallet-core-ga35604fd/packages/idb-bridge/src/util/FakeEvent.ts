/*
 Copyright 2017 Jeremy Scheff

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 or implied. See the License for the specific language governing
 permissions and limitations under the License.
*/

import FakeEventTarget from "./FakeEventTarget";
import { Event, EventTarget } from "../idbtypes";

/** @public */
export type EventType =
  | "abort"
  | "blocked"
  | "complete"
  | "error"
  | "success"
  | "upgradeneeded"
  | "versionchange";

export class FakeEvent implements Event {
  public eventPath: FakeEventTarget[] = [];
  public type: EventType;

  public readonly NONE = 0;
  public readonly CAPTURING_PHASE = 1;
  public readonly AT_TARGET = 2;
  public readonly BUBBLING_PHASE = 3;

  // Flags
  public propagationStopped = false;
  public immediatePropagationStopped = false;
  public canceled = false;
  public initialized = true;
  public dispatched = false;

  public target: FakeEventTarget | null = null;
  public currentTarget: FakeEventTarget | null = null;

  public eventPhase: 0 | 1 | 2 | 3 = 0;

  public defaultPrevented = false;

  public isTrusted = false;
  public timeStamp = Date.now();

  public bubbles: boolean;
  public cancelable: boolean;

  constructor(
    type: EventType,
    eventInitDict: { bubbles?: boolean; cancelable?: boolean } = {},
  ) {
    this.type = type;

    this.bubbles =
      eventInitDict.bubbles !== undefined ? eventInitDict.bubbles : false;
    this.cancelable =
      eventInitDict.cancelable !== undefined ? eventInitDict.cancelable : false;
  }
  cancelBubble: boolean = false;
  composed: boolean = false;
  returnValue: boolean = false;
  get srcElement(): EventTarget | null {
    return this.target;
  }
  composedPath(): EventTarget[] {
    throw new Error("Method not implemented.");
  }
  initEvent(
    type: string,
    bubbles?: boolean | undefined,
    cancelable?: boolean | undefined,
  ): void {
    throw new Error("Method not implemented.");
  }

  public preventDefault() {
    if (this.cancelable) {
      this.canceled = true;
    }
  }

  public stopPropagation() {
    this.propagationStopped = true;
  }

  public stopImmediatePropagation() {
    this.propagationStopped = true;
    this.immediatePropagationStopped = true;
  }
}

export default FakeEvent;
