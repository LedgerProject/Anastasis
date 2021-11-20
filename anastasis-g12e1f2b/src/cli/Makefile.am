# This Makefile.am is in the public domain
AM_CPPFLAGS = -I$(top_srcdir)/src/include

bin_PROGRAMS = \
  anastasis-reducer

if USE_COVERAGE
  AM_CFLAGS = --coverage -O0
  XLIB = -lgcov
endif

check_SCRIPTS = \
  test_anastasis_reducer_initialize_state.sh \
  test_anastasis_reducer_select_continent.sh \
  test_anastasis_reducer_select_country.sh \
  test_anastasis_reducer_backup_enter_user_attributes.sh \
  test_anastasis_reducer_add_authentication.sh \
  test_anastasis_reducer_done_authentication.sh \
  test_anastasis_reducer_done_policy_review.sh \
  test_anastasis_reducer_enter_secret.sh \
  test_anastasis_reducer_recovery_enter_user_attributes.sh \
  test_iban.sh


AM_TESTS_ENVIRONMENT=export ANASTASIS_PREFIX=$${ANASTASIS_PREFIX:-@libdir@};export PATH=$${ANASTASIS_PREFIX:-@prefix@}/bin:$$PATH;unset XDG_DATA_HOME;unset XDG_CONFIG_HOME;

TESTS = \
 $(check_SCRIPTS)

EXTRA_DIST = \
  $(check_SCRIPTS) \
  test_reducer.conf \
  test_free_reducer.conf \
  test_anastasis_reducer_1.conf \
  test_anastasis_reducer_2.conf \
  test_anastasis_reducer_3.conf \
  test_anastasis_reducer_4.conf \
  resources/00-backup.json \
  resources/01-backup.json \
  resources/02-backup.json \
  resources/03-backup.json \
  resources/04-backup.json \
  resources/05-backup.json \
  resources/06-backup.json \
  resources/00-recovery.json \
  resources/01-recovery.json \
  resources/02-recovery.json

anastasis_reducer_SOURCES = \
  anastasis-cli-redux.c
anastasis_reducer_LDADD = \
  $(top_builddir)/src/util/libanastasisutil.la \
  $(top_builddir)/src/reducer/libanastasisredux.la \
  -ltalerjson \
  -ltalerutil \
  -lgnunetjson \
  -lgnunetcurl \
  -lgnunetutil \
  -ljansson \
  $(XLIB)
