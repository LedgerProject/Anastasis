# This Makefile.am is in the public domain
AM_CPPFLAGS = -I$(top_srcdir)/src/include -I$(top_srcdir)/src/backend -I$(top_srcdir)/src/lib

if USE_COVERAGE
  AM_CFLAGS = --coverage -O0
  XLIB = -lgcov
endif

lib_LTLIBRARIES = \
  libanastasistesting.la

libanastasistesting_la_LDFLAGS = \
  -version-info 0:0:0 \
  -no-undefined
libanastasistesting_la_SOURCES = \
  testing_api_cmd_policy_store.c \
  testing_api_cmd_truth_store.c \
  testing_api_cmd_policy_lookup.c \
  testing_api_cmd_keyshare_lookup.c \
  testing_api_cmd_config.c \
  testing_api_helpers.c \
  testing_api_trait_account_pub.c \
  testing_api_trait_account_priv.c \
  testing_api_trait_eks.c \
  testing_api_trait_payment_secret.c \
  testing_api_trait_truth_key.c \
  testing_api_trait_truth_uuid.c \
  testing_api_trait_hash.c \
  testing_api_trait_salt.c \
  testing_api_trait_code.c \
  testing_cmd_truth_upload.c \
  testing_cmd_policy_create.c \
  testing_cmd_secret_share.c \
  testing_cmd_recover_secret.c \
  testing_cmd_challenge_answer.c \
  testing_trait_truth.c \
  testing_trait_policy.c \
  testing_trait_core_secret.c \
  testing_trait_challenge.c
libanastasistesting_la_LIBADD = \
  $(top_builddir)/src/restclient/libanastasisrest.la \
  $(top_builddir)/src/lib/libanastasis.la \
  $(top_builddir)/src/util/libanastasisutil.la \
  -ltalerexchange \
  -ltalermerchant \
  -ltalerjson \
  -ltalerutil \
  -lgnunetcurl \
  -lgnunetjson \
  -lgnunetutil \
  -ljansson \
  -luuid \
  -ltalertesting \
  $(XLIB)


check_PROGRAMS = \
  test_anastasisrest_api \
  test_anastasis

AM_TESTS_ENVIRONMENT=export ANASTASIS_PREFIX=$${ANASTASIS_PREFIX:-@libdir@};export PATH=$${ANASTASIS_PREFIX:-@prefix@}/bin:$$PATH;unset XDG_DATA_HOME;unset XDG_CONFIG_HOME;
TESTS = \
  $(check_PROGRAMS)

test_anastasisrest_api_SOURCES = \
  test_anastasis_api.c
test_anastasisrest_api_LDADD = \
  libanastasistesting.la \
  -ltalermerchanttesting \
  -ltalertesting \
  -lgnunetutil \
  $(XLIB)

test_anastasis_SOURCES = \
  test_anastasis.c
test_anastasis_LDADD = \
  libanastasistesting.la \
  -ltalermerchanttesting \
  -ltalertesting \
  -ltalerexchange \
  -lgnunetutil \
  $(XLIB)

EXTRA_DIST = \
  test_anastasis_api.conf \
  test_anastasis_api_home/.config/taler/exchange/account-2.json \
  test_anastasis_api_home/.local/share/taler/exchange/offline-keys/master.priv \
  sms_authentication.sh

MOSTLYCLEANFILES = \
  test_anastasis_api_home/.local/share/taler/exchange/offline-keys/secm_tofus.pub
