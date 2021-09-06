# This Makefile.am is in the public domain
AM_CPPFLAGS = -I$(top_srcdir)/src/include

if USE_COVERAGE
  AM_CFLAGS = --coverage -O0
  XLIB = -lgcov
endif

lib_LTLIBRARIES = \
  libanastasiseufin.la

libanastasiseufin_la_LDFLAGS = \
  -version-info 0:0:0 \
  -no-undefined
libanastasiseufin_la_SOURCES = \
  lae_common.c lae_common.h \
  lae_credit.c \
  lae_parse.c
libanastasiseufin_la_LIBADD = \
  -ltalerjson \
  -ltalercurl \
  -ltalerutil \
  -lgnunetcurl \
  -lgnunetjson \
  -lgnunetutil \
  -ljansson \
  $(LIBGNURLCURL_LIBS) \
  $(XLIB)
