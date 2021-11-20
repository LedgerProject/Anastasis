# This configure.py file is places in the public domain.

# Configure the build directory.
# This file is invoked by './configure' and should usually not be invoked
# manually.

import talerbuildconfig as tbc
import sys
import shutil

if getattr(tbc, "serialversion", 0) < 2:
    print("talerbuildconfig outdated, please update the build-common submodule and/or bootstrap")
    sys.exit(1)

b = tbc.BuildConfig()
b.enable_prefix()
b.enable_configmk()
b.add_tool(tbc.PosixTool("make"))
b.add_tool(tbc.PosixTool("zip"))
b.add_tool(tbc.PosixTool("find"))
b.add_tool(tbc.PosixTool("jq"))
b.add_tool(tbc.NodeJsTool(version_spec=">=12"))
b.add_tool(tbc.GenericTool("npm"))
b.add_tool(tbc.GenericTool("pnpm", hint="Use 'sudo npm install -g pnpm' to install."))
b.run()

print("copying Makefile")
shutil.copyfile("build-system/Makefile", "Makefile")
