// @ts-ignore: no type decl for this library
import * as jedLib from "jed";
import { Logger } from "./logging.js";

const logger = new Logger("i18n/index.ts");

export let jed: any = undefined;

/**
 * Set up jed library for internationalization,
 * based on browser language settings.
 */
export function setupI18n(lang: string, strings: { [s: string]: any }): any {
  lang = lang.replace("_", "-");

  if (!strings[lang]) {
    lang = "en-US";
    logger.warn(`language ${lang} not found, defaulting to english`);
  }
  jed = new jedLib.Jed(strings[lang]);
}

/**
 * Use different translations for testing.  Should not be used outside
 * of test cases.
 */
export function internalSetStrings(langStrings: any): void {
  jed = new jedLib.Jed(langStrings);
}

/**
 * Convert template strings to a msgid
 */
function toI18nString(stringSeq: ReadonlyArray<string>): string {
  let s = "";
  for (let i = 0; i < stringSeq.length; i++) {
    s += stringSeq[i];
    if (i < stringSeq.length - 1) {
      s += `%${i + 1}$s`;
    }
  }
  return s;
}

/**
 * Internationalize a string template with arbitrary serialized values.
 */
export function singular(stringSeq: TemplateStringsArray, ...values: any[]): string {
  const s = toI18nString(stringSeq);
  const tr = jed
    .translate(s)
    .ifPlural(1, s)
    .fetch(...values);
  return tr;
}

/**
 * Internationalize a string template without serializing
 */
export function translate(
  stringSeq: TemplateStringsArray,
  ...values: any[]
): any[] {
  const s = toI18nString(stringSeq);
  if (!s) return [];
  const translation: string = jed.ngettext(s, s, 1);
  return replacePlaceholderWithValues(translation, values);
}

/**
 * Internationalize a string template without serializing
 */
export function Translate({ children, ...rest }: { children: any }): any {
  const c = [].concat(children);
  const s = stringifyArray(c);
  if (!s) return [];
  const translation: string = jed.ngettext(s, s, 1);
  return replacePlaceholderWithValues(translation, c);
}

/**
 * Get an internationalized string (based on the globally set, current language)
 * from a JSON object.  Fall back to the default language of the JSON object
 * if no match exists.
 */
export function getJsonI18n<K extends string>(
  obj: Record<K, string>,
  key: K,
): string {
  return obj[key];
}

export function getTranslatedArray(array: Array<any>) {
  const s = stringifyArray(array);
  const translation: string = jed.ngettext(s, s, 1);
  return replacePlaceholderWithValues(translation, array);
}

function replacePlaceholderWithValues(
  translation: string,
  childArray: Array<any>,
): Array<any> {
  const tr = translation.split(/%(\d+)\$s/);
  // const childArray = toChildArray(children);
  // Merge consecutive string children.
  const placeholderChildren = [];
  for (let i = 0; i < childArray.length; i++) {
    const x = childArray[i];
    if (x === undefined) {
      continue;
    } else if (typeof x === "string") {
      continue;
    } else {
      placeholderChildren.push(x);
    }
  }
  const result = [];
  for (let i = 0; i < tr.length; i++) {
    if (i % 2 == 0) {
      // Text
      result.push(tr[i]);
    } else {
      const childIdx = Number.parseInt(tr[i]) - 1;
      result.push(placeholderChildren[childIdx]);
    }
  }
  return result;
}

function stringifyArray(children: Array<any>): string {
  let n = 1;
  const ss = children.map((c) => {
    if (typeof c === "string") {
      return c;
    }
    return `%${n++}$s`;
  });
  const s = ss.join("").replace(/ +/g, " ").trim();
  return s;
}

export const i18n = {
  str: singular,
  singular,
  Translate,
  translate,
};

