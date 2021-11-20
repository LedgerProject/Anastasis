# This file is part of TALER
# (C) 2019 GNUnet e.V.
#
# Authors:
# Author: ng0 <ng0@taler.net>
# Author: Florian Dold <dold@taler.net>
#
# Permission to use, copy, modify, and/or distribute this software for any
# purpose with or without fee is hereby granted.
#
# THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
# WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
# MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE
# LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES
# OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
# WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
# ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
# THIS SOFTWARE.
#
# SPDX-License-Identifier: 0BSD

import sys

if not (sys.version_info.major == 3 and sys.version_info.minor >= 7):
    print("This script requires Python 3.7 or higher!")
    print("You are using Python {}.{}.".format(sys.version_info.major, sys.version_info.minor))
    sys.exit(1)

from abc import ABC
import argparse
import os
import sys
import shlex
import logging
from distutils.spawn import find_executable
import subprocess
from dataclasses import dataclass
import semver
from pathlib import Path

"""
This module aims to replicate a small GNU Coding Standards
configure script, taylored at projects in GNU Taler. We hope it
can be of use outside of GNU Taler, hence it is dedicated to the
public domain ('0BSD').
It takes a couple of arguments on the commandline equivalent to
configure by autotools, in addition some environment variables
xan take precedence over the switches. In the absence of switches,
/usr/local is assumed as the PREFIX.
When  all data from tests are gathered, it generates a config.mk
Makefile fragement, which is the processed by a Makefile (usually) in
GNU Make format.
"""

# Should be incremented each time we add some functionality
serialversion = 2


# TODO: We need a smallest version argument.

class Tool(ABC):
    def args(self, parser):
        ...

    def check(self, buildconfig):
        ...

class Plugin(ABC):
    def args(self, parser):
        ...

class BuildConfig:
    def __init__(self):
        # Pairs of (key, value) for config.mk variables
        self.make_variables = []
        self.tools = []
        self.tool_results = {}
        self.plugins = []
        self.args = None
        self.prefix_enabled = False
        self.configmk_enabled = False

    def add_tool(self, tool):
        """Deprecated.  Prefer the 'use' method."""
        if isinstance(tool, Tool):
            self.tools.append(tool)
        else:
            raise Exception("Not a 'Tool' instance: " + repr(tool))

    def use(self, plugin):
        if isinstance(plugin, Plugin):
            self.plugins.append(plugin)
        elif isinstance(plugin, Tool):
            self.tools.append(plugin)
        else:
            raise Exception("Not a 'Plugin' or 'Tool' instance: " + repr(plugin))

    def _set_tool(self, name, value, version=None):
        self.tool_results[name] = (value, version)

    def enable_prefix(self):
        """If enabled, process the --prefix argument."""
        self.prefix_enabled = True

    def _warn(self, msg):
        print("Warning", msg)

    def _error(self, msg):
        print("Error", msg)

    def enable_configmk(self):
        """If enabled, output the config.mk makefile fragment."""
        self.configmk_enabled = True

    def run(self):
        parser = argparse.ArgumentParser()
        if self.prefix_enabled:
            parser.add_argument(
                "--prefix",
                type=str,
                default="/usr/local",
                help="Directory prefix for installation",
            )
        for tool in self.tools:
            tool.args(parser)

        for plugin in self.plugins:
            plugin.args(parser)

        args = self.args = parser.parse_args()

        for plugin in self.plugins:
            res = plugin.run(self)

        for tool in self.tools:
            res = tool.check(self)
            if not res:
                print(f"Error: tool '{tool.name}' not available")
                if hasattr(tool, "hint"):
                    print(f"Hint: {tool.hint}")
                sys.exit(1)
            if hasattr(tool, "version_spec"):
                sv = semver.SimpleSpec(tool.version_spec)
                path, version = self.tool_results[tool.name]
                if not sv.match(semver.Version(version)):
                    print(f"Error: Tool '{tool.name}' has version '{version}', but we require '{tool.version_spec}'")
                    sys.exit(1)


        for tool in self.tools:
            path, version = self.tool_results[tool.name]
            if version is None:
                print(f"found {tool.name} as {path}")
            else:
                print(f"found {tool.name} as {path} (version {version})")

        if self.configmk_enabled:
            d = Path(os.environ.get("TALERBUILDSYSTEMDIR", "."))
            d.mkdir(parents=True, exist_ok=True)
            with open(d / "config.mk", "w") as f:
                print("writing config.mk")
                f.write("# this makefile fragment is autogenerated by configure.py\n")
                if self.prefix_enabled:
                    f.write(f"prefix = {args.prefix}\n")
                for tool in self.tools:
                    path, version = self.tool_results[tool.name]
                    f.write(f"{tool.name} = {path}\n")
                for plugin in self.plugins:
                    d = plugin.get_configmk(self)
                    for k, v in d.items():
                        f.write(f"{k} = {v}\n")


