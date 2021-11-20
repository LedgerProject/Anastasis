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

import { Outlined, StyledCheckboxLabel } from "./styled/index";
import { h, VNode } from "preact";

interface Props {
  enabled: boolean;
  onToggle: () => void;
  label: string;
  name: string;
}

const Tick = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
    style={{ backgroundColor: "green" }}
  >
    <path
      fill="none"
      stroke="white"
      stroke-width="3"
      d="M1.73 12.91l6.37 6.37L22.79 4.59"
    />
  </svg>
);

export function CheckboxOutlined({
  name,
  enabled,
  onToggle,
  label,
}: Props): VNode {
  return (
    <Outlined>
      <StyledCheckboxLabel onClick={onToggle}>
        <span>
          <input
            type="checkbox"
            name={name}
            checked={enabled}
            disabled={false}
          />
          <div>
            <Tick />
          </div>
          <label for={name}>{label}</label>
        </span>
      </StyledCheckboxLabel>
    </Outlined>
  );
}
