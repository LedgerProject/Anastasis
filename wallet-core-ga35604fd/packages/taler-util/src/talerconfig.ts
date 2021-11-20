/*
 This file is part of GNU Taler
 (C) 2020 Taler Systems S.A.

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
 * Utilities to handle Taler-style configuration files.
 *
 * @author Florian Dold <dold@taler.net>
 */

/**
 * Imports
 */
import { AmountJson } from "./amounts.js";
import { Amounts } from "./amounts.js";

const nodejs_fs = (function () {
  let fs: typeof import("fs");
  return function () {
    if (!fs) {
      /**
       * need to use an expression when doing a require if we want
       * webpack not to find out about the requirement
       */
      const _r = "require";
      fs = module[_r]("fs");
    }
    return fs;
  };
})();

const nodejs_path = (function () {
  let path: typeof import("path");
  return function () {
    if (!path) {
      /**
       * need to use an expression when doing a require if we want
       * webpack not to find out about the requirement
       */
      const _r = "require";
      path = module[_r]("path");
    }
    return path;
  };
})();

const nodejs_os = (function () {
  let os: typeof import("os");
  return function () {
    if (!os) {
      /**
       * need to use an expression when doing a require if we want
       * webpack not to find out about the requirement
       */
      const _r = "require";
      os = module[_r]("os");
    }
    return os;
  };
})();

export class ConfigError extends Error {
  constructor(message: string) {
    super();
    Object.setPrototypeOf(this, ConfigError.prototype);
    this.name = "ConfigError";
    this.message = message;
  }
}

interface Entry {
  value: string;
  sourceLine: number;
  sourceFile: string;
}

interface Section {
  secretFilename?: string;
  inaccessible: boolean;
  entries: { [optionName: string]: Entry };
}

type SectionMap = { [sectionName: string]: Section };

export class ConfigValue<T> {
  constructor(
    private sectionName: string,
    private optionName: string,
    public value: string | undefined,
    private converter: (x: string) => T,
  ) {}

  required(): T {
    if (this.value == undefined) {
      throw new ConfigError(
        `required option [${this.sectionName}]/${this.optionName} not found`,
      );
    }
    return this.converter(this.value);
  }

  orUndefined(): T | undefined {
    if (this.value !== undefined) {
      return this.converter(this.value);
    } else {
      return undefined;
    }
  }

  orDefault(v: T): T | undefined {
    if (this.value !== undefined) {
      return this.converter(this.value);
    } else {
      return v;
    }
  }

  isDefined(): boolean {
    return this.value !== undefined;
  }
}

/**
 * Expand a path by resolving the tilde syntax for home directories
 * and by making relative paths absolute based on the current working directory.
 */
export function expandPath(path: string): string {
  if (path[0] === "~") {
    path = nodejs_path().join(nodejs_os().homedir(), path.slice(1));
  }
  if (path[0] !== "/") {
    path = nodejs_path().join(process.cwd(), path);
  }
  return path;
}

/**
 * Shell-style path substitution.
 *
 * Supported patterns:
 * "$x" (look up "x")
 * "${x}" (look up "x")
 * "${x:-y}" (look up "x", fall back to expanded y)
 */
