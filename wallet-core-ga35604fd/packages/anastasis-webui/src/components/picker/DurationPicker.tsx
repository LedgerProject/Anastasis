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
 *
 * @author Sebastian Javier Marchano (sebasjm)
 */

import { h, VNode } from "preact";
import { useState } from "preact/hooks";
import { useTranslator } from "../../i18n";
import "../../scss/DurationPicker.scss";

export interface Props {
  hours?: boolean;
  minutes?: boolean;
  seconds?: boolean;
  days?: boolean;
  onChange: (value: number) => void;
  value: number;
}

// inspiration taken from https://github.com/flurmbo/react-duration-picker
export function DurationPicker({
  days,
  hours,
  minutes,
  seconds,
  onChange,
  value,
}: Props): VNode {
  const ss = 1000;
  const ms = ss * 60;
  const hs = ms * 60;
  const ds = hs * 24;
  const i18n = useTranslator();

  return (
    <div class="rdp-picker">
      {days && (
        <DurationColumn
          unit={i18n`days`}
          max={99}
          value={Math.floor(value / ds)}
          onDecrease={value >= ds ? () => onChange(value - ds) : undefined}
          onIncrease={value < 99 * ds ? () => onChange(value + ds) : undefined}
          onChange={(diff) => onChange(value + diff * ds)}
        />
      )}
      {hours && (
        <DurationColumn
          unit={i18n`hours`}
          max={23}
          min={1}
          value={Math.floor(value / hs) % 24}
          onDecrease={value >= hs ? () => onChange(value - hs) : undefined}
          onIncrease={value < 99 * ds ? () => onChange(value + hs) : undefined}
          onChange={(diff) => onChange(value + diff * hs)}
        />
      )}
      {minutes && (
        <DurationColumn
          unit={i18n`minutes`}
          max={59}
          min={1}
          value={Math.floor(value / ms) % 60}
          onDecrease={value >= ms ? () => onChange(value - ms) : undefined}
          onIncrease={value < 99 * ds ? () => onChange(value + ms) : undefined}
          onChange={(diff) => onChange(value + diff * ms)}
        />
      )}
      {seconds && (
        <DurationColumn
          unit={i18n`seconds`}
          max={59}
          value={Math.floor(value / ss) % 60}
          onDecrease={value >= ss ? () => onChange(value - ss) : undefined}
          onIncrease={value < 99 * ds ? () => onChange(value + ss) : undefined}
          onChange={(diff) => onChange(value + diff * ss)}
        />
      )}
    </div>
  );
}

interface ColProps {
  unit: string;
  min?: number;
  max: number;
  value: number;
  onIncrease?: () => void;
  onDecrease?: () => void;
  onChange?: (diff: number) => void;
}

function InputNumber({
  initial,
  onChange,
}: {
  initial: number;
  onChange: (n: number) => void;
}) {
  const [value, handler] = useState<{ v: string }>({
    v: toTwoDigitString(initial),
  });

  return (
    <input
      value={value.v}
      onBlur={(e) => onChange(parseInt(value.v, 10))}
      onInput={(e) => {
        e.preventDefault();
        const n = Number.parseInt(e.currentTarget.value, 10);
        if (isNaN(n)) return handler({ v: toTwoDigitString(initial) });
        return handler({ v: toTwoDigitString(n) });
      }}
      style={{
        width: 50,
        border: "none",
        fontSize: "inherit",
        background: "inherit",
      }}
    />
  );
}

function DurationColumn({
  unit,
  min = 0,
  max,
  value,
  onIncrease,
  onDecrease,
  onChange,
}: ColProps): VNode {
  const cellHeight = 35;
  return (
    <div class="rdp-column-container">
      <div class="rdp-masked-div">
        <hr class="rdp-reticule" style={{ top: cellHeight * 2 - 1 }} />
        <hr class="rdp-reticule" style={{ top: cellHeight * 3 - 1 }} />

        <div class="rdp-column" style={{ top: 0 }}>
          <div class="rdp-cell" key={value - 2}>
            {onDecrease && (
              <button
                style={{ width: "100%", textAlign: "center", margin: 5 }}
                onClick={onDecrease}
              >
                <span class="icon">
                  <i class="mdi mdi-chevron-up" />
                </span>
              </button>
            )}
          </div>
          <div class="rdp-cell" key={value - 1}>
            {value > min ? toTwoDigitString(value - 1) : ""}
          </div>
          <div class="rdp-cell rdp-center" key={value}>
            {onChange ? (
              <InputNumber
                initial={value}
                onChange={(n) => onChange(n - value)}
              />
            ) : (
              toTwoDigitString(value)
            )}
            <div>{unit}</div>
          </div>

          <div class="rdp-cell" key={value + 1}>
            {value < max ? toTwoDigitString(value + 1) : ""}
          </div>

          <div class="rdp-cell" key={value + 2}>
            {onIncrease && (
              <button
                style={{ width: "100%", textAlign: "center", margin: 5 }}
                onClick={onIncrease}
              >
                <span class="icon">
                  <i class="mdi mdi-chevron-down" />
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function toTwoDigitString(n: number) {
  if (n < 10) {
    return `0${n}`;
  }
  return `${n}`;
}
