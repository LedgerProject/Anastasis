# This file is placed in the public domain.

# Detect the Python version in a portable way.
# 

import sys

sys.stderr.write("info: running with python " + str(sys.version_info) + "\n")

if sys.version_info.major < 3 or sys.version_info.minor < 7:
    sys.stderr.write("error: python>=3.7 must be available as the python3 executable\n")
    sys.exit(1)