export function pathsub(
  x: string,
  lookup: (s: string, depth: number) => string | undefined,
  depth = 0,
): string {
  if (depth >= 10) {
    throw Error("recursion in path substitution");
  }
  let s = x;
  let l = 0;
  while (l < s.length) {
    if (s[l] === "$") {
      if (s[l + 1] === "{") {
        let depth = 1;
        const start = l;
        let p = start + 2;
        let insideNamePart = true;
        let hasDefault = false;
        for (; p < s.length; p++) {
          if (s[p] == "}") {
            insideNamePart = false;
            depth--;
          } else if (s[p] === "$" && s[p + 1] === "{") {
            insideNamePart = false;
            depth++;
          }
          if (insideNamePart && s[p] === ":" && s[p + 1] === "-") {
            hasDefault = true;
          }
          if (depth == 0) {
            break;
          }
        }
        if (depth == 0) {
          const inner = s.slice(start + 2, p);
          let varname: string;
          let defaultValue: string | undefined;
          if (hasDefault) {
            [varname, defaultValue] = inner.split(":-", 2);
          } else {
            varname = inner;
            defaultValue = undefined;
          }

          const r = lookup(inner, depth + 1);
          if (r !== undefined) {
            s = s.substr(0, start) + r + s.substr(p + 1);
            l = start + r.length;
            continue;
          } else if (defaultValue !== undefined) {
            const resolvedDefault = pathsub(defaultValue, lookup, depth + 1);
            s = s.substr(0, start) + resolvedDefault + s.substr(p + 1);
            l = start + resolvedDefault.length;
            continue;
          }
        }
        l = p;
        continue;
      } else {
        const m = /^[a-zA-Z-_][a-zA-Z0-9-_]*/.exec(s.substring(l + 1));
        if (m && m[0]) {
          const r = lookup(m[0], depth + 1);
          if (r !== undefined) {
            s = s.substr(0, l) + r + s.substr(l + 1 + m[0].length);
            l = l + r.length;
            continue;
          }
        }
      }
    }
    l++;
  }
  return s;
}

export interface LoadOptions {
  filename?: string;
  banDirectives?: boolean;
}

export interface StringifyOptions {
  diagnostics?: boolean;
}

export interface LoadedFile {
  filename: string;
  level: number;
}

/**
 * Check for a simple wildcard match.
 * Only asterisks are allowed.
 * Asterisks match everything, including slashes.
 *
 * @param pattern pattern with wildcards
 * @param str string to match against
 * @returns true on match, false otherwise
 */
function globMatch(pattern: string, str: string): boolean {
  /* Position in the input string */
  let strPos = 0;
  /* Position in the pattern */
  let patPos = 0;
  /* Backtrack position in string */
  let strBt = -1;
  /* Backtrack position in pattern */
  let patBt = -1;

  for (;;) {
    if (pattern[patPos] === "*") {
      strBt = strPos;
      patBt = patPos++;
    } else if (patPos === pattern.length && strPos === str.length) {
      return true;
    } else if (pattern[patPos] === str[strPos]) {
      strPos++;
      patPos++;
    } else {
      if (patBt < 0) {
        return false;
      }
      strPos = strBt + 1;
      if (strPos >= str.length) {
        return false;
      }
      patPos = patBt;
    }
  }
}

function normalizeInlineFilename(parentFile: string, f: string): string {
  if (f[0] === "/") {
    return f;
  }
  const resolvedParentDir = nodejs_path().dirname(
    nodejs_fs().realpathSync(parentFile),
  );
  return nodejs_path().join(resolvedParentDir, f);
}

/**
 * Crude implementation of the which(1) shell command.
 * 
 * Tries to locate the location of an executable based on the
 * "PATH" environment variable.
 */
function which(name: string): string | undefined {
  const paths = process.env["PATH"]?.split(":");
  if (!paths) {
    return undefined;
  }
  for (const path of paths) {
    const filename = nodejs_path().join(path, name);
    if (nodejs_fs().existsSync(filename)) {
      return filename;
    }
  }
  return undefined;
}

export class Configuration {
  private sectionMap: SectionMap = {};

  private hintEntrypoint: string | undefined;

  private loadedFiles: LoadedFile[] = [];

  private nestLevel = 0;

  private loadFromFilename(filename: string, opts: LoadOptions = {}): void {
    filename = expandPath(filename);

    const checkCycle = () => {
      let level = this.nestLevel;
      const fns = [...this.loadedFiles].reverse();
      for (const lf of fns) {
        if (lf.level >= level) {
          continue;
        }
        level = lf.level;
        if (lf.filename === filename) {
          throw Error(`cyclic inline ${lf.filename} -> ${filename}`);
        }
      }
    };

    checkCycle();

    const s = nodejs_fs().readFileSync(filename, "utf-8");
    this.loadedFiles.push({
      filename: filename,
      level: this.nestLevel,
    });
    const oldNestLevel = this.nestLevel;
    this.nestLevel += 1;
    try {
      this.loadFromString(s, {
        ...opts,
        filename: filename,
      });
    } finally {
      this.nestLevel = oldNestLevel;
    }
  }

