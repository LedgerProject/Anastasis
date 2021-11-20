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
import { SetUrlView as TestedComponent } from "./ProviderAddPage";

export default {
  title: "wallet/backup/add",
  component: TestedComponent,
  argTypes: {
    onRetry: { action: "onRetry" },
    onDelete: { action: "onDelete" },
    onBack: { action: "onBack" },
  },
};

export const Initial = createExample(TestedComponent, {});

export const WithValue = createExample(TestedComponent, {
  initialValue: "sync.demo.taler.net",
});

export const WithConnectionError = createExample(TestedComponent, {
  withError: "Network error",
});

export const WithClientError = createExample(TestedComponent, {
  withError: "URL may not be right: (404) Not Found",
});

export const WithServerError = createExample(TestedComponent, {
  withError: "Try another server: (500) Internal Server Error",
});