def existence(name):
    return find_executable(name) is not None


class Option(Plugin):

    def __init__(self, optname, help, required=True, default=None):
        self.optname = optname
        self.help = help
        self.default = default
        self.required = required
        self._arg = None

    def args(self, parser):
        parser.add_argument("--" + self.optname, action="store")

    def run(self, buildconfig):
        arg = getattr(buildconfig.args, self.optname)
        if arg is None:
            if self.required:
                print(f"required option '--{self.optname}' missing")
                sys.exit(1)
            else:
                arg = self.default
        self._arg = arg

    def get_configmk(self, buildconfig):
        key = "opt_" + self.optname
        return {"opt_" + self.optname: self._arg}


class YarnTool(Tool):
    name = "yarn"
    description = "The yarn package manager for node"

    def args(self, parser):
        parser.add_argument("--with-yarn", action="store")

    def check(self, buildconfig):
        yarn_arg = buildconfig.args.with_yarn
        if yarn_arg is not None:
            buildconfig._set_tool("yarn", yarn_arg)
            return True
        if existence("yarn"):
            p1 = subprocess.run(
                ["yarn", "help"], stderr=subprocess.STDOUT, stdout=subprocess.PIPE
            )
            if "No such file or directory" in p1.stdout.decode("utf-8"):
                if existence("cmdtest"):
                    buildconfig._warn(
                        "cmdtest is installed, this can lead to known issues with yarn."
                    )
                buildconfig._error(
                    "You seem to have the wrong kind of 'yarn' installed.\n"
                    "Please remove the conflicting binary before proceeding"
                )
                return False
            yarn_version = tool_version("yarn --version")
            buildconfig._set_tool("yarn", "yarn", yarn_version)
            return True
        elif existence("yarnpkg"):
            yarn_version = tool_version("yarnpkg --version")
            buildconfig._set_tool("yarn", "yarnpkg", yarn_version)
            return True
        return False


def tool_version(name):
    return subprocess.getstatusoutput(name)[1]


class EmscriptenTool:
    def args(self, parser):
        pass

    def check(self, buildconfig):
        if existence("emcc"):
            emscripten_version = tool_version("emcc --version")
            buildconfig._set_tool("emcc", "emcc", emscripten_version)
            return True
        return False

