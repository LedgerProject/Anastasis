/*
 This file is part of GNU Taler
 (C) 2019 GNUnet e.V.

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
 * Imports.
 */
import process from "process";
import path from "path";
import readline from "readline";

export namespace clk {
  class Converter<T> {}

  export const INT = new Converter<number>();
  export const STRING: Converter<string> = new Converter<string>();

  export interface OptionArgs<T> {
    help?: string;
    default?: T;
    onPresentHandler?: (v: T) => void;
  }

  export interface ArgumentArgs<T> {
    metavar?: string;
    help?: string;
    default?: T;
  }

  export interface SubcommandArgs {
    help?: string;
  }

  export interface FlagArgs {
    help?: string;
  }

  export interface ProgramArgs {
    help?: string;
  }

  interface ArgumentDef {
    name: string;
    conv: Converter<any>;
    args: ArgumentArgs<any>;
    required: boolean;
  }

  interface SubcommandDef {
    commandGroup: CommandGroup<any, any>;
    name: string;
    args: SubcommandArgs;
  }

  type ActionFn<TG> = (x: TG) => void;

  type SubRecord<S extends keyof any, N extends keyof any, V> = {
    [Y in S]: { [X in N]: V };
  };

  interface OptionDef {
    name: string;
    flagspec: string[];
    /**
     * Converter, only present for options, not for flags.
     */
    conv?: Converter<any>;
    args: OptionArgs<any>;
    isFlag: boolean;
    required: boolean;
  }

  function splitOpt(opt: string): { key: string; value?: string } {
    const idx = opt.indexOf("=");
    if (idx == -1) {
      return { key: opt };
    }
    return { key: opt.substring(0, idx), value: opt.substring(idx + 1) };
  }

  function formatListing(key: string, value?: string): string {
    const res = "  " + key;
    if (!value) {
      return res;
    }
    if (res.length >= 25) {
      return res + "\n" + "    " + value;
    } else {
      return res.padEnd(24) + " " + value;
    }
  }

  export class CommandGroup<GN extends keyof any, TG> {
    private shortOptions: { [name: string]: OptionDef } = {};
    private longOptions: { [name: string]: OptionDef } = {};
    private subcommandMap: { [name: string]: SubcommandDef } = {};
    private subcommands: SubcommandDef[] = [];
    private options: OptionDef[] = [];
    private arguments: ArgumentDef[] = [];

    private myAction?: ActionFn<TG>;

    constructor(
      private argKey: string,
      private name: string | null,
      private scArgs: SubcommandArgs,
    ) {}

    action(f: ActionFn<TG>): void {
      if (this.myAction) {
        throw Error("only one action supported per command");
      }
      this.myAction = f;
    }

    requiredOption<N extends keyof any, V>(
      name: N,
      flagspec: string[],
      conv: Converter<V>,
      args: OptionArgs<V> = {},
    ): CommandGroup<GN, TG & SubRecord<GN, N, V>> {
      const def: OptionDef = {
        args: args,
        conv: conv,
        flagspec: flagspec,
        isFlag: false,
        required: true,
        name: name as string,
      };
      this.options.push(def);
      for (const flag of flagspec) {
        if (flag.startsWith("--")) {
          const flagname = flag.substring(2);
          this.longOptions[flagname] = def;
        } else if (flag.startsWith("-")) {
          const flagname = flag.substring(1);
          this.shortOptions[flagname] = def;
        } else {
          throw Error("option must start with '-' or '--'");
        }
      }
      return this as any;
    }

    maybeOption<N extends keyof any, V>(
      name: N,
      flagspec: string[],
      conv: Converter<V>,
      args: OptionArgs<V> = {},
    ): CommandGroup<GN, TG & SubRecord<GN, N, V | undefined>> {
      const def: OptionDef = {
        args: args,
        conv: conv,
        flagspec: flagspec,
        isFlag: false,
        required: false,
        name: name as string,
      };
      this.options.push(def);
      for (const flag of flagspec) {
        if (flag.startsWith("--")) {
          const flagname = flag.substring(2);
          this.longOptions[flagname] = def;
        } else if (flag.startsWith("-")) {
          const flagname = flag.substring(1);
          this.shortOptions[flagname] = def;
        } else {
          throw Error("option must start with '-' or '--'");
        }
      }
      return this as any;
    }

