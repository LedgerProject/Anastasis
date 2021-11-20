/*
 This file is part of GNU Taler
 (C) 2019 Taler Systems SA

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */
import { Fragment, VNode, h } from "preact";
import { useState } from "preact/hooks";

export function ExchangeXmlTos({ doc }: { doc: Document }): VNode {
  const termsNode = doc.querySelector("[ids=terms-of-service]");
  if (!termsNode) {
    return (
      <div>
        <p>
          The exchange send us an xml but there is no node with
          'ids=terms-of-service'. This is the content:
        </p>
        <pre>{new XMLSerializer().serializeToString(doc)}</pre>
      </div>
    );
  }
  return <Fragment>{Array.from(termsNode.children).map(renderChild)}</Fragment>;
}

/**
 * Map XML elements into HTML
 * @param child
 * @returns
 */
function renderChild(child: Element): VNode {
  const children = Array.from(child.children);
  switch (child.nodeName) {
    case "title":
      return <header>{child.textContent}</header>;
    case "#text":
      return <Fragment />;
    case "paragraph":
      return <p>{child.textContent}</p>;
    case "section": {
      return (
        <AnchorWithOpenState href={`#terms-${child.getAttribute("ids")}`}>
          {children.map(renderChild)}
        </AnchorWithOpenState>
      );
    }
    case "bullet_list": {
      return <ul>{children.map(renderChild)}</ul>;
    }
    case "enumerated_list": {
      return <ol>{children.map(renderChild)}</ol>;
    }
    case "list_item": {
      return <li>{children.map(renderChild)}</li>;
    }
    case "block_quote": {
      return <div>{children.map(renderChild)}</div>;
    }
    default:
      return (
        <div style={{ color: "red", display: "hidden" }}>
          unknown tag {child.nodeName}
        </div>
      );
  }
}

/**
 * Simple anchor with a state persisted into 'data-open' prop
 * @returns
 */
function AnchorWithOpenState(
  props: h.JSX.HTMLAttributes<HTMLAnchorElement>,
): VNode {
  const [open, setOpen] = useState<boolean>(false);
  function doClick(e: h.JSX.TargetedMouseEvent<HTMLAnchorElement>): void {
    setOpen(!open);
    e.preventDefault();
  }
  return <a data-open={open ? "true" : "false"} onClick={doClick} {...props} />;
}
