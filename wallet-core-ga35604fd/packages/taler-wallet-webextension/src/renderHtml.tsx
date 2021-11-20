/*
 This file is part of TALER
 (C) 2016 INRIA

 TALER is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 TALER is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 TALER; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

/**
 * Helpers functions to render Taler-related data structures to HTML.
 *
 * @author Florian Dold
 */

/**
 * Imports.
 */
import {
  AmountJson,
  Amounts,
  amountFractionalBase,
} from "@gnu-taler/taler-util";
import { Component, ComponentChildren, h, VNode } from "preact";

/**
 * Render amount as HTML, which non-breaking space between
 * decimal value and currency.
 */
export function renderAmount(amount: AmountJson | string): VNode {
  let a;
  if (typeof amount === "string") {
    a = Amounts.parse(amount);
  } else {
    a = amount;
  }
  if (!a) {
    return <span>(invalid amount)</span>;
  }
  const x = a.value + a.fraction / amountFractionalBase;
  return (
    <span>
      {x}&nbsp;{a.currency}
    </span>
  );
}

export const AmountView = ({
  amount,
}: {
  amount: AmountJson | string;
}): VNode => renderAmount(amount);

/**
 * Abbreviate a string to a given length, and show the full
 * string on hover as a tooltip.
 */
export function abbrev(s: string, n = 5): VNode {
  let sAbbrev = s;
  if (s.length > n) {
    sAbbrev = s.slice(0, n) + "..";
  }
  return (
    <span class="abbrev" title={s}>
      {sAbbrev}
    </span>
  );
}

interface CollapsibleState {
  collapsed: boolean;
}

interface CollapsibleProps {
  initiallyCollapsed: boolean;
  title: string;
}

/**
 * Component that shows/hides its children when clicking
 * a heading.
 */
export class Collapsible extends Component<CollapsibleProps, CollapsibleState> {
  constructor(props: CollapsibleProps) {
    super(props);
    this.state = { collapsed: props.initiallyCollapsed };
  }
  render(): VNode {
    const doOpen = (e: any): void => {
      this.setState({ collapsed: false });
      e.preventDefault();
    };
    const doClose = (e: any): void => {
      this.setState({ collapsed: true });
      e.preventDefault();
    };
    if (this.state.collapsed) {
      return (
        <h2>
          <a class="opener opener-collapsed" href="#" onClick={doOpen}>
            {" "}
            {this.props.title}
          </a>
        </h2>
      );
    }
    return (
      <div>
        <h2>
          <a class="opener opener-open" href="#" onClick={doClose}>
            {" "}
            {this.props.title}
          </a>
        </h2>
        {this.props.children}
      </div>
    );
  }
}

interface ExpanderTextProps {
  text: string;
}

/**
 * Show a heading with a toggle to show/hide the expandable content.
 */
export function ExpanderText({ text }: ExpanderTextProps): VNode {
  return <span>{text}</span>;
}

export interface LoadingButtonProps
  extends h.JSX.HTMLAttributes<HTMLButtonElement> {
  isLoading: boolean;
}

export function ProgressButton({
  isLoading,
  ...rest
}: LoadingButtonProps): VNode {
  return (
    <button class="pure-button pure-button-primary" type="button" {...rest}>
      {isLoading ? (
        <span>
          <object class="svg-icon svg-baseline" data="/img/spinner-bars.svg" />
        </span>
      ) : null}{" "}
      {rest.children}
    </button>
  );
}

export function PageLink(props: {
  pageName: string;
  children?: ComponentChildren;
}): VNode {
  // eslint-disable-next-line no-undef
  const url = chrome.extension.getURL(`/static/wallet.html#/${props.pageName}`);
  return (
    <a class="actionLink" href={url} target="_blank" rel="noopener noreferrer">
      {props.children}
    </a>
  );
}
