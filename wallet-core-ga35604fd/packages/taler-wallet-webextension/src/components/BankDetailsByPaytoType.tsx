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

import { PaytoUri } from "@gnu-taler/taler-util";
import { Fragment, h, VNode } from "preact";
import { useEffect, useState } from "preact/hooks";
import { CopiedIcon, CopyIcon } from "../svg";
import { ButtonBox, TooltipRight } from "./styled";

export interface BankDetailsProps {
  payto: PaytoUri | undefined;
  exchangeBaseUrl: string;
  subject: string;
  amount: string;
}

export function BankDetailsByPaytoType({
  payto,
  subject,
  exchangeBaseUrl,
  amount,
}: BankDetailsProps): VNode {
  const firstPart = !payto ? undefined : !payto.isKnown ? (
    <Row name="Account" value={payto.targetPath} />
  ) : payto.targetType === "x-taler-bank" ? (
    <Fragment>
      <Row name="Bank host" value={payto.host} />
      <Row name="Bank account" value={payto.account} />
    </Fragment>
  ) : payto.targetType === "iban" ? (
    <Row name="IBAN" value={payto.iban} />
  ) : undefined;
  return (
    <div style={{ textAlign: "left" }}>
      <p>Bank transfer details</p>
      <table>
        {firstPart}
        <Row name="Exchange" value={exchangeBaseUrl} />
        <Row name="Chosen amount" value={amount} />
        <Row name="Subject" value={subject} literal />
      </table>
    </div>
  );
}

function Row({
  name,
  value,
  literal,
}: {
  name: string;
  value: string;
  literal?: boolean;
}): VNode {
  const [copied, setCopied] = useState(false);
  function copyText(): void {
    navigator.clipboard.writeText(value);
    setCopied(true);
  }
  useEffect(() => {
    if (copied) {
      setTimeout(() => {
        setCopied(false);
      }, 1000);
    }
  }, [copied]);
  return (
    <tr>
      <td>
        {!copied ? (
          <ButtonBox onClick={copyText}>
            <CopyIcon />
          </ButtonBox>
        ) : (
          <TooltipRight content="Copied">
            <ButtonBox disabled>
              <CopiedIcon />
            </ButtonBox>
          </TooltipRight>
        )}
      </td>
      <td>
        <b>{name}</b>
      </td>
      {literal ? (
        <td>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {value}
          </pre>
        </td>
      ) : (
        <td>{value}</td>
      )}
    </tr>
  );
}
