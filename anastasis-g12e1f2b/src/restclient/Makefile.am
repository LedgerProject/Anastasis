# This Makefile.am is in the public domain
AM_CPPFLAGS = -I$(top_srcdir)/src/include -I$(top_srcdir)/src/backend -I$(top_srcdir)/src/lib

if USE_COVERAGE
  AM_CFLAGS = --coverage -O0
  XLIB = -lgcov
endif

.NOTPARALLEL:

lib_LTLIBRARIES = \
  libanastasisrest.la

libanastasisrest_la_LDFLAGS = \
  -version-info 0:0:0 \
  -no-undefined
libanastasisrest_la_SOURCES = \
  anastasis_api_config.c \
  anastasis_api_policy_store.c \
  anastasis_api_truth_store.c \
  anastasis_api_policy_lookup.c \
  anastasis_api_keyshare_lookup.c \
  anastasis_api_curl_defaults.c anastasis_api_curl_defaults.h
libanastasisrest_la_LIBADD = \
  -lgnunetcurl \
  -lgnunetjson \
  -lgnunetutil \
  -ljansson \
  -ltalerjson \
  -ltalerutil \
  -ltalermerchant \
  -ltalerjson \
  $(XLIB)

if HAVE_LIBCURL
libanastasisrest_la_LIBADD += -lcurl
else
if HAVE_LIBGNURL
libanastasisrest_la_LIBADD += -lgnurl
endif
endif