  private loadGlob(parentFilename: string, fileglob: string): void {
    const resolvedParent = nodejs_fs().realpathSync(parentFilename);
    const parentDir = nodejs_path().dirname(resolvedParent);

    let fullFileglob: string;

    if (fileglob.startsWith("/")) {
      fullFileglob = fileglob;
    } else {
      fullFileglob = nodejs_path().join(parentDir, fileglob);
    }

    fullFileglob = expandPath(fullFileglob);

    const head = nodejs_path().dirname(fullFileglob);
    const tail = nodejs_path().basename(fullFileglob);

    const files = nodejs_fs().readdirSync(head);
    for (const f of files) {
      if (globMatch(tail, f)) {
        const fullPath = nodejs_path().join(head, f);
        this.loadFromFilename(fullPath);
      }
    }
  }

  private loadSecret(sectionName: string, filename: string): void {
    const sec = this.provideSection(sectionName);
    sec.secretFilename = filename;
    const otherCfg = new Configuration();
    try {
      nodejs_fs().accessSync(filename, nodejs_fs().constants.R_OK);
    } catch (err) {
      sec.inaccessible = true;
      return;
    }
    otherCfg.loadFromFilename(filename, {
      banDirectives: true,
    });
    const otherSec = otherCfg.provideSection(sectionName);
    for (const opt of Object.keys(otherSec.entries)) {
      this.setString(sectionName, opt, otherSec.entries[opt].value);
    }
  }

  loadFromString(s: string, opts: LoadOptions = {}): void {
    let lineNo = 0;
    const fn = opts.filename ?? "<input>";
    const reComment = /^\s*#.*$/;
    const reSection = /^\s*\[\s*([^\]]*)\s*\]\s*$/;
    const reParam = /^\s*([^=]+?)\s*=\s*(.*?)\s*$/;
    const reDirective = /^\s*@([a-zA-Z-_]+)@\s*(.*?)\s*$/;
    const reEmptyLine = /^\s*$/;

    let currentSection: string | undefined = undefined;

