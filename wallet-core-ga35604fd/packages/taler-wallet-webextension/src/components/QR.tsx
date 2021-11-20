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

import { h, VNode } from "preact";
import { useEffect, useRef } from "preact/hooks";
import qrcode from "qrcode-generator";

export function QR({ text }: { text: string }): VNode {
  const divRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!divRef.current) return;
    const qr = qrcode(0, "L");
    qr.addData(text);
    qr.make();
    divRef.current.innerHTML = qr.createSvgTag({
      scalable: true,
    });
  });

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div
        style={{ width: "50%", minWidth: 200, maxWidth: 300 }}
        ref={divRef}
      />
    </div>
  );
}
