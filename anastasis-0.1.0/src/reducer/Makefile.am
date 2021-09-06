# This Makefile.am is in the public domain
AM_CPPFLAGS = -I$(top_srcdir)/src/include -I$(top_srcdir)/src/backend -I$(top_srcdir)/src/lib

if USE_COVERAGE
  AM_CFLAGS = --coverage -O0
  XLIB = -lgcov
endif

.NOTPARALLEL:

lib_LTLIBRARIES = \
  libanastasisredux.la

libanastasisredux_la_LDFLAGS = \
  -version-info 0:0:0 \
  -no-undefined
libanastasisredux_la_SOURCES = \
  anastasis_api_redux.c anastasis_api_redux.h \
  anastasis_api_recovery_redux.c \
  anastasis_api_backup_redux.c \
  validation_CH_AHV.c \
  validation_CZ_BN.c \
  validation_DE_SVN.c \
  validation_DE_TIN.c \
  validation_IN_AADHAR.c \
  validation_IT_CF.c \
  validation_XX_SQUARE.c \
  validation_XY_PRIME.c
libanastasisredux_la_LIBADD = \
  $(top_builddir)/src/restclient/libanastasisrest.la \
  $(top_builddir)/src/lib/libanastasis.la \
  $(top_builddir)/src/util/libanastasisutil.la \
  -lgnunetjson \
  -lgnunetcurl \
  -lgnunetutil \
  -ltalermhd \
  -ltalerutil \
  -ltalerexchange \
  -ltalermerchant \
  -ltalerjson \
  -ljansson \
  -lgcrypt \
  -ldl \
  -lm \
  $(XLIB)