class PyToxTool(Tool):
    name ="tox"

    def args(self, parser):
        parser.add_argument(
            "--with-tox", type=str, help="name of the tox executable"
        )

    def check(self, buildconfig):
        # No suffix. Would probably be cheaper to do this in
        # the dict as well. We also need to check the python
        # version it was build against (TODO).
        if existence("tox"):
            import tox
            mypytox_version = tox.__version__
            buildconfig._set_tool("tox", "tox", mypytox_version)
            return True
        else:
            # Has suffix, try suffix. We know the names in advance,
            # so use a dictionary and iterate over it. Use enough names
            # to safe updating this for another couple of years.
            version_dict = {
                "3.0": "tox-3.0",
                "3.1": "tox-3.1",
                "3.2": "tox-3.2",
                "3.3": "tox-3.3",
                "3.4": "tox-3.4",
                "3.5": "tox-3.5",
                "3.6": "tox-3.6",
                "3.7": "tox-3.7",
                "3.8": "tox-3.8",
                "3.9": "tox-3.9",
                "4.0": "tox-4.0",
            }
            for key, value in version_dict.items():
                if existence(value):
                    # FIXME: This version reporting is slightly off
                    # FIXME: and only maps to the suffix.
                    import tox
                    mypytox_version = tox.__version__
                    buildconfig._set_tool("tox", value, mypytox_version)
                    return True


class YapfTool(Tool):
    name ="yapf"

    def args(self, parser):
        parser.add_argument(
            "--with-yapf", type=str, help="name of the yapf executable"
        )

    def check(self, buildconfig):
        # No suffix. Would probably be cheaper to do this in
        # the dict as well. We also need to check the python
        # version it was build against (TODO).
        if existence("yapf"):
            import yapf
            myyapf_version = yapf.__version__
            buildconfig._set_tool("yapf", "yapf", myyapf_version)
            return True
        else:
            # Has suffix, try suffix. We know the names in advance,
            # so use a dictionary and iterate over it. Use enough names
            # to safe updating this for another couple of years.
            version_dict = {
                "3.0": "yapf3.0",
                "3.1": "yapf3.1",
                "3.2": "yapf3.2",
                "3.3": "yapf3.3",
                "3.4": "yapf3.4",
                "3.5": "yapf3.5",
                "3.6": "yapf3.6",
                "3.7": "yapf3.7",
                "3.8": "yapf3.8",
                "3.9": "yapf3.9",
                "4.0": "yapf4.0",
                "4.1": "yapf-3.0",
                "4.2": "yapf-3.1",
                "4.3": "yapf-3.2",
                "4.4": "yapf-3.3",
                "4.5": "yapf-3.4",
                "4.6": "yapf-3.5",
                "4.7": "yapf-3.6",
                "4.8": "yapf-3.7",
                "4.9": "yapf-3.8",
                "5.0": "yapf-3.9",
                "5.1": "yapf-4.0",
            }
            for key, value in version_dict.items():
                if existence(value):
                    # FIXME: This version reporting is slightly off
                    # FIXME: and only maps to the suffix.
                    import yapf
                    myyapf_version = yapf.__version__
                    buildconfig._set_tool("yapf", value, myyapf_version)
                    return True


class PyBabelTool(Tool):
    name = "pybabel"

    def args(self, parser):
        parser.add_argument(
            "--with-pybabel", type=str, help="name of the pybabel executable"
        )

    def check(self, buildconfig):
        # No suffix. Would probably be cheaper to do this in
        # the dict as well. We also need to check the python
        # version it was build against (TODO).
        if existence("pybabel"):
            import babel
            pybabel_version = babel.__version__
            buildconfig._set_tool("pybabel", "pybabel", pybabel_version)
            return True
        else:
            # Has suffix, try suffix. We know the names in advance,
            # so use a dictionary and iterate over it. Use enough names
            # to safe updating this for another couple of years.
            #
            # Food for thought: If we only accept python 3.7 or higher,
            # is checking pybabel + pybabel-3.[0-9]* too much and could
            # be broken down to pybabel + pybabel-3.7 and later names?
            version_dict = {
                "3.0": "pybabel-3.0",
                "3.1": "pybabel-3.1",
                "3.2": "pybabel-3.2",
                "3.3": "pybabel-3.3",
                "3.4": "pybabel-3.4",
                "3.5": "pybabel-3.5",
                "3.6": "pybabel-3.6",
                "3.7": "pybabel-3.7",
                "3.8": "pybabel-3.8",
                "3.9": "pybabel-3.9",
                "4.0": "pybabel-4.0",
            }
            for key, value in version_dict.items():
                if existence(value):
                    # FIXME: This version reporting is slightly off
                    # FIXME: and only maps to the suffix.
                    pybabel_version = key
                    buildconfig._set_tool("pybabel", value, pybabel_version)
                    return True


