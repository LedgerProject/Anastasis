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

import { h, VNode } from "preact";

interface Props {
  enabled: boolean;
  onToggle: () => void;
  label: string;
  name: string;
  description?: string;
}
export function Checkbox({
  name,
  enabled,
  onToggle,
  label,
  description,
}: Props): VNode {
  return (
    <div>
      <input
        checked={enabled}
        onClick={onToggle}
        type="checkbox"
        id={`checkbox-${name}`}
        style={{ width: "1.5em", height: "1.5em", verticalAlign: "middle" }}
      />
      <label
        htmlFor={`checkbox-${name}`}
        style={{ marginLeft: "0.5em", fontWeight: "bold" }}
      >
        {label}
      </label>
      {description && (
        <span
          style={{
            color: "#383838",
            fontSize: "smaller",
            display: "block",
            marginLeft: "2em",
          }}
        >
          {description}
        </span>
      )}
    </div>
  );
}
