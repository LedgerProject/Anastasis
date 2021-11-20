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

import { h, Fragment } from "preact"
import { NavBar } from '../src/NavigationBar'
import { LogoHeader } from '../src/components/LogoHeader'
import { TranslationProvider } from '../src/context/translation'
import { PopupBox, WalletBox } from '../src/components/styled'
export const parameters = {
  controls: { expanded: true },
  actions: { argTypesRegex: "^on[A-Z].*" },
}

export const globalTypes = {
  locale: {
    name: 'Locale',
    description: 'Internationalization locale',
    defaultValue: 'en',
    toolbar: {
      icon: 'globe',
      items: [
        { value: 'en', right: '🇺🇸', title: 'English' },
        { value: 'de', right: '🇪🇸', title: 'German' },
      ],
    },
  },
};



export const decorators = [
  (Story, { kind }) => {
    if (kind.startsWith('popup')) {

      function Body() {
        const isTestingHeader = (/.*\/header\/?.*/.test(kind));
        if (isTestingHeader) {
          // simple box with correct width and height
          return <div style={{ width: 400, height: 320 }}>
            <Story />
          </div>
        }

        const path = /popup(\/.*).*/.exec(kind)[1];
        // add a fake header so it looks similar
        return <Fragment>
          <NavBar path={path} devMode={path === '/dev'} />
          <PopupBox>
            <Story />
          </PopupBox>
        </Fragment>
      }

      return <div class="popup-container">
        <style>{`
        html {
          font-family: sans-serif; /* 1 */
        }
        body {
          margin: 0;
        }`}
        </style>
        <style>{`
        html {
        }
        h1 {
          font-size: 2em;
        }
        input {
          font: inherit;
        }
        body {
          margin: 0;
          font-size: 100%;
          padding: 0;
          overflow: hidden;
          background-color: #f8faf7;
          font-family: Arial, Helvetica, sans-serif;
        }`}
        </style>
        <div style={{ width: 400, border: 'black solid 1px' }}>
          <Body />
        </div>
      </div>
    }
    if (kind.startsWith('cta')) {
      return <div>
        <style>{`
        html {
          font-family: sans-serif; /* 1 */
        }
        body {
          margin: 0;
        }`}
        </style>
        <style>{`
        html {
        }
        h1 {
          font-size: 2em;
        }
        input {
          font: inherit;
        }
        body {
          margin: 0;
          font-size: 100%;
          padding: 0;
          font-family: Arial, Helvetica, sans-serif;
        }`}
        </style>
        <link key="1" rel="stylesheet" type="text/css" href="/static/style/pure.css" />
        <link key="2" rel="stylesheet" type="text/css" href="/static/style/wallet.css" />
        <Story />
      </div>
    }
    if (kind.startsWith('wallet')) {
      const path = /wallet(\/.*).*/.exec(kind)[1];
      return <div class="wallet-container">
        <style>{`
        html {
          font-family: sans-serif; /* 1 */
        }
        body {
          margin: 0;
        }`}
        </style>
        <style>{`
        html {
        }
        h1 {
          font-size: 2em;
        }
        input {
          font: inherit;
        }
        body {
          margin: 0;
          font-size: 100%;
          padding: 0;
          background-color: #f8faf7;
          font-family: Arial, Helvetica, sans-serif;
        }`}
        </style>
        <LogoHeader />
        <NavBar path={path} devMode={path === '/dev'} />
        <WalletBox>
          <Story />
        </WalletBox>
      </div>
    }
    return <div>
      <h1>this story is not under wallet or popup, check title property</h1>
      <Story />
    </div>
  },
  (Story, { globals }) => <TranslationProvider initial='en' forceLang={globals.locale}>
    <Story />
  </TranslationProvider>,
];
