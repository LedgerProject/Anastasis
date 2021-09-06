# This Makefile.am is in the public domain
AM_CPPFLAGS = -I$(top_srcdir)/src/include

plugindir = $(libdir)/anastasis

if HAVE_POSTGRESQL
plugin_LTLIBRARIES = \
  libanastasis_plugin_db_postgres.la
endif

if USE_COVERAGE
  AM_CFLAGS = --coverage -O0
  XLIB = -lgcov
endif

sqldir = $(prefix)/share/anastasis/sql/

sql_DATA = \
  stasis-0000.sql \
  stasis-0001.sql \
  drop0001.sql

pkgcfgdir = $(prefix)/share/anastasis/config.d/

pkgcfg_DATA = \
  stasis-postgres.conf

bin_PROGRAMS = \
  anastasis-dbinit

anastasis_dbinit_SOURCES = \
  anastasis-dbinit.c

anastasis_dbinit_LDADD = \
  $(LIBGCRYPT_LIBS) \
  libanastasisdb.la \
  $(top_builddir)/src/util/libanastasisutil.la \
  -lgnunetutil \
  -ltalerutil \
  -ltalerpq \
  $(XLIB)


lib_LTLIBRARIES = \
  libanastasisdb.la

libanastasisdb_la_SOURCES = \
  anastasis_db_plugin.c
libanastasisdb_la_LIBADD = \
  -lgnunetpq \
  -lpq \
  -lgnunetutil \
  -lltdl \
  $(XLIB)
libanastasisdb_la_LDFLAGS = \
   $(POSTGRESQL_LDFLAGS) \
   -version-info 2:0:0 \
   -no-undefined

libanastasis_plugin_db_postgres_la_SOURCES = \
  plugin_anastasis_postgres.c
libanastasis_plugin_db_postgres_la_LIBADD = \
  $(LTLIBINTL)
libanastasis_plugin_db_postgres_la_LDFLAGS = \
  $(top_builddir)/src/util/libanastasisutil.la \
  $(ANASTASIS_PLUGIN_LDFLAGS) \
  -lgnunetpq \
  -lpq \
  -ltalerpq \
  -ltalerutil \
  -lgnunetutil \
  $(XLIB)

check_PROGRAMS = \
 $(TESTS)

test_anastasis_db_postgres_SOURCES = \
  test_anastasis_db.c
test_anastasis_db_postgres_LDFLAGS = \
  $(top_builddir)/src/util/libanastasisutil.la \
  libanastasisdb.la \
  -lgnunetutil \
  -lgnunetpq \
  -ltalerutil \
  -ltalerpq \
  -luuid \
  $(XLIB)

AM_TESTS_ENVIRONMENT=export ANASTASIS_PREFIX=$${ANASTASIS_PREFIX:-@libdir@};export PATH=$${ANASTASIS_PREFIX:-@prefix@}/bin:$$PATH;unset XDG_DATA_HOME;unset XDG_CONFIG_HOME;
TESTS = \
  test_anastasis_db-postgres

EXTRA_DIST = \
  test_anastasis_db_postgres.conf \
  $(pkgcfg_DATA) \
  $(sql_DATA)
