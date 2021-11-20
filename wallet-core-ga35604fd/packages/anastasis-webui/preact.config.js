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

import { DefinePlugin } from 'webpack';

import pack from './package.json';
import * as cp from 'child_process';

const commitHash = cp.execSync('git rev-parse --short HEAD').toString();

export default {
  webpack(config, env, helpers) {
    // add __VERSION__ to be use in the html
    config.plugins.push(
      new DefinePlugin({
        'process.env.__VERSION__': JSON.stringify(env.isProd ? pack.version : `dev-${commitHash}`),
      }),
    );
    const crittersWrapper = helpers.getPluginsByName(config, 'Critters')
    if (crittersWrapper && crittersWrapper.length > 0) {
      const [{ index }] = crittersWrapper
      config.plugins.splice(index, 1)
    }

  }
}

