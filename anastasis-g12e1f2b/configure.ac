#                                               -*- Autoconf -*-
# Process this file with autoconf to produce a configure script.
#
# This configure file is in the public domain

AC_PREREQ([2.69])
AC_INIT([anastasis], [0.2.0], [taler-bug@gnu.org])
AC_CONFIG_SRCDIR([src/backend/anastasis-httpd.c])
AC_CONFIG_HEADERS([anastasis_config.h])
# support for non-recursive builds
AM_INIT_AUTOMAKE([subdir-objects 1.9 tar-pax])

# pretty build rules
AM_SILENT_RULES([yes])

AC_CONFIG_MACRO_DIR([m4])

AC_PROG_AWK
AC_PROG_CC_C99
AC_PROG_OBJC
AC_PROG_INSTALL
AC_PROG_LN_S
AC_PROG_MAKE_SET
AM_PROG_CC_C_O

LT_INIT([disable-static dlopen])

DX_INIT_DOXYGEN([anastasis],,,
DX_PS_FEATURE(OFF),
DX_PDF_FEATURE(OFF),
DX_RTF_FEATURE(OFF),
DX_CHI_FEATURE(OFF),
DX_XML_FEATURE(OFF))

AC_MSG_CHECKING([whether to compile documentation ONLY])
AC_ARG_ENABLE([only-doc],
  [AS_HELP_STRING([--enable-only-doc], [only compile Taler documentation])],
  [doc_only=${enableval}],
  [doc_only=no])
AC_MSG_RESULT($doc_only)
AM_CONDITIONAL([DOC_ONLY], [test "$doc_only" = "yes"])


