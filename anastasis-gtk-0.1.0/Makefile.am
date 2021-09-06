# This Makefile.am is in the public domain
## Process this file with automake to produce Makefile.in

SUBDIRS = contrib doc po src pixmaps

desktopdir = $(datadir)/applications
desktop_in_files = \
  anastasis-gtk.desktop.in
desktop_DATA = $(desktop_in_files:.desktop.in=.desktop)

pkgpixdir= $(pkgdatadir)

doc_DATA = README

ACLOCAL_AMFLAGS = -I m4