    requiredArgument<N extends keyof any, V>(
      name: N,
      conv: Converter<V>,
      args: ArgumentArgs<V> = {},
    ): CommandGroup<GN, TG & SubRecord<GN, N, V>> {
      const argDef: ArgumentDef = {
        args: args,
        conv: conv,
        name: name as string,
        required: true,
      };
      this.arguments.push(argDef);
      return this as any;
    }

    maybeArgument<N extends keyof any, V>(
      name: N,
      conv: Converter<V>,
      args: ArgumentArgs<V> = {},
    ): CommandGroup<GN, TG & SubRecord<GN, N, V | undefined>> {
      const argDef: ArgumentDef = {
        args: args,
        conv: conv,
        name: name as string,
        required: false,
      };
      this.arguments.push(argDef);
      return this as any;
    }

    flag<N extends string, V>(
      name: N,
      flagspec: string[],
      args: OptionArgs<V> = {},
    ): CommandGroup<GN, TG & SubRecord<GN, N, boolean>> {
      const def: OptionDef = {
        args: args,
        flagspec: flagspec,
        isFlag: true,
        required: false,
        name: name as string,
      };
      this.options.push(def);
      for (const flag of flagspec) {
        if (flag.startsWith("--")) {
          const flagname = flag.substring(2);
          this.longOptions[flagname] = def;
        } else if (flag.startsWith("-")) {
          const flagname = flag.substring(1);
          this.shortOptions[flagname] = def;
        } else {
          throw Error("option must start with '-' or '--'");
        }
      }
      return this as any;
    }

    subcommand<GN extends keyof any>(
      argKey: GN,
      name: string,
      args: SubcommandArgs = {},
    ): CommandGroup<GN, TG> {
      const cg = new CommandGroup<GN, {}>(argKey as string, name, args);
      const def: SubcommandDef = {
        commandGroup: cg,
        name: name as string,
        args: args,
      };
      cg.flag("help", ["-h", "--help"], {
        help: "Show this message and exit.",
      });
      this.subcommandMap[name as string] = def;
      this.subcommands.push(def);
      this.subcommands = this.subcommands.sort((x1, x2) => {
        const a = x1.name;
        const b = x2.name;
        if (a === b) {
          return 0;
        } else if (a < b) {
          return -1;
        } else {
          return 1;
        }
      });
      return cg as any;
    }

    printHelp(progName: string, parents: CommandGroup<any, any>[]): void {
      let usageSpec = "";
      for (const p of parents) {
        usageSpec += (p.name ?? progName) + " ";
        if (p.arguments.length >= 1) {
          usageSpec += "<ARGS...> ";
        }
      }
      usageSpec += (this.name ?? progName) + " ";
      if (this.subcommands.length != 0) {
        usageSpec += "COMMAND ";
      }
      for (const a of this.arguments) {
        const argName = a.args.metavar ?? a.name;
        usageSpec += `<${argName}> `;
      }
      usageSpec = usageSpec.trimRight();
      console.log(`Usage: ${usageSpec}`);
      if (this.scArgs.help) {
        console.log();
        console.log(this.scArgs.help);
      }
      if (this.options.length != 0) {
        console.log();
        console.log("Options:");
        for (const opt of this.options) {
          let optSpec = opt.flagspec.join(", ");
          if (!opt.isFlag) {
            optSpec = optSpec + "=VALUE";
          }
          console.log(formatListing(optSpec, opt.args.help));
        }
      }

      if (this.subcommands.length != 0) {
        console.log();
        console.log("Commands:");
        for (const subcmd of this.subcommands) {
          console.log(formatListing(subcmd.name, subcmd.args.help));
        }
      }
    }

