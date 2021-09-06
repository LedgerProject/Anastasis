# This file is part of Anastasis.
# (C) 2001--2020 Christian Grothoff (and other contributing authors)
#
# Anastasis is free software; you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published
# by the Free Software Foundation; either version 3, or (at your
# option) any later version.
#
# Anastasis is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
# General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with Anastasis; see the file COPYING.  If not, write to the
# Free Software Foundation, Inc., 51 Franklin Street, Fifth Floor,
# Boston, MA 02110-1301, USA.
#
#
# Process this file with autoconf to produce a configure script.
#
AC_PREREQ(2.61)
AC_INIT([Anastasis GTK],[0.1.0],[bug-anastasis@gnu.org],[anastasis-gtk])
AC_CONFIG_AUX_DIR([build-aux])
AM_INIT_AUTOMAKE([silent-rules])
AC_CONFIG_HEADERS([anastasis_gtk_config.h])

AH_TOP([#define _GNU_SOURCE  1])

AC_ISC_POSIX
AC_PROG_AWK
AM_PROG_CC_C_O
AC_PROG_MKDIR_P
AC_PROG_CPP
AC_PROG_CC_C99
AC_PROG_INSTALL
AC_PROG_LN_S
AC_PROG_MAKE_SET
AC_LIBTOOL_WIN32_DLL
AC_HEADER_STDC
AC_CANONICAL_HOST

# dynamic libraries/plugins
AC_DISABLE_STATIC
AC_PROG_LIBTOOL

AC_SYS_LARGEFILE
AC_FUNC_FSEEKO
AC_TYPE_UID_T

CFLAGS="-Wall $CFLAGS"
# use '-fno-strict-aliasing', but only if the compiler can take it
AS_IF([gcc -fno-strict-aliasing -S -o /dev/null -xc /dev/null >/dev/null 2>&1],
 [CFLAGS="-fno-strict-aliasing $CFLAGS"])

# Default to unix configuration
ENABLE_ON_UNIX=""
ENABLE_ON_W32="#"
# Check system type
AS_CASE(["$host_os"],
  [*darwin* | *rhapsody* | *macosx*],[
     AC_DEFINE_UNQUOTED(OSX,1,[This is an OS X system])
     CFLAGS="-no-cpp-precomp $CFLAGS"
     LDFLAGS="-flat_namespace -undefined suppress $LDFLAGS"
  ],
  [linux*],[
     AC_DEFINE_UNQUOTED(LINUX,1,[This is a Linux system])
  ],
  [freebsd*],[
     AC_DEFINE_UNQUOTED(SOMEBSD,1,[This is a BSD system])
     AC_DEFINE_UNQUOTED(FREEBSD,1,[This is a FreeBSD system])
  ],
  [openbsd*],[
     AC_DEFINE_UNQUOTED(SOMEBSD,1,[This is a BSD system])
     AC_DEFINE_UNQUOTED(OPENBSD,1,[This is an OpenBSD system])
  ],
  [netbsd*],[
     AC_DEFINE_UNQUOTED(SOMEBSD,1,[This is a BSD system])
     AC_DEFINE_UNQUOTED(NETBSD,1,[This is a NetBSD system])
  ],
  [*solaris*],[
     AC_DEFINE_UNQUOTED(SOLARIS,1,[This is a Solaris system])
     AC_DEFINE_UNQUOTED(_REENTRANT,1,[Need with solaris or errno doesnt work])
     build_target="solaris"
  ],
  [*arm-linux*],[
     AC_DEFINE_UNQUOTED(LINUX,1,[This is a Linux system])
  ],
  [*cygwin*],[
     AC_DEFINE_UNQUOTED(CYGWIN,1,[This is a Cygwin system])
     AC_DEFINE_UNQUOTED(WINDOWS,1,[This is a Windows system])
     AC_CHECK_LIB(intl, gettext)
     ENABLE_ON_W32=""
     ENABLE_ON_UNIX="#"
     build_target="cygwin"
  ],
  [*mingw*],[
     AC_DEFINE_UNQUOTED(MINGW,1,[This is a MinGW system])
     AC_DEFINE_UNQUOTED(WINDOWS,1,[This is a Windows system])
     AC_DEFINE_UNQUOTED(_WIN32,1,[This is a Windows system])
     AC_CHECK_LIB(intl, gettext)
     LDFLAGS="$LDFLAGS -Wl,--export-all-symbols -lws2_32"
     CFLAGS="-mms-bitfields -D__USE_MINGW_ANSI_STDIO=1 $CFLAGS"
     LIBS="$LIBS -lws2_32 -lplibc -lole32"
     ENABLE_ON_W32=""
     ENABLE_ON_UNIX="#"
     build_target="mingw"
   ],
   [
     AC_MSG_RESULT(Unrecognised OS $host_os)
     AC_DEFINE_UNQUOTED(OTHEROS,1,[Some strange OS])
   ])

AM_CONDITIONAL(MINGW,   test "$build_target" = "mingw")

AC_MSG_CHECKING(for magic_open -lmagic)
SAVED_AM_LDFLAGS=$AM_LDFLAGS
AC_CHECK_LIB(magic, magic_open,
  [AC_CHECK_HEADERS([magic.h],,
   AC_MSG_ERROR([anastasis-gtk requires magic.h]))],
  AC_MSG_ERROR([anastasis-gtk requires libmagic]))


AC_SUBST(ENABLE_ON_UNIX)
AC_SUBST(ENABLE_ON_W32)

GN_LIB_LDFLAGS="-export-dynamic -no-undefined"
AC_SUBST(GN_LIB_LDFLAGS)

# check for gettext
AM_GNU_GETTEXT_VERSION([0.19.3])
AM_GNU_GETTEXT([external])

AC_CHECK_HEADERS([errno.h stdio.h unistd.h locale.h sys/stat.h sys/types.h langinfo.h libintl.h unistd.h stddef.h argz.h sys/socket.h netinet/in.h stdarg.h])

AC_CHECK_FUNCS([getpwnam])

AC_CHECK_DECLS([_stati64], [], [], [[#include <sys/stat.h>]])


# libgnurl
LIBGNURL_CHECK_CONFIG(,7.34.0,gnurl=1,gnurl=0)

SAVE_CPPFLAGS=$CPPFLAGS
CPPFLAGS="$LIBGNURL_CPPFLAGS $LIBCURL_CPPFLAGS $CPPFLAGS"
LIBS="$LIBGNURL $LIBCURL $LIBS"

# libcurl-gnutls
LIBCURL_CHECK_CONFIG(,7.34.0,[curl=true],[curl=false])
AS_IF([test "x$curl" = xtrue],[
 AC_CHECK_HEADER([curl/curl.h],
  AC_CHECK_DECLS(CURLINFO_TLS_SESSION,[curl=true],[curl=false],[[#include <curl/curl.h>]]),
  [curl=false])
 # need libcurl-gnutls.so for proxy, warn later if not found.
 AC_CHECK_LIB([curl-gnutls],[curl_easy_getinfo],[curl_gnutls=true],[curl_gnutls=false])
 # cURL must support CURLINFO_TLS_SESSION, version >= 7.34
])

# libcurl and libgnurl should be mutually exclusive
AS_IF([test "$gnurl" = 1],
      [AM_CONDITIONAL(HAVE_LIBGNURL, true)
       AC_DEFINE([HAVE_LIBGNURL],[1],[Have libgnurl])
       AM_CONDITIONAL(HAVE_LIBCURL, false)
       AC_DEFINE([HAVE_LIBCURL],[0],[Lacking libcurl])],
      [AS_IF([test "$curl" = true],
             [AM_CONDITIONAL(HAVE_LIBGNURL, false)
              AC_DEFINE([HAVE_LIBGNURL],[0],[Lacking libgnurl])
              AM_CONDITIONAL(HAVE_LIBCURL, true)
              AC_DEFINE([HAVE_LIBCURL],[1],[Have libcurl])],
             [AC_MSG_ERROR([GNUnet requires libcurl or gnurl >= 7.34])
              AM_CONDITIONAL(HAVE_LIBGNURL, false)
              AC_DEFINE([HAVE_LIBGNURL],[0],[Lacking libgnurl])
              AM_CONDITIONAL(HAVE_LIBCURL, false)
              AC_DEFINE([HAVE_LIBCURL],[0],[Lacking libcurl])])])


# restore LIBS & CPPFLAGS
LIBS=$SAVE_LIBS
CPPFLAGS=$SAVE_CPPFLAGS


# test for GNUnet
gnunet=0
lookin=${prefix}
GNUNET_LIBS="-L${lookin}/lib"
GNUNET_CFLAGS="-I${lookin}/include"
GNUNET_CPPFLAGS="-I${lookin}/include"
LIBS="$GNUNET_LIBS $LIBS"
CFLAGS="$GNUNET_CFLAGS $CFLAGS"
CPPFLAGS="$GNUNET_CPPFLAGS $CPPFLAGS"

AC_MSG_CHECKING(for GNUnet)
AC_ARG_WITH(gnunet,
   [  --with-gnunet=PFX       Base of GNUnet installation],
   [AC_MSG_RESULT([$with_gnunet])
    AS_CASE([$with_gnunet],
      [no],[lookin=""].
      [yes],[lookin="${prefix}"],
      [lookin="$with_gnunet"])
   ],
   [
     AC_MSG_RESULT([--with-gnunet not specified])
     PKG_CHECK_MODULES([GNUNET], [gnunetutil >= 0.9.0], gnunet=1)
   ]
)

AS_IF([test "x$gnunet" = "x0" -a ! "x$lookin" = "x"],
[
  AC_MSG_CHECKING(for libgnunetutil library in $lookin)
  AC_CHECK_HEADERS([gnunet/gnunet_util_lib.h],
    AC_CHECK_LIB([gnunetutil], [GNUNET_xfree_],
      [
        gnunet=1
        EXT_LIB_PATH="-L${lookin}/lib $EXT_LIB_PATH"
      ]
    ),,[#include <gnunet/platform.h>]
  )
])

AS_IF([test "x$gnunet" = "x0"],
 [AC_MSG_ERROR([anastasis-gtk requires GNUnet])])


AC_SUBST(GNUNET_CFLAGS)
AC_SUBST(GNUNET_CPPFLAGS)
AC_SUBST(GNUNET_LIBS)


# test for libqrencode
qrencode=0
QR_LIBS="-lqrencode"
AC_MSG_CHECKING(for libqrencode)
AC_ARG_WITH(qrencode,
   [  --with-qrencode=PFX    Base of libqrencode installation],
   [AC_MSG_RESULT([$with_qrencode])
    AS_CASE([$with_qrencode],
      [no],[],
      [yes],[
        AC_CHECK_HEADERS(qrencode.h,qrencode=1)
      ],
      [
        CPPFLAGS="-I$with_qrencode/include $CPPFLAGS"
        QR_CFLAGS="-I$with_qrencode/include"
        QR_LIBS="-L$with_qrencode/lib -lqrencode"
        AC_CHECK_HEADERS(qrencode.h,qrencode=1)
      ])
   ],
   [AC_MSG_RESULT([--with-qrencode not specified])
    AC_CHECK_HEADERS(qrencode.h,qrencode=1)])

AS_IF([test "$qrencode" != 1],
 [AC_MSG_ERROR([anastasis-gtk requires libqrencode])])

AC_SUBST(QR_CFLAGS)
AC_SUBST(QR_LIBS)


# test for libanastasis
anastasis=0
AC_MSG_CHECKING(for libanastasis)
AC_ARG_WITH(anastasis,
   [  --with-anastasis=PFX    base of libanastasis installation],
   [AC_MSG_RESULT([$with_anastasis])
    AS_CASE([$with_anastasis],
      [no],[],
      [yes],[
        AC_CHECK_HEADERS([anastasis/anastasis_service.h],
          AC_CHECK_LIB([anastasisrest], [ANASTASIS_get_config],
            [anastasis=1]
          ),,[#include <gnunet/platform.h>])
      ],[
        LDFLAGS="-L$with_anastasis/lib $LDFLAGS"
        CPPFLAGS="-I$with_anastasis/include $CPPFLAGS"
        AC_CHECK_HEADERS([anastasis/anastasis_service.h],
          AC_CHECK_LIB([anastasisrest], [ANASTASIS_get_config],
            EXT_LIB_PATH="-L$with_anastasis/lib $EXT_LIB_PATH"
            [anastasis=1]
          ),,[#include <gnunet/platform.h>])
      ])
   ],
   [AC_MSG_RESULT([--with-anastasis not specified])
    AC_CHECK_HEADERS([anastasis/anastasis_service.h],
     AC_CHECK_LIB([anastasisrest], [ANASTASIS_get_config],
      [anastasis=1]
     ),,[#include <gnunet/platform.h>])])


AS_IF([test "$anastasis" != 1],
[
 AC_MSG_ERROR([anastasis-gtk requires libanastasis])
])


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


AC_MSG_CHECKING(for gtk)
without_gtk=true
PKG_CHECK_MODULES([GTK], [gtk+-3.0])

AM_PATH_GTK_3_0([3.22.0],,AC_MSG_ERROR([anastasis-gtk requires GTK 3.22]))

CFLAGS="$CFLAGS $GTK_CFLAGS"
CPPFLAGS="$CPPFLAGS $GTK_CFLAGS"
LIBS="$LIBS $GTK_LIBS"
AC_CHECK_HEADERS([glib.h gmodule.h gtk/gtk.h gdk/gdk.h],,AC_MSG_ERROR([anastasis-gtk requires GTK]))


# test for Glade
glade=0
lookin=${prefix}
GLADE_CPPFLAGS=""
GLADE_LDFLAGS=""
GLADE_CFLAGS=""
AC_MSG_CHECKING(for Glade core)
AC_ARG_WITH(glade,
   [  --with-glade=PFX       Base of Glade installation (found with pkg-config if omitted)],
   [AC_MSG_RESULT([$with_glade])
    AS_CASE([$with_glade],
      [no],[lookin=""],
      [yes],[lookin="${prefix}"],
      [lookin="$with_glade"])
   ],
   [
     AC_MSG_RESULT([--with-glade not specified])
     PKG_CHECK_MODULES([GLADE], [gladeui-2.0 >= 3.10.0], glade=2)
   ]
)

AS_IF([test "x$glade" = "x0" -a ! "x$lookin" = "x"],
[
  AC_MSG_CHECKING([for Glade3 in $lookin])
  GLADE_LIBS="-L${lookin}/lib"
  GLADE_CFLAGS="-I${lookin}/include/libgladeui-2.0"
  GLADE_CPPFLAGS="-I${lookin}/include/libgladeui-2.0"
  LIBS="$GLADE_LIBS $LIBS"
  CFLAGS="$GLADE_CFLAGS $CFLAGS"
  CPPFLAGS="$GLADE_CPPFLAGS $CPPFLAGS"
  AC_CHECK_HEADERS([glib.h gmodule.h gtk/gtk.h gdk/gdk.h gdk/gdkpixbuf.h gladeui/glade.h],
     AC_CHECK_LIB([gladeui-2], [glade_xml_node_new],
          [glade=2])
  )
])
AS_IF([test "x$glade" = "x0"],
 [AC_MSG_ERROR([anastasis-gtk requires Glade3 (library and headers)])])

CFLAGS="$GLADE_CFLAGS $CFLAGS"
CPPFLAGS="$GLADE_CFLAGS $CPPFLAGS"

AC_SUBST(GLADE_CFLAGS)
AC_SUBST(GLADE_LIBS)


# test for libgnunetgtk
gnunetgtk=0
AC_MSG_CHECKING(for libgnunetgtk)
AC_ARG_WITH(gnunetgtk,
   [  --with-gnunetgtk=PFX    Base of libgnunetgtk installation],
   [AC_MSG_RESULT([$with_gnunetgtk])
    AS_CASE([$with_gnunetgtk],
      [no],[],
      [yes],[
        AC_CHECK_HEADERS([gnunet-gtk/gnunet_gtk.h],gnunetgtk=1)
      ],
      [
        CPPFLAGS="-I$with_gnunetgtk/include $CPPFLAGS"
        CFLAGS="-I$with_gnunetgtk/include $CFLAGS"
        LIBS="-lgnunetgtk $LIBS"
        AC_CHECK_HEADERS([gnunet-gtk/gnunet_gtk.h],gnunetgtk=1)
      ])
   ],
   [AC_MSG_RESULT([--with-gnunetgtk not specified])
    AC_CHECK_HEADERS([gnunet-gtk/gnunet_gtk.h],gnunetgtk=1)])

AS_IF([test "$gnunetgtk" != 1],
[
 AC_MSG_ERROR([anastasis-gtk requires libgnunetgtk])
])


# Adam shostack suggests the following for Windows:
# -D_FORTIFY_SOURCE=2 -fstack-protector-all
AC_ARG_ENABLE(gcc-hardening,
   AS_HELP_STRING(--enable-gcc-hardening, enable compiler security checks),
[AS_IF([test x$enableval = xyes],[
    CFLAGS="$CFLAGS -D_FORTIFY_SOURCE=2 -fstack-protector-all"
    CFLAGS="$CFLAGS -fwrapv -fPIE -Wstack-protector"
    CFLAGS="$CFLAGS --param ssp-buffer-size=1"
    LDFLAGS="$LDFLAGS -pie"
])])


# Linker hardening options
# Currently these options are ELF specific - you can't use this with MacOSX
AC_ARG_ENABLE(linker-hardening,
  AS_HELP_STRING(--enable-linker-hardening, enable linker security fixups),
[AS_IF([test x$enableval = xyes],[
   LDFLAGS="$LDFLAGS -z relro -z now"
 ])])


extra_logging=GNUNET_NO
AC_ARG_ENABLE([logging],
   AS_HELP_STRING([--enable-logging@<:@=value@:>@],[Enable logging calls. Possible values: yes,no,verbose,veryverbose ('yes' is the default)]),
   [AS_IF([test "x$enableval" = "xyes"], [],
          [test "x$enableval" = "xno"], [AC_DEFINE([GNUNET_CULL_LOGGING],[],[Define to cull all logging calls])],
          [test "x$enableval" = "xverbose"], [extra_logging=GNUNET_YES]
          [test "x$enableval" = "xveryverbose"], [extra_logging=\(GNUNET_YES+1\)])
   ], [])
AC_DEFINE_UNQUOTED([GNUNET_EXTRA_LOGGING],[$extra_logging],[1 if extra logging is enabled, 2 for very verbose extra logging, 0 otherwise])

AC_CHECK_HEADERS([gnunet/gnunet_util_lib.h], [],
                 AC_MSG_ERROR([compiling anastasis-gtk requires libgnunetutil]), [#include <gnunet/platform.h>])

AC_CHECK_LIB(gladeui-1,glade_xml_node_new, [],
             [
             AC_CHECK_LIB(gladeui-2,glade_xml_node_new,,
                          AC_MSG_ERROR([gnunet-gtk requires glade3]))
             ]
            )

AC_CHECK_HEADERS([gtk/gtkx.h])

AC_DEFINE_DIR([PACKAGE_DATA], [datarootdir], [The directory for installing read-only architecture-independent data])

# Set PACKAGE_SOURCE_DIR in gnunet_gtk_config.h.
packagesrcdir=`cd $srcdir && pwd`
AC_DEFINE_UNQUOTED(PACKAGE_SOURCE_DIR, "${packagesrcdir}", [source dir])

GN_PLUGIN_LDFLAGS="-export-dynamic -avoid-version -module -no-undefined"

AC_SUBST(GN_PLUGIN_LDFLAGS)

AC_SUBST(ANASTASIS_GTK_VERSION3, $PACKAGE_VERSION, [version of the program])
AC_SUBST(ANASTASIS_GTK_YEARFROM, [2020], [year of the first release])
AS_IF([test -n "$SOURCE_DATE_EPOCH"],
      [thisyear=$(date --utc --date="@SOURCE_DATE_EPOCH" +%Y)],
      [thisyear=$(date +%Y)])
AC_SUBST(ANASTASIS_GTK_YEARTO, ${thisyear}, [year of the most current release])

AC_OUTPUT([
Makefile
contrib/Makefile
doc/Makefile
doc/doxygen/Makefile
src/Makefile
src/anastasis/Makefile
src/testing/Makefile
pixmaps/Makefile
po/Makefile.in
po/Makefile
anastasis-gtk.desktop
contrib/anastasis_gtk_about_window.glade
])
