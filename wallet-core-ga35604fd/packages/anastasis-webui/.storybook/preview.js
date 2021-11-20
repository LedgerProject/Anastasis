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

import "../src/scss/main.scss"
import { TranslationProvider } from '../src/context/translation'
import { h } from 'preact';


export const parameters = {
  controls: { expanded: true },
  options: {
    storySort: (a, b) => {
      return (a[1].args.order ?? 0) - (b[1].args.order ?? 0)
      // return a[1].kind === b[1].kind ? 0 : a[1].id.localeCompare(b[1].id, undefined, { numeric: true })
    }
  },
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
        { value: 'es', right: '🇪🇸', title: 'Spanish' },
      ],
    },
  },
};

export const decorators = [
  (Story, { globals }) => {
    document.body.parentElement.classList = "has-aside-left has-aside-mobile-transition has-navbar-fixed-top has-aside-expanded"
    return <Story />
  },
  (Story, { globals }) => <TranslationProvider initial='en' forceLang={globals.locale}>
    <Story />
  </TranslationProvider>,
];