    const lines = s.split("\n");
    for (const line of lines) {
      lineNo++;
      if (reEmptyLine.test(line)) {
        continue;
      }
      if (reComment.test(line)) {
        continue;
      }
      const directiveMatch = line.match(reDirective);
      if (directiveMatch) {
        if (opts.banDirectives) {
          throw Error(
            `invalid configuration, directive in ${fn}:${lineNo} forbidden`,
          );
        }
        const directive = directiveMatch[1].toLowerCase();
        switch (directive) {
          case "inline": {
            if (!opts.filename) {
              throw Error(
                `invalid configuration, @inline-matching@ directive in ${fn}:${lineNo} can only be used from a file`,
              );
            }
            const arg = directiveMatch[2].trim();
            this.loadFromFilename(normalizeInlineFilename(opts.filename, arg));
            break;
          }
          case "inline-secret": {
            if (!opts.filename) {
              throw Error(
                `invalid configuration, @inline-matching@ directive in ${fn}:${lineNo} can only be used from a file`,
              );
            }
            const arg = directiveMatch[2].trim();
            const sp = arg.split(" ").map((x) => x.trim());
            if (sp.length != 2) {
              throw Error(
                `invalid configuration, @inline-secret@ directive in ${fn}:${lineNo} requires two arguments`,
              );
            }
            const secretFilename = normalizeInlineFilename(
              opts.filename,
              sp[1],
            );
            this.loadSecret(sp[0], secretFilename);
            break;
          }
          case "inline-matching": {
            const arg = directiveMatch[2].trim();
            if (!opts.filename) {
              throw Error(
                `invalid configuration, @inline-matching@ directive in ${fn}:${lineNo} can only be used from a file`,
              );
            }
            this.loadGlob(opts.filename, arg);
            break;
          }
          default:
            throw Error(
              `invalid configuration, unsupported directive in ${fn}:${lineNo}`,
            );
        }
        continue;
      }
      const secMatch = line.match(reSection);
      if (secMatch) {
        currentSection = secMatch[1];
        continue;
      }
      if (currentSection === undefined) {
        throw Error(
          `invalid configuration, expected section header in ${fn}:${lineNo}`,
        );
      }
      currentSection = currentSection.toUpperCase();
      const paramMatch = line.match(reParam);
      if (paramMatch) {
        const optName = paramMatch[1].toUpperCase();
        let val = paramMatch[2];
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, val.length - 1);
        }
        const sec = this.provideSection(currentSection);
        sec.entries[optName] = {
          value: val,
          sourceFile: opts.filename ?? "<unknown>",
          sourceLine: lineNo,
        };
        continue;
      }
      throw Error(
        `invalid configuration, expected section header, option assignment or directive in ${fn}:${lineNo}`,
      );
    }
  }

  private provideSection(section: string): Section {
    const secNorm = section.toUpperCase();
    if (this.sectionMap[secNorm]) {
      return this.sectionMap[secNorm];
    }
    const newSec: Section = {
      entries: {},
      inaccessible: false,
    };
    this.sectionMap[secNorm] = newSec;
    return newSec;
  }

  private findEntry(section: string, option: string): Entry | undefined {
    const secNorm = section.toUpperCase();
    const optNorm = option.toUpperCase();
    return this.sectionMap[secNorm]?.entries[optNorm];
  }

  setString(section: string, option: string, value: string): void {
    const sec = this.provideSection(section);
    sec.entries[option.toUpperCase()] = {
      value,
      sourceLine: 0,
      sourceFile: "<unknown>",
    };
  }

  /**
   * Get upper-cased section names.
   */
  getSectionNames(): string[] {
    return Object.keys(this.sectionMap).map((x) => x.toUpperCase());
  }

  getString(section: string, option: string): ConfigValue<string> {
    const secNorm = section.toUpperCase();
    const optNorm = option.toUpperCase();
    const val = this.findEntry(secNorm, optNorm)?.value;
    return new ConfigValue(secNorm, optNorm, val, (x) => x);
  }

  getPath(section: string, option: string): ConfigValue<string> {
    const secNorm = section.toUpperCase();
    const optNorm = option.toUpperCase();
    const val = this.findEntry(secNorm, optNorm)?.value;
    return new ConfigValue(secNorm, optNorm, val, (x) =>
      pathsub(x, (v, d) => this.lookupVariable(v, d + 1)),
    );
  }

  getYesNo(section: string, option: string): ConfigValue<boolean> {
    const secNorm = section.toUpperCase();
    const optNorm = option.toUpperCase();
    const val = this.findEntry(secNorm, optNorm)?.value;
    const convert = (x: string): boolean => {
      x = x.toLowerCase();
      if (x === "yes") {
        return true;
      } else if (x === "no") {
        return false;
      }
      throw Error(
        `invalid config value for [${secNorm}]/${optNorm}, expected yes/no`,
      );
    };
    return new ConfigValue(secNorm, optNorm, val, convert);
  }

  getNumber(section: string, option: string): ConfigValue<number> {
    const secNorm = section.toUpperCase();
    const optNorm = option.toUpperCase();
    const val = this.findEntry(secNorm, optNorm)?.value;
    const convert = (x: string): number => {
      try {
        return Number.parseInt(x, 10);
      } catch (e) {
        throw Error(
          `invalid config value for [${secNorm}]/${optNorm}, expected number`,
        );
      }
    };
    return new ConfigValue(secNorm, optNorm, val, convert);
  }

  lookupVariable(x: string, depth: number = 0): string | undefined {
    // We loop up options in PATHS in upper case, as option names
    // are case insensitive
    const val = this.findEntry("PATHS", x)?.value;
    if (val !== undefined) {
      return pathsub(val, (v, d) => this.lookupVariable(v, d), depth);
    }
    // Environment variables can be case sensitive, respect that.
    const envVal = process.env[x];
    if (envVal !== undefined) {
      return envVal;
    }
    return;
  }

  getAmount(section: string, option: string): ConfigValue<AmountJson> {
    const val = this.findEntry(section, option)?.value;
    return new ConfigValue(section, option, val, (x) =>
      Amounts.parseOrThrow(x),
    );
  }

  loadFrom(dirname: string): void {
    const files = nodejs_fs().readdirSync(dirname);
    for (const f of files) {
      const fn = nodejs_path().join(dirname, f);
      this.loadFromFilename(fn);
    }
  }

  private loadDefaults(): void {
    let bc = process.env["TALER_BASE_CONFIG"];
    if (!bc) {
      /* Try to locate the configuration based on the location
       * of the taler-config binary. */
      const path = which("taler-config");
      if (path) {
        bc = nodejs_fs().realpathSync(
          nodejs_path().dirname(path) + "/../share/taler/config.d",
        );
      }
    }
    if (!bc) {
      bc = "/usr/share/taler/config.d";
    }
    this.loadFrom(bc);
  }

  getDefaultConfigFilename(): string | undefined {
    const xdg = process.env["XDG_CONFIG_HOME"];
    const home = process.env["HOME"];
    let fn: string | undefined;
    if (xdg) {
      fn = nodejs_path().join(xdg, "taler.conf");
    } else if (home) {
      fn = nodejs_path().join(home, ".config/taler.conf");
    }
    if (fn && nodejs_fs().existsSync(fn)) {
      return fn;
    }
    const etc1 = "/etc/taler.conf";
    if (nodejs_fs().existsSync(etc1)) {
      return etc1;
    }
    const etc2 = "/etc/taler/taler.conf";
    if (nodejs_fs().existsSync(etc2)) {
      return etc2;
    }
    return undefined;
  }

  static load(filename?: string): Configuration {
    const cfg = new Configuration();
    cfg.loadDefaults();
    if (filename) {
      cfg.loadFromFilename(filename);
    } else {
      const fn = cfg.getDefaultConfigFilename();
      if (fn) {
        cfg.loadFromFilename(fn);
      }
    }
    cfg.hintEntrypoint = filename;
    return cfg;
  }

  stringify(opts: StringifyOptions = {}): string {
    let s = "";
    if (opts.diagnostics) {
      s += "# Configuration file diagnostics\n";
      s += "#\n";
      s += `# Entry point: ${this.hintEntrypoint ?? "<none>"}\n`;
      s += "#\n";
      s += "# Loaded files:\n";
      for (const f of this.loadedFiles) {
        s += `# ${f.filename}\n`;
      }
      s += "#\n\n";
    }
    for (const sectionName of Object.keys(this.sectionMap)) {
      const sec = this.sectionMap[sectionName];
      if (opts.diagnostics && sec.secretFilename) {
        s += `# Secret section from ${sec.secretFilename}\n`;
        s += `# Secret accessible: ${!sec.inaccessible}\n`;
      }
      s += `[${sectionName}]\n`;
      for (const optionName of Object.keys(sec.entries)) {
        const entry = this.sectionMap[sectionName].entries[optionName];
        if (entry !== undefined) {
          if (opts.diagnostics) {
            s += `# ${entry.sourceFile}:${entry.sourceLine}\n`;
          }
          s += `${optionName} = ${entry.value}\n`;
        }
      }
      s += "\n";
    }
    return s;
  }

  write(filename: string): void {
    nodejs_fs().writeFileSync(filename, this.stringify());
  }
}
