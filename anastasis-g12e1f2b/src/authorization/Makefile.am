# This Makefile.am is in the public domain
AM_CPPFLAGS = -I$(top_srcdir)/src/include

cfgdir = $(prefix)/share/anastasis/config.d/

cfg_DATA = \
  authorization-email.conf


SUBDIRS = libanastasiseufin .

pkgcfgdir = $(prefix)/share/anastasis/config.d/
plugindir = $(libdir)/anastasis
pkgdatadir= $(prefix)/share/anastasis/

pkgdata_DATA = \
  authorization-email-messages.json \
  authorization-iban-messages.json \
  authorization-post-messages.json \
  authorization-sms-messages.json

EXTRA_DIST = \
  $(pkgdata_DATA) \
  $(cfg_DATA) \
  $(bin_SCRIPTS) \
  iban.h iban.c


if USE_COVERAGE
  AM_CFLAGS = --coverage -O0
  XLIB = -lgcov
endif

bin_PROGRAMS = \
  anastasis-helper-authorization-iban

bin_SCRIPTS = \
  anastasis-authorization-email.sh

anastasis_helper_authorization_iban_SOURCES = \
  anastasis-helper-authorization-iban.c
anastasis_helper_authorization_iban_LDADD = \
  $(top_builddir)/src/stasis/libanastasisdb.la \
  $(top_builddir)/src/authorization/libanastasiseufin/libanastasiseufin.la \
  $(top_builddir)/src/util/libanastasisutil.la \
  -ltalermhd \
  -ltalerutil \
  -lgnunetcurl \
  -lgnunetutil \
  -ljansson \
  -lmicrohttpd \
  -lpthread


lib_LTLIBRARIES = \
  libanastasisauthorization.la

libanastasisauthorization_la_SOURCES = \
  anastasis_authorization_plugin.c
libanastasisauthorization_la_LIBADD = \
  $(LTLIBINTL)
libanastasisauthorization_la_LDFLAGS = \
  -ltalerutil \
  -lgnunetutil \
  -lmicrohttpd \
  -lltdl \
  $(XLIB)

plugin_LTLIBRARIES = \
  libanastasis_plugin_authorization_email.la \
  libanastasis_plugin_authorization_file.la \
  libanastasis_plugin_authorization_iban.la \
  libanastasis_plugin_authorization_post.la \
  libanastasis_plugin_authorization_sms.la \
  libanastasis_plugin_authorization_totp.la


libanastasis_plugin_authorization_file_la_SOURCES = \
  anastasis_authorization_plugin_file.c
libanastasis_plugin_authorization_file_la_LIBADD = \
  $(LTLIBINTL)
libanastasis_plugin_authorization_file_la_LDFLAGS = \
  $(ANASTASIS_PLUGIN_LDFLAGS) \
  $(top_builddir)/src/stasis/libanastasisdb.la \
  -ltalerjson \
  -ltalermhd \
  -ltalerutil \
  -lgnunetjson \
  -lgnunetutil \
  -lmicrohttpd \
  -ljansson \
  $(XLIB)

libanastasis_plugin_authorization_email_la_SOURCES = \
  anastasis_authorization_plugin_email.c
libanastasis_plugin_authorization_email_la_LIBADD = \
  $(LTLIBINTL)
libanastasis_plugin_authorization_email_la_LDFLAGS = \
  $(ANASTASIS_PLUGIN_LDFLAGS) \
  $(top_builddir)/src/stasis/libanastasisdb.la \
  -ltalerjson \
  -ltalermhd \
  -ltalerutil \
  -lgnunetjson \
  -lgnunetutil \
  -lmicrohttpd \
  -ljansson \
  $(XLIB)

libanastasis_plugin_authorization_iban_la_SOURCES = \
  anastasis_authorization_plugin_iban.c
libanastasis_plugin_authorization_iban_la_LIBADD = \
  $(LTLIBINTL)
libanastasis_plugin_authorization_iban_la_LDFLAGS = \
  $(ANASTASIS_PLUGIN_LDFLAGS) \
  $(top_builddir)/src/stasis/libanastasisdb.la \
  -ltalerjson \
  -ltalermhd \
  -ltalerutil \
  -lgnunetjson \
  -lgnunetutil \
  -lmicrohttpd \
  -ljansson \
  $(XLIB)

libanastasis_plugin_authorization_post_la_SOURCES = \
  anastasis_authorization_plugin_post.c
libanastasis_plugin_authorization_post_la_LIBADD = \
  $(LTLIBINTL)
libanastasis_plugin_authorization_post_la_LDFLAGS = \
  $(ANASTASIS_PLUGIN_LDFLAGS) \
  $(top_builddir)/src/stasis/libanastasisdb.la \
  -ltalerjson \
  -ltalermhd \
  -ltalerutil \
  -lgnunetjson \
  -lgnunetutil \
  -lmicrohttpd \
  -ljansson \
  $(XLIB)

libanastasis_plugin_authorization_sms_la_SOURCES = \
  anastasis_authorization_plugin_sms.c
libanastasis_plugin_authorization_sms_la_LIBADD = \
  $(LTLIBINTL)
libanastasis_plugin_authorization_sms_la_LDFLAGS = \
  $(ANASTASIS_PLUGIN_LDFLAGS) \
  $(top_builddir)/src/stasis/libanastasisdb.la \
  -ltalerjson \
  -ltalermhd \
  -ltalerutil \
  -lgnunetjson \
  -lgnunetutil \
  -ljansson \
  -lmicrohttpd \
  $(XLIB)


libanastasis_plugin_authorization_totp_la_SOURCES = \
  anastasis_authorization_plugin_totp.c
libanastasis_plugin_authorization_totp_la_LIBADD = \
  $(LTLIBINTL)
libanastasis_plugin_authorization_totp_la_LDFLAGS = \
  $(ANASTASIS_PLUGIN_LDFLAGS) \
  $(top_builddir)/src/stasis/libanastasisdb.la \
  $(top_builddir)/src/util/libanastasisutil.la \
  -ltalerjson \
  -ltalermhd \
  -ltalerutil \
  -lgnunetjson \
  -lgnunetutil \
  -ljansson \
  -lmicrohttpd \
  -lgcrypt \
  $(XLIB)
