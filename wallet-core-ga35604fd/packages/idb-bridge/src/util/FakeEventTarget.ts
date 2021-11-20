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

import { InvalidStateError } from "./errors";
import FakeEvent, { EventType } from "./FakeEvent";
import {
  EventTarget,
  Event,
  EventListenerOrEventListenerObject,
  EventListener,
} from "../idbtypes";

type EventTypeProp =
  | "onabort"
  | "onblocked"
  | "oncomplete"
  | "onerror"
  | "onsuccess"
  | "onupgradeneeded"
  | "onversionchange";

/** @public */
export interface Listener {
  callback: EventListenerOrEventListenerObject;
  capture: boolean;
  type: EventType;
}

const stopped = (event: FakeEvent, listener: Listener) => {
  return (
    event.immediatePropagationStopped ||
    (event.eventPhase === event.CAPTURING_PHASE &&
      listener.capture === false) ||
    (event.eventPhase === event.BUBBLING_PHASE && listener.capture === true)
  );
};

// http://www.w3.org/TR/dom/#concept-event-listener-invoke
const invokeEventListeners = (event: FakeEvent, obj: FakeEventTarget) => {
  event.currentTarget = obj;

  // The callback might cause obj.listeners to mutate as we traverse it.
  // Take a copy of the array so that nothing sneaks in and we don't lose
  // our place.
  for (const listener of obj.listeners.slice()) {
    if (event.type !== listener.type || stopped(event, listener)) {
      continue;
    }

    // @ts-ignore
    listener.callback.call(event.currentTarget, event);
  }

  const typeToProp: { [key in EventType]: EventTypeProp } = {
    abort: "onabort",
    blocked: "onblocked",
    complete: "oncomplete",
    error: "onerror",
    success: "onsuccess",
    upgradeneeded: "onupgradeneeded",
    versionchange: "onversionchange",
  };
  const prop = typeToProp[event.type];
  if (prop === undefined) {
    throw new Error(`Unknown event type: "${event.type}"`);
  }

  const callback = event.currentTarget[prop];
  if (callback) {
    const listener = {
      callback,
      capture: false,
      type: event.type,
    };
    if (!stopped(event, listener)) {
      // @ts-ignore
      listener.callback.call(event.currentTarget, event);
    }
  }
};

/** @public */
abstract class FakeEventTarget implements EventTarget {
  public readonly listeners: Listener[] = [];

  // These will be overridden in individual subclasses and made not readonly
  public readonly onabort: EventListener | null = null;
  public readonly onblocked: EventListener | null = null;
  public readonly oncomplete: EventListener | null = null;
  public readonly onerror: EventListener | null = null;
  public readonly onsuccess: EventListener | null = null;
  public readonly onclose: EventListener | null = null;
  public readonly onupgradeneeded: EventListener | null = null;
  public readonly onversionchange: EventListener | null = null;

  static enableTracing: boolean = false;

  public addEventListener(
    type: EventType,
    listener: EventListenerOrEventListenerObject | null,
    capture = false,
  ) {
    if (typeof listener === "function") {
      this.listeners.push({
        callback: listener,
        capture,
        type,
      });
    } else if (typeof listener === "object" && listener != null) {
      this.listeners.push({
        callback: (e: Event) => listener.handleEvent(e),
        capture,
        type,
      });
    }
  }

  public removeEventListener(
    type: EventType,
    callback: EventListenerOrEventListenerObject,
    capture = false,
  ) {
    const i = this.listeners.findIndex((listener) => {
      return (
        listener.type === type &&
        listener.callback === callback &&
        listener.capture === capture
      );
    });

    this.listeners.splice(i, 1);
  }

  // http://www.w3.org/TR/dom/#dispatching-events
  public dispatchEvent(event: Event): boolean {
    if (!(event instanceof FakeEvent)) {
      throw Error("dispatchEvent only works with FakeEvent");
    }
    const fe = event as FakeEvent;
    if (event.dispatched || !event.initialized) {
      throw new InvalidStateError("The object is in an invalid state.");
    }
    fe.isTrusted = false;

    fe.dispatched = true;
    fe.target = this;
    // NOT SURE WHEN THIS SHOULD BE SET        event.eventPath = [];

    fe.eventPhase = event.CAPTURING_PHASE;
    if (FakeEventTarget.enableTracing) {
      console.log(
        `dispatching '${event.type}' event along path with ${event.eventPath.length} elements`,
      );
    }
    for (const obj of event.eventPath) {
      if (!event.propagationStopped) {
        invokeEventListeners(event, obj);
      }
    }

    fe.eventPhase = event.AT_TARGET;
    if (!event.propagationStopped) {
      invokeEventListeners(event, fe.target);
    }

    if (event.bubbles) {
      fe.eventPath.reverse();
      fe.eventPhase = event.BUBBLING_PHASE;
      if (fe.eventPath.length === 0 && event.type === "error") {
        console.error("Unhandled error event: ", event.target);
      }
      for (const obj of event.eventPath) {
        if (!event.propagationStopped) {
          invokeEventListeners(event, obj);
        }
      }
    }

    fe.dispatched = false;
    fe.eventPhase = event.NONE;
    fe.currentTarget = null;

    if (event.canceled) {
      return false;
    }
    return true;
  }
}

export default FakeEventTarget;
