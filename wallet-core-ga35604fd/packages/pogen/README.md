# pogen - string extraction for internationalizing TypeScript programs

The ``pogen`` tool extracts internationalizable strings from TypeScript programs.


## Invocation and Configuration

The ``pogen`` tool must be called from the root of an NPM package.

The input files are determined from the ``tsconfig.json`` file at the root of
the package.  All input files inside the package that the compiler would use
are automatically processed.

Further configuration options are specified in the package's ``package.json`` file.
The following configuration options are supported:

```
{

  // [ ... ]

  "pogen": {
    // Output location of the pofile (mandatory)
    "pofile": "...",

    // Calls to plain i18n functions are extracted if they
    // are imported from this package.
    "plainI18nPackage": "@gnu-taler/taler-util",

    // Calls to react-style i18n functions are extracted if they
    // are imported from this package.
    "reactI18nPackage": "@gnu-taler/preact-i18n",
  }

}
```


## Syntax

Two flavors of syntax are supported:

Template strings:

```
import { i18n } from "@gnu-taler/taler-util";

console.log(i18n.str`Hello World`);
console.log(i18n.str`Hello ${user}`);

console.log(i18n.plural(n, i18n.lazy`I have ${n} apple`, i18n.lazy`I have ${n} apples`));
```

React components:

```

import {
  Translate,
  TranslateSwitch,
  TranslateSingular,
  TranslatePlural
} from "@gnu-taler/preact-i18n";

<Translate>Hello, World</Translate>

// Placeholders are other React elements
<Translate>Hello, <span className="highlight">{userName}<span></Translate>

// Plain placeholders are not supported, they must be surrounded
// by an element:
// WRONG: <Translate>Hello, {userName}</Translate>

<TranslateSwitch n={numApples}>
  <TranslateSingular>I have <span>{n}</span> apple</TranslateSingular>
  <TranslatePlural>I have <span>{n}</span> apple</TranslatePlural>
</TranslateSwitch>

```
