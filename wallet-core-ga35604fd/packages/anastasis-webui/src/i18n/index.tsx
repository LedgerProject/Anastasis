/*
 This file is part of GNU Taler
 (C) 2021 Taler Systems S.A.

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

/**
 * Translation helpers for React components and template literals.
 */

/**
 * Imports
 */
import { ComponentChild, ComponentChildren, h, Fragment, VNode } from "preact";

import { useTranslationContext } from "../context/translation";

export function useTranslator() {
  const ctx = useTranslationContext();
  const jed = ctx.handler;
  return function str(
    stringSeq: TemplateStringsArray,
    ...values: any[]
  ): string {
    const s = toI18nString(stringSeq);
    if (!s) return s;
    const tr = jed
      .translate(s)
      .ifPlural(1, s)
      .fetch(...values);
    return tr;
  };
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

interface TranslateSwitchProps {
  target: number;
  children: ComponentChildren;
}

function stringifyChildren(children: ComponentChildren): string {
  let n = 1;
  const ss = (children instanceof Array ? children : [children]).map((c) => {
    if (typeof c === "string") {
      return c;
    }
    return `%${n++}$s`;
  });
  const s = ss.join("").replace(/ +/g, " ").trim();
  return s;
}

interface TranslateProps {
  children: ComponentChildren;
  /**
   * Component that the translated element should be wrapped in.
   * Defaults to "div".
   */
  wrap?: any;

  /**
   * Props to give to the wrapped component.
   */
  wrapProps?: any;
}

function getTranslatedChildren(
  translation: string,
  children: ComponentChildren,
): ComponentChild[] {
  const tr = translation.split(/%(\d+)\$s/);
  const childArray = children instanceof Array ? children : [children];
  // Merge consecutive string children.
  const placeholderChildren = Array<ComponentChild>();
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
  const result = Array<ComponentChild>();
  for (let i = 0; i < tr.length; i++) {
    if (i % 2 == 0) {
      // Text
      result.push(tr[i]);
    } else {
      const childIdx = Number.parseInt(tr[i], 10) - 1;
      result.push(placeholderChildren[childIdx]);
    }
  }
  return result;
}

/**
 * Translate text node children of this component.
 * If a child component might produce a text node, it must be wrapped
 * in a another non-text element.
 *
 * Example:
 * ```
 * <Translate>
 * Hello.  Your score is <span><PlayerScore player={player} /></span>
 * </Translate>
 * ```
 */
export function Translate({ children }: TranslateProps): VNode {
  const s = stringifyChildren(children);
  const ctx = useTranslationContext();
  const translation: string = ctx.handler.ngettext(s, s, 1);
  const result = getTranslatedChildren(translation, children);
  return <Fragment>{result}</Fragment>;
}

/**
 * Switch translation based on singular or plural based on the target prop.
 * Should only contain TranslateSingular and TransplatePlural as children.
 *
 * Example:
 * ```
 * <TranslateSwitch target={n}>
 *  <TranslateSingular>I have {n} apple.</TranslateSingular>
 *  <TranslatePlural>I have {n} apples.</TranslatePlural>
 * </TranslateSwitch>
 * ```
 */
export function TranslateSwitch({ children, target }: TranslateSwitchProps) {
  let singular: VNode<TranslationPluralProps> | undefined;
  let plural: VNode<TranslationPluralProps> | undefined;
  // const children = this.props.children;
  if (children) {
    (children instanceof Array ? children : [children]).forEach(
      (child: any) => {
        if (child.type === TranslatePlural) {
          plural = child;
        }
        if (child.type === TranslateSingular) {
          singular = child;
        }
      },
    );
  }
  if (!singular || !plural) {
    console.error("translation not found");
    return h("span", {}, ["translation not found"]);
  }
  singular.props.target = target;
  plural.props.target = target;
  // We're looking up the translation based on the
  // singular, even if we must use the plural form.
  return singular;
}

interface TranslationPluralProps {
  children: ComponentChildren;
  target: number;
}

/**
 * See [[TranslateSwitch]].
 */
export function TranslatePlural({
  children,
  target,
}: TranslationPluralProps): VNode {
  const s = stringifyChildren(children);
  const ctx = useTranslationContext();
  const translation = ctx.handler.ngettext(s, s, 1);
  const result = getTranslatedChildren(translation, children);
  return <Fragment>{result}</Fragment>;
}

/**
 * See [[TranslateSwitch]].
 */
export function TranslateSingular({
  children,
  target,
}: TranslationPluralProps): VNode {
  const s = stringifyChildren(children);
  const ctx = useTranslationContext();
  const translation = ctx.handler.ngettext(s, s, target);
  const result = getTranslatedChildren(translation, children);
  return <Fragment>{result}</Fragment>;
}
