# This Makefile.am is in the public domain
AM_CPPFLAGS = -I$(top_srcdir)/src/include $(LIBGCRYPT_CFLAGS)

if USE_COVERAGE
  AM_CFLAGS = --coverage -O0
  XLIB = -lgcov
endif

pkgcfgdir = $(prefix)/share/anastasis/config.d/

pkgcfg_DATA = \
  paths.conf

EXTRA_DIST = \
  anastasis-config.in \
  $(pkgcfg_DATA)

edit_script = $(SED) -e 's,%libdir%,$(libdir),'g $(NULL)

anastasis-config: anastasis-config.in
	rm -f $@ $@.tmp && \
	$(edit_script) $< >$@.tmp && \
	chmod a-w+x $@.tmp && \
	mv $@.tmp $@

bin_SCRIPTS = \
  anastasis-config

lib_LTLIBRARIES = \
  libanastasisutil.la

libanastasisutil_la_SOURCES = \
  anastasis_crypto.c \
  os_installation.c
libanastasisutil_la_LIBADD = \
  -lgnunetutil \
  $(LIBGCRYPT_LIBS) \
  -ljansson \
  -ltalerutil \
  $(XLIB)
libanastasisutil_la_LDFLAGS = \
  -version-info 0:0:0 \
  -no-undefined

check_PROGRAMS = \
  test_anastasis_crypto

TESTS = \
 $(check_PROGRAMS)

test_anastasis_crypto_SOURCES = \
  test_anastasis_crypto.c
test_anastasis_crypto_LDADD = \
  -lgnunetutil \
  -ltalerutil \
  libanastasisutil.la \
  $(XLIB)
