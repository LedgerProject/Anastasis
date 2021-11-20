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

import { createExample } from "../test-utils";
import { ConfirmProviderView as TestedComponent } from "./ProviderAddPage";

export default {
  title: "wallet/backup/confirm",
  component: TestedComponent,
  argTypes: {
    onRetry: { action: "onRetry" },
    onDelete: { action: "onDelete" },
    onBack: { action: "onBack" },
  },
};

export const DemoService = createExample(TestedComponent, {
  url: "https://sync.demo.taler.net/",
  provider: {
    annual_fee: "KUDOS:0.1",
    storage_limit_in_megabytes: 20,
    supported_protocol_version: "1",
  },
});

export const FreeService = createExample(TestedComponent, {
  url: "https://sync.taler:9667/",
  provider: {
    annual_fee: "ARS:0",
    storage_limit_in_megabytes: 20,
    supported_protocol_version: "1",
  },
});