    /**
     * Run the (sub-)command with the given command line parameters.
     */
    run(
      progname: string,
      parents: CommandGroup<any, any>[],
      unparsedArgs: string[],
      parsedArgs: any,
    ): void {
      let posArgIndex = 0;
      let argsTerminated = false;
      let i;
      let foundSubcommand: CommandGroup<any, any> | undefined = undefined;
      const myArgs: any = (parsedArgs[this.argKey] = {});
      const foundOptions: { [name: string]: boolean } = {};
      const currentName = this.name ?? progname;
      for (i = 0; i < unparsedArgs.length; i++) {
        const argVal = unparsedArgs[i];
        if (argsTerminated == false) {
          if (argVal === "--") {
            argsTerminated = true;
            continue;
          }
          if (argVal.startsWith("--")) {
            const opt = argVal.substring(2);
            const r = splitOpt(opt);
            const d = this.longOptions[r.key];
            if (!d) {
              console.error(
                `error: unknown option '--${r.key}' for ${currentName}`,
              );
              process.exit(-1);
              throw Error("not reached");
            }
            if (d.isFlag) {
              if (r.value !== undefined) {
                console.error(`error: flag '--${r.key}' does not take a value`);
                process.exit(-1);
                throw Error("not reached");
              }
              foundOptions[d.name] = true;
              myArgs[d.name] = true;
            } else {
              if (r.value === undefined) {
                if (i === unparsedArgs.length - 1) {
                  console.error(`error: option '--${r.key}' needs an argument`);
                  process.exit(-1);
                  throw Error("not reached");
                }
                myArgs[d.name] = unparsedArgs[i + 1];
                i++;
              } else {
                myArgs[d.name] = r.value;
              }
              foundOptions[d.name] = true;
            }
            continue;
          }
          if (argVal.startsWith("-") && argVal != "-") {
            const optShort = argVal.substring(1);
            for (let si = 0; si < optShort.length; si++) {
              const chr = optShort[si];
              const opt = this.shortOptions[chr];
              if (!opt) {
                console.error(`error: option '-${chr}' not known`);
                process.exit(-1);
              }
              if (opt.isFlag) {
                myArgs[opt.name] = true;
                foundOptions[opt.name] = true;
              } else {
                if (si == optShort.length - 1) {
                  if (i === unparsedArgs.length - 1) {
                    console.error(`error: option '-${chr}' needs an argument`);
                    process.exit(-1);
                    throw Error("not reached");
                  } else {
                    myArgs[opt.name] = unparsedArgs[i + 1];
                    i++;
                  }
                } else {
                  myArgs[opt.name] = optShort.substring(si + 1);
                }
                foundOptions[opt.name] = true;
                break;
              }
            }
            continue;
          }
        }
        if (this.subcommands.length != 0) {
          const subcmd = this.subcommandMap[argVal];
          if (!subcmd) {
            console.error(`error: unknown command '${argVal}'`);
            process.exit(-1);
            throw Error("not reached");
          }
          foundSubcommand = subcmd.commandGroup;
          break;
        } else {
          const d = this.arguments[posArgIndex];
          if (!d) {
            console.error(`error: too many arguments for ${currentName}`);
            process.exit(-1);
            throw Error("not reached");
          }
          myArgs[d.name] = unparsedArgs[i];
          posArgIndex++;
        }
      }

      if (parsedArgs[this.argKey].help) {
        this.printHelp(progname, parents);
        process.exit(0);
        throw Error("not reached");
      }

      for (let i = posArgIndex; i < this.arguments.length; i++) {
        const d = this.arguments[i];
        if (d.required) {
          if (d.args.default !== undefined) {
            myArgs[d.name] = d.args.default;
          } else {
            console.error(
              `error: missing positional argument '${d.name}' for ${currentName}`,
            );
            process.exit(-1);
            throw Error("not reached");
          }
        }
      }

      for (const option of this.options) {
        if (option.isFlag == false && option.required == true) {
          if (!foundOptions[option.name]) {
            if (option.args.default !== undefined) {
              myArgs[option.name] = option.args.default;
            } else {
              const name = option.flagspec.join(",");
              console.error(`error: missing option '${name}'`);
              process.exit(-1);
              throw Error("not reached");
            }
          }
        }
      }

      for (const option of this.options) {
        const ph = option.args.onPresentHandler;
        if (ph && foundOptions[option.name]) {
          ph(myArgs[option.name]);
        }
      }

      if (foundSubcommand) {
        foundSubcommand.run(
          progname,
          Array.prototype.concat(parents, [this]),
          unparsedArgs.slice(i + 1),
          parsedArgs,
        );
      } else if (this.myAction) {
        let r;
        try {
          r = this.myAction(parsedArgs);
        } catch (e) {
          console.error(`An error occurred while running ${currentName}`);
          console.error(e);
          process.exit(1);
        }
        Promise.resolve(r).catch((e) => {
          console.error(`An error occurred while running ${currentName}`);
          console.error(e);
          process.exit(1);
        });
      } else {
        this.printHelp(progname, parents);
        process.exit(-1);
        throw Error("not reached");
      }
    }
  }

