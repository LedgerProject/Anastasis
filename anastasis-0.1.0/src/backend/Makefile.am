# This Makefile.am is in the public domain
AM_CPPFLAGS = -I$(top_srcdir)/src/include

pkgcfgdir = $(prefix)/share/anastasis/config.d/

if USE_COVERAGE
  AM_CFLAGS = --coverage -O0
  XLIB = -lgcov
endif

pkgcfg_DATA = \
  anastasis.conf

bin_PROGRAMS = \
  anastasis-httpd

anastasis_httpd_SOURCES = \
  anastasis-httpd.c anastasis-httpd.h \
  anastasis-httpd_mhd.c anastasis-httpd_mhd.h \
  anastasis-httpd_policy.c anastasis-httpd_policy.h \
  anastasis-httpd_policy_upload.c \
  anastasis-httpd_truth.c anastasis-httpd_truth.h \
  anastasis-httpd_terms.c anastasis-httpd_terms.h \
  anastasis-httpd_config.c anastasis-httpd_config.h \
  anastasis-httpd_truth_upload.c

anastasis_httpd_LDADD = \
  $(top_builddir)/src/util/libanastasisutil.la \
  $(top_builddir)/src/stasis/libanastasisdb.la \
  $(top_builddir)/src/authorization/libanastasisauthorization.la \
  -ljansson \
  -ltalermerchant \
  -ltalermhd \
  -ltalerjson \
  -ltalerutil \
  -lgnunetcurl \
  -lgnunetrest \
  -lgnunetjson \
  -lgnunetutil \
  -lmicrohttpd \
  -luuid \
  $(XLIB)

EXTRA_DIST = \
  $(pkgcfg_DATA)
