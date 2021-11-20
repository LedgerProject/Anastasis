# This Makefile.am is in the public domain
AM_CPPFLAGS = -I$(top_srcdir)/src/include -I$(top_srcdir)/src/backend -I$(top_srcdir)/src/lib

if USE_COVERAGE
  AM_CFLAGS = --coverage -O0
  XLIB = -lgcov
endif

lib_LTLIBRARIES = \
  libanastasis.la

libanastasis_la_LDFLAGS = \
  -version-info 0:0:0 \
  -no-undefined
libanastasis_la_SOURCES = \
  anastasis_backup.c \
  anastasis_recovery.c
libanastasis_la_LIBADD = \
  $(top_builddir)/src/util/libanastasisutil.la \
  $(top_builddir)/src/restclient/libanastasisrest.la \
  -ltalerutil \
  -ltalermerchant \
  -lgnunetjson \
  -lgnunetutil \
  -ljansson \
  -lz \
  $(XLIB)
