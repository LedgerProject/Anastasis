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
import { AmountLike } from "@gnu-taler/taler-util";
import { ExtraLargeText, LargeText, SmallLightText } from "./styled";
import { h } from "preact";

export type Kind = "positive" | "negative" | "neutral";
interface Props {
  title: string;
  text: AmountLike;
  kind: Kind;
  big?: boolean;
}
export function Part({ text, title, kind, big }: Props) {
  const Text = big ? ExtraLargeText : LargeText;
  return (
    <div style={{ margin: "1em" }}>
      <SmallLightText style={{ margin: ".5em" }}>{title}</SmallLightText>
      <Text
        style={{
          color:
            kind == "positive" ? "green" : kind == "negative" ? "red" : "black",
        }}
      >
        {text}
      </Text>
    </div>
  );
}
