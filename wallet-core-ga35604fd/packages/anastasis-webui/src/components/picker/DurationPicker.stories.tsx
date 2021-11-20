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

import { h, FunctionalComponent } from "preact";
import { useState } from "preact/hooks";
import { DurationPicker as TestedComponent } from "./DurationPicker";

export default {
  title: "Components/Picker/Duration",
  component: TestedComponent,
  argTypes: {
    onCreate: { action: "onCreate" },
    goBack: { action: "goBack" },
  },
};

function createExample<Props>(
  Component: FunctionalComponent<Props>,
  props: Partial<Props>,
) {
  const r = (args: any) => <Component {...args} />;
  r.args = props;
  return r;
}

export const Example = createExample(TestedComponent, {
  days: true,
  minutes: true,
  hours: true,
  seconds: true,
  value: 10000000,
});

export const WithState = () => {
  const [v, s] = useState<number>(1000000);
  return <TestedComponent value={v} onChange={s} days minutes hours seconds />;
};