class PythonTool(Tool):
    # This exists in addition to the files in sh, so that
    # the Makefiles can use this value instead.
    name = "python"

    def args(self, parser):
        parser.add_argument(
            "--with-python", type=str, help="name of the python executable"
        )

    def check(self, buildconfig):
        # No suffix. Would probably be cheaper to do this in
        # the dict as well. We need at least version 3.7.
        if existence("python") and (shlex.split(subprocess.getstatusoutput("python --version")[1])[1] >= '3.7'):
            # python might not be python3. It might not even be
            # python 3.x.
            python_version = shlex.split(subprocess.getstatusoutput("python --version")[1])[1]
            if python_version >= '3.7':
                buildconfig._set_tool("python", "python", python_version)
                return True
        else:
            # Has suffix, try suffix. We know the names in advance,
            # so use a dictionary and iterate over it. Use enough names
            # to safe updating this for another couple of years.
            #
            # Food for thought: If we only accept python 3.7 or higher,
            # is checking pybabel + pybabel-3.[0-9]* too much and could
            # be broken down to pybabel + pybabel-3.7 and later names?
            version_dict = {
		"3.7": "python3.7",
                "3.8": "python3.8",
                "3.9": "python3.9",
            }
            for key, value in version_dict.items():
                if existence(value):
                    python3_version = key
                    buildconfig._set_tool("python", value, python3_version)
                    return True


# TODO: Make this really optional, not use a hack ("true").
class BrowserTool(Tool):
    name = "browser"

    def args(self, parser):
        parser.add_argument(
            "--with-browser", type=str, help="name of your webbrowser executable"
        )

    def check(self, buildconfig):
        browser_dict = {
            "ice": "icecat",
            "ff": "firefox",
            "chg": "chrome",
            "ch": "chromium",
            "o": "opera",
            "t": "true"
        }
        if "BROWSER" in os.environ:
            buildconfig._set_tool("browser", os.environ["BROWSER"])
            return True
        for value in browser_dict.values():
            if existence(value):
                buildconfig._set_tool("browser", value)
                return True


class NodeJsTool(Tool):
    name = "node"
    hint = "If you are using Ubuntu Linux or Debian Linux, try installing the\nnode-legacy package or symlink node to nodejs."

    def __init__(self, version_spec):
        self.version_spec = version_spec

    def args(self, parser):
        pass

    def check(self, buildconfig):
        if not existence("node"):
            return False
        if (
            subprocess.getstatusoutput(
                "node -p 'process.exit(!(/v([0-9]+)/.exec(process.version)[1] >= 4))'"
            )[1]
            != ""
        ):
            buildconfig._warn("your node version is too old, use Node 4.x or newer")
            return False
        node_version = tool_version("node --version").lstrip("v")
        buildconfig._set_tool("node", "node", version=node_version)
        return True

class GenericTool(Tool):
    def __init__(self, name, hint=None, version_arg="-v"):
        self.name = name
        if hint is not None:
            self.hint = hint
        self.version_arg = version_arg

    def args(self, parser):
        pass

    def check(self, buildconfig):
        if not existence(self.name):
            return False
        vers = tool_version(f"{self.name} {self.version_arg}")
        buildconfig._set_tool(self.name, self.name, version=vers)
        return True


class PosixTool(Tool):
    def __init__(self, name):
        self.name = name

    def args(self, parser):
        pass

    def check(self, buildconfig):
        found = existence(self.name)
        if found:
            buildconfig._set_tool(self.name, self.name)
            return True
        return False