  export class Program<PN extends keyof any, T> {
    private mainCommand: CommandGroup<any, any>;

    constructor(argKey: string, args: ProgramArgs = {}) {
      this.mainCommand = new CommandGroup<any, any>(argKey, null, {
        help: args.help,
      });
      this.mainCommand.flag("help", ["-h", "--help"], {
        help: "Show this message and exit.",
      });
    }

    run(): void {
      const args = process.argv;
      if (args.length < 2) {
        console.error(
          "Error while parsing command line arguments: not enough arguments",
        );
        process.exit(-1);
      }
      const progname = path.basename(args[1]);
      const rest = args.slice(2);

      this.mainCommand.run(progname, [], rest, {});
    }

    subcommand<GN extends keyof any>(
      argKey: GN,
      name: string,
      args: SubcommandArgs = {},
    ): CommandGroup<GN, T> {
      const cmd = this.mainCommand.subcommand(argKey, name as string, args);
      return cmd as any;
    }

    requiredOption<N extends keyof any, V>(
      name: N,
      flagspec: string[],
      conv: Converter<V>,
      args: OptionArgs<V> = {},
    ): Program<PN, T & SubRecord<PN, N, V>> {
      this.mainCommand.requiredOption(name, flagspec, conv, args);
      return this as any;
    }

    maybeOption<N extends keyof any, V>(
      name: N,
      flagspec: string[],
      conv: Converter<V>,
      args: OptionArgs<V> = {},
    ): Program<PN, T & SubRecord<PN, N, V | undefined>> {
      this.mainCommand.maybeOption(name, flagspec, conv, args);
      return this as any;
    }

    /**
     * Add a flag (option without value) to the program.
     */
    flag<N extends string>(
      name: N,
      flagspec: string[],
      args: OptionArgs<boolean> = {},
    ): Program<PN, T & SubRecord<PN, N, boolean>> {
      this.mainCommand.flag(name, flagspec, args);
      return this as any;
    }

    /**
     * Add a required positional argument to the program.
     */
    requiredArgument<N extends keyof any, V>(
      name: N,
      conv: Converter<V>,
      args: ArgumentArgs<V> = {},
    ): Program<PN, T & SubRecord<PN, N, V>> {
      this.mainCommand.requiredArgument(name, conv, args);
      return this as any;
    }

    /**
     * Add an optional argument to the program.
     */
    maybeArgument<N extends keyof any, V>(
      name: N,
      conv: Converter<V>,
      args: ArgumentArgs<V> = {},
    ): Program<PN, T & SubRecord<PN, N, V | undefined>> {
      this.mainCommand.maybeArgument(name, conv, args);
      return this as any;
    }

    action(f: ActionFn<T>): void {
      this.mainCommand.action(f);
    }
  }

  export type GetArgType<T> = T extends Program<any, infer AT>
    ? AT
    : T extends CommandGroup<any, infer AT>
    ? AT
    : any;

  export function program<PN extends keyof any>(
    argKey: PN,
    args: ProgramArgs = {},
  ): Program<PN, {}> {
    return new Program(argKey as string, args);
  }

  export function prompt(question: string): Promise<string> {
    const stdinReadline = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise<string>((resolve, reject) => {
      stdinReadline.question(question, (res) => {
        resolve(res);
        stdinReadline.close();
      });
    });
  }
}
