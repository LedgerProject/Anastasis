/*
 This file is part of TALER
 (C) 2016 GNUnet e.V.

 TALER is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 TALER is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 TALER; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

import { BalancesResponse, i18n } from "@gnu-taler/taler-util";
import { Fragment, h, VNode } from "preact";
import { BalanceTable } from "../components/BalanceTable";
import { ButtonPrimary, ErrorBox } from "../components/styled/index";
import { HookResponse, useAsyncAsHook } from "../hooks/useAsyncAsHook";
import { PageLink } from "../renderHtml";
import * as wxApi from "../wxApi";

export function BalancePage({
  goToWalletManualWithdraw,
}: {
  goToWalletManualWithdraw: () => void;
}): VNode {
  const state = useAsyncAsHook(wxApi.getBalance);
  return (
    <BalanceView
      balance={state}
      Linker={PageLink}
      goToWalletManualWithdraw={goToWalletManualWithdraw}
    />
  );
}

export interface BalanceViewProps {
  balance: HookResponse<BalancesResponse>;
  Linker: typeof PageLink;
  goToWalletManualWithdraw: () => void;
}

export function BalanceView({
  balance,
  Linker,
  goToWalletManualWithdraw,
}: BalanceViewProps): VNode {
  if (!balance) {
    return <div>Loading...</div>;
  }

  if (balance.hasError) {
    return (
      <Fragment>
        <ErrorBox>{balance.message}</ErrorBox>
        <p>
          Click <Linker pageName="welcome">here</Linker> for help and
          diagnostics.
        </p>
      </Fragment>
    );
  }
  if (balance.response.balances.length === 0) {
    return (
      <p>
        <i18n.Translate>
          You have no balance to show. Need some{" "}
          <Linker pageName="/welcome">help</Linker> getting started?
        </i18n.Translate>
      </p>
    );
  }

  return (
    <Fragment>
      <section>
        <BalanceTable balances={balance.response.balances} />
      </section>
      <footer style={{ justifyContent: "space-around" }}>
        <ButtonPrimary onClick={goToWalletManualWithdraw}>
          Withdraw
        </ButtonPrimary>
      </footer>
    </Fragment>
  );
}