# Not indented as it covers most of the file...
AS_IF([test "x$doc_only" != xyes],[


# Checks for programs.
AC_PROG_CC
AC_PROG_CC_C99

# check for gettext
AM_GNU_GETTEXT([external])
AM_GNU_GETTEXT_VERSION([0.19.8])


CFLAGS="-Wall $CFLAGS"

# Checks for header files.
AC_CHECK_HEADERS([stdint.h stdlib.h string.h unistd.h])

ANASTASIS_LIB_LDFLAGS="-export-dynamic -no-undefined"
ANASTASIS_PLUGIN_LDFLAGS="-export-dynamic -avoid-version -module -no-undefined"

AC_SUBST(ANASTASIS_LIB_LDFLAGS)
AC_SUBST(ANASTASIS_PLUGIN_LDFLAGS)


# check for libgnurl
# libgnurl
LIBGNURL_CHECK_CONFIG(,7.34.0,gnurl=1,gnurl=0)
AS_IF([test "x$gnurl" = x1],[
	AM_CONDITIONAL(HAVE_LIBGNURL, true)
	AC_DEFINE([HAVE_LIBGNURL],[1],[Have libgnurl])
],[
	AM_CONDITIONAL(HAVE_LIBGNURL, false)
])

# libcurl-gnutls
LIBCURL_CHECK_CONFIG(,7.34.0,[curl=true],[curl=false])
AS_IF([test "x$curl" = xtrue],
      [LDFLAGS="-L$with_libcurl/lib $LDFLAGS"
       CPPFLAGS="-I$with_libcurl/include $CPPFLAGS"
       AC_CHECK_HEADERS([curl/curl.h],
                        [AC_CHECK_DECLS(CURLINFO_TLS_SESSION,
                         [curl=true],
                         [curl=false],
                         [[#include <curl/curl.h>]])],
                        [curl=false])
       # need libcurl-gnutls.so, everything else is not acceptable
       AC_CHECK_LIB([curl-gnutls],
                    [curl_easy_getinfo],,
                    [curl=false])])
       # cURL must support CURLINFO_TLS_SESSION, version >= 7.34

# Check for curl/curl.h and gnurl/curl.h so we can use #ifdef
# HAVE_CURL_CURL_H later (the above LIBCURL_CHECK_CONFIG accepted
# *either* header set).
AC_CHECK_HEADERS([curl/curl.h],,
  curl=false
  AC_CHECK_HEADERS([gnurl/curl.h],,
  gnurl=false))

# libgnurl
AS_IF([test "x$gnurl" = "x0"],
      [AS_IF([test "x$curl" = "x0"],
              [AC_MSG_NOTICE([NOTICE: libgnurl not found. taler-bank support will not be compiled.])],
              [AC_MSG_NOTICE([WARNING: libgnurl not found, trying to use libcurl-gnutls instead.])])])

AS_IF([test x$curl = xfalse],
       [AM_CONDITIONAL(HAVE_LIBCURL, false)
        AS_IF([test "x$gnurl" = "x0"],
              [AC_MSG_WARN([GNU Taler requires libcurl-gnutls  >= 7.34])])],
       [AM_CONDITIONAL(HAVE_LIBCURL, true)
	AC_DEFINE([HAVE_LIBCURL],[1],[Have CURL])])

# gcov compilation
AC_MSG_CHECKING(whether to compile with support for code coverage analysis)
AC_ARG_ENABLE([coverage],
              AS_HELP_STRING([--enable-coverage],
                             [compile the library with code coverage support]),
              [use_gcov=${enableval}],
              [use_gcov=no])
AC_MSG_RESULT($use_gcov)
AM_CONDITIONAL([USE_COVERAGE], [test "x$use_gcov" = "xyes"])


# Check for GNUnet's libgnunetutil.
libgnunetutil=0
AC_MSG_CHECKING([for libgnunetutil])
AC_ARG_WITH(gnunet,
            [AS_HELP_STRING([--with-gnunet=PFX], [base of GNUnet installation])],
            [AC_MSG_RESULT([given as $with_gnunet])],
            [AC_MSG_RESULT(not given)
             with_gnunet=yes])
AS_CASE([$with_gnunet],
        [yes], [],
        [no], [AC_MSG_ERROR([--with-gnunet is required])],
        [LDFLAGS="-L$with_gnunet/lib $LDFLAGS"
         CPPFLAGS="-I$with_gnunet/include $CPPFLAGS"])
AC_CHECK_HEADERS([gnunet/platform.h gnunet/gnunet_util_lib.h],
 [AC_CHECK_LIB([gnunetutil],
               [GNUNET_SCHEDULER_run],
               [libgnunetutil=1])],
 [],
 [#ifdef HAVE_GNUNET_PLATFORM_H
     #include <gnunet/platform.h>
  #endif])
AS_IF([test $libgnunetutil != 1],
  [AC_MSG_ERROR([[
***
*** You need libgnunetutil to build this program.
*** This library is part of GNUnet, available at
***   https://gnunet.org
*** ]])])


# test for postgres
AX_LIB_POSTGRESQL([9.3])
AS_IF([test "x$found_postgresql" = "xyes"],[postgres=true])
AM_CONDITIONAL(HAVE_POSTGRESQL, test x$postgres = xtrue)

libsodium=0
# test for libsodium >=1.018 (introduction of
# crypto_scalarmult_ed25519_base_noclamp API)
AC_CHECK_HEADER([sodium.h],
                [AC_CHECK_LIB([sodium], [crypto_core_ed25519_scalar_mul],
                              [libsodium=1])])

AS_IF([test x$libsodium = x0],
      [AC_MSG_ERROR([Anastasis requires libsodium >= 1.0.18.])])


# Check for Taler's libtalerutil
libtalerutil=0
AC_MSG_CHECKING([for libtalerutil])
AC_ARG_WITH(exchange,
            [AS_HELP_STRING([--with-exchange=PFX], [base of Taler EXCHANGE installation])],
            [AC_MSG_RESULT([given as $with_exchange])],
            [AC_MSG_RESULT(not given)
             with_exchange=yes])
AS_CASE([$with_exchange],
        [yes], [],
        [no], [AC_MSG_ERROR([--with-exchange is required])],
        [LDFLAGS="-L$with_exchange/lib $LDFLAGS"
         CPPFLAGS="-I$with_exchange/include $CPPFLAGS $POSTGRESQL_CPPFLAGS"])

CPPFLAGS="$CPPFLAGS $POSTGRESQL_CPPFLAGS"
LDFLAGS="$LDFLAGS -L/usr/local/lib"

# Require minimum libgcrypt version
need_libgcrypt_version=1.6.1
AC_DEFINE_UNQUOTED([NEED_LIBGCRYPT_VERSION], ["$need_libgcrypt_version"],
                                             [minimum version of libgcrypt required])
AM_PATH_LIBGCRYPT([$need_libgcrypt_version])

AC_CHECK_HEADERS([taler/taler_util.h],
 [AC_CHECK_LIB([talerutil],
               [TALER_b2s],
               [libtalerutil=1],
               [AC_MSG_ERROR([libtalerutil not found])])],
 [AC_MSG_ERROR([taler/taler_util.h not found])],
 [#include <taler/platform.h>])

# Check for Taler's libtalermerchant
libtalermerchant=0
AC_MSG_CHECKING([for libtalermerchant])
AC_ARG_WITH(merchant,
            [AS_HELP_STRING([--with-merchant=PFX], [base of Taler MERCHANT installation])],
            [AC_MSG_RESULT([given as $with_merchant])],
            [AC_MSG_RESULT(not given)
             with_merchant=yes])
AS_CASE([$with_merchant],
        [yes], [],
        [no], [AC_MSG_ERROR([--with-merchant is required])],
        [LDFLAGS="-L$with_merchant/lib $LDFLAGS"
         CPPFLAGS="-I$with_merchant/include $CPPFLAGS $POSTGRESQL_CPPFLAGS"])

AC_CHECK_HEADERS([taler/taler_merchant_service.h],
 [AC_CHECK_LIB([talermerchant],
               [TALER_MERCHANT_parse_pay_uri],
               [libtalermerchant=1],
               [AC_MSG_ERROR([libtalermerchant not found])])],
 [AC_MSG_ERROR([taler/taler_merchant_service.h found])],
 [#include <taler/platform.h>])




# check for libmicrohttpd
microhttpd=0
AC_MSG_CHECKING([for microhttpd])
AC_ARG_WITH([microhttpd],
            [AS_HELP_STRING([--with-microhttpd=PFX], [base of microhttpd installation])],
            [AC_MSG_RESULT([given as $with_microhttpd])],
            [AC_MSG_RESULT([not given])
             with_microhttpd=yes])
AS_CASE([$with_microhttpd],
        [yes], [],
        [no], [AC_MSG_ERROR([--with-microhttpd is required])],
        [LDFLAGS="-L$with_microhttpd/lib $LDFLAGS"
         CPPFLAGS="-I$with_microhttpd/include $CPPFLAGS"])
AC_CHECK_LIB(microhttpd,MHD_start_daemon,
  [AC_CHECK_HEADER([microhttpd.h],[microhttpd=1])])
AS_IF([test $microhttpd = 0],
  [AC_MSG_ERROR([[
***
*** You need libmicrohttpd to build this program.
*** ]])])

jansson=0
PKG_CHECK_MODULES([JANSSON], [jansson >= 2.3],
                  [LDFLAGS="$JANSSON_LIBS $LDFLAGS"
                   CPPFLAGS="$JANSSON_CFLAGS $CPPFLAGS"],
                  [AC_MSG_ERROR([[
***
*** You need libjansson to build this program.
***]])])

# logging
extra_logging=0
AC_ARG_ENABLE([logging],
   AS_HELP_STRING([--enable-logging@<:@=value@:>@],[Enable logging calls. Possible values: yes,no,verbose ('yes' is the default)]),
   [AS_IF([test "x$enableval" = "xyes"], [],
          [test "x$enableval" = "xno"], [AC_DEFINE([GNUNET_CULL_LOGGING],[],[Define to cull all logging calls])],
          [test "x$enableval" = "xverbose"], [extra_logging=1]
          [test "x$enableval" = "xveryverbose"], [extra_logging=2])
   ], [])
AC_DEFINE_UNQUOTED([GNUNET_EXTRA_LOGGING],[$extra_logging],[1 if extra logging is enabled, 2 for very verbose extra logging, 0 otherwise])

# version info
AC_PATH_PROG(gitcommand, git)
AC_MSG_CHECKING(for source being under a VCS)
git_version=
AS_IF([test ! "X$gitcommand" = "X"],
[
  git_version=$(cd $srcdir ; git rev-list --full-history --all --abbrev-commit | head -n 1 2>/dev/null)
])
AS_IF([test "X$git_version" = "X"],
  [
    vcs_name="no"
    vcs_version="\"release\""
  ],
  [
    vcs_name="yes, git-svn"
    vcs_version="\"git-$git_version\""
  ])
AC_MSG_RESULT($vcs_name)

AC_MSG_CHECKING(VCS version)
AC_MSG_RESULT($vcs_version)
AC_DEFINE_UNQUOTED(VCS_VERSION, [$vcs_version], [VCS revision/hash or tarball version])

# Checks for typedefs, structures, and compiler characteristics.
AC_TYPE_PID_T
AC_TYPE_SIZE_T
AC_TYPE_UINT16_T
AC_TYPE_UINT32_T
AC_TYPE_UINT64_T
AC_TYPE_INTMAX_T
AC_TYPE_UINTMAX_T

# Checks for library functions.
AC_CHECK_FUNCS([strdup])


AC_ARG_ENABLE([[doc]],
  [AS_HELP_STRING([[--disable-doc]], [do not build any documentation])], ,
    [enable_doc=yes])
test "x$enable_doc" = "xno" || enable_doc=yes
AM_CONDITIONAL([ENABLE_DOC], [test "x$enable_doc" = "xyes"])


],[  # this is about the doc-only if on top of the file

# logic if doc_only is set, make sure conditionals are still defined
AM_CONDITIONAL([HAVE_POSTGRESQL], [false])
AM_CONDITIONAL([HAVE_LIBCURL], [false])
AM_CONDITIONAL([HAVE_LIBGNURL], [false])
AM_CONDITIONAL([USE_COVERAGE], [false])
AM_CONDITIONAL([ENABLE_DOC], [true])


# end of 'doc_only'
])


# should experimental code be compiled (code that may not yet compile / have passing test cases)?
AC_MSG_CHECKING(whether to compile experimental code)
AC_ARG_ENABLE([experimental],
   [AS_HELP_STRING([--enable-experimental], [enable compiling experimental code])],
   [enable_experimental=${enableval}],
   [enable_experimental=no])
AC_MSG_RESULT($enable_experimental)
AM_CONDITIONAL([HAVE_EXPERIMENTAL], [test "x$enable_experimental" = "xyes"])


AC_CONFIG_FILES([
Makefile
contrib/Makefile
doc/Makefile
po/Makefile.in
src/Makefile
src/authorization/Makefile
src/authorization/libanastasiseufin/Makefile
src/backend/Makefile
src/cli/Makefile
src/include/Makefile
src/lib/Makefile
src/util/Makefile
src/reducer/Makefile
src/restclient/Makefile
src/stasis/Makefile
src/testing/Makefile
])
AC_OUTPUT
