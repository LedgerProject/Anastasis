# This Makefile is in the public domain

if DOC_ONLY
if ENABLE_DOC
  SUBDIRS = . doc po
else
  SUBDIRS = . po
endif
else
if ENABLE_DOC
  SUBDIRS = . contrib src doc po
else
  SUBDIRS = . contrib src doc po
endif
endif

@DX_RULES@

ACLOCAL_AMFLAGS = -I m4
EXTRA_DIST = \
 config.rpath  \
 AUTHORS \
 COPYING.AGPL
