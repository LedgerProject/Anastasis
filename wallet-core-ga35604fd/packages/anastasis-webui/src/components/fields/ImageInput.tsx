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
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import emptyImage from "../../assets/empty.png";
import { TextInputProps } from "./TextInput";

const MAX_IMAGE_UPLOAD_SIZE = 1024 * 1024;

export function ImageInput(props: TextInputProps): VNode {
  const inputRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (props.grabFocus) {
      inputRef.current?.focus();
    }
  }, [props.grabFocus]);

  const value = props.bind[0];
  // const [dirty, setDirty] = useState(false)
  const image = useRef<HTMLInputElement>(null);
  const [sizeError, setSizeError] = useState(false);
  function onChange(v: string): void {
    // setDirty(true);
    props.bind[1](v);
  }
  return (
    <div class="field">
      <label class="label">
        {props.label}
        {props.tooltip && (
          <span class="icon has-tooltip-right" data-tooltip={props.tooltip}>
            <i class="mdi mdi-information" />
          </span>
        )}
      </label>
      <div class="control">
        <img
          src={!value ? emptyImage : value}
          style={{ width: 200, height: 200 }}
          onClick={() => image.current?.click()}
        />
        <input
          ref={image}
          style={{ display: "none" }}
          type="file"
          name={String(name)}
          onChange={(e) => {
            const f: FileList | null = e.currentTarget.files;
            if (!f || f.length != 1) {
              return onChange(emptyImage);
            }
            if (f[0].size > MAX_IMAGE_UPLOAD_SIZE) {
              setSizeError(true);
              return onChange(emptyImage);
            }
            setSizeError(false);
            return f[0].arrayBuffer().then((b) => {
              const b64 = btoa(
                new Uint8Array(b).reduce(
                  (data, byte) => data + String.fromCharCode(byte),
                  "",
                ),
              );
              return onChange(`data:${f[0].type};base64,${b64}` as any);
            });
          }}
        />
        {props.error && <p class="help is-danger">{props.error}</p>}
        {sizeError && (
          <p class="help is-danger">Image should be smaller than 1 MB</p>
        )}
      </div>
    </div>
  );
}
