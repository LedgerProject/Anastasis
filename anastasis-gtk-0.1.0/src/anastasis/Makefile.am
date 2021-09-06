# This Makefile.am is in the public domain
SUBDIRS = .

AM_CPPFLAGS = \
  -I$(top_srcdir)/ \
  -I$(top_srcdir)/src/include \
  @GTK_CFLAGS@ \
  @GNUNET_CFLAGS@ \
  @GLADE_CFLAGS@

bin_PROGRAMS = anastasis-gtk

anastasis_gtk_SOURCES = \
  anastasis-gtk.c \
  anastasis-gtk_about.c \
  anastasis-gtk_action.c anastasis-gtk_action.h \
  anastasis-gtk_attributes.c anastasis-gtk_attributes.h \
  anastasis-gtk_dispatch.c anastasis-gtk_dispatch.h \
  anastasis-gtk_io.c \
  anastasis-gtk_handle-auth-delete-button-clicked.c \
  anastasis-gtk_handle-auth-edit-provider-clicked.c \
  anastasis-gtk_handle-backup-button-clicked.c \
  anastasis-gtk_handle-challenge-code.c \
  anastasis-gtk_handle-challenge-iban.c \
  anastasis-gtk_handle-challenge-row-activated.c \
  anastasis-gtk_handle-challenge-question.c \
  anastasis-gtk_handle-clear-secret-clicked.c \
  anastasis-gtk_handle-continent-selected.c \
  anastasis-gtk_handle-country-activated.c \
  anastasis-gtk_handle-country-unselected.c \
  anastasis-gtk_handle-currency-changed.c \
  anastasis-gtk_handle-core-secret-changed.c \
  anastasis-gtk_handle-core-secret-name-changed.c \
  anastasis-gtk_handle-expiration-change.c \
    anastasis-gtk_handle-expiration-change.h \
  anastasis-gtk_handle-identity-changed.c \
    anastasis-gtk_handle-identity-changed.h \
  anastasis-gtk_handle-recovery-button-clicked.c \
  anastasis-gtk_handle-secret-buttons.c \
  anastasis-gtk_handle-main-window-forward-clicked.c \
  anastasis-gtk_handle-main-window-forward-clicked.h \
  anastasis-gtk_handle-main-window-back-clicked.c \
  anastasis-gtk_handle-method-email.c \
  anastasis-gtk_handle-method-iban.c \
  anastasis-gtk_handle-method-post.c \
  anastasis-gtk_handle-method-question.c \
  anastasis-gtk_handle-method-sms.c \
  anastasis-gtk_handle-payqr-selection-changed.c \
  anastasis-gtk_handle-policy-activate.c \
  anastasis-gtk_handle-policy-button.c \
  anastasis-gtk_handle-policy-meta.c \
  anastasis-gtk_handle-policy-version-changed.c \
  anastasis-gtk_helper.c  anastasis-gtk_helper.h \
  anastasis-gtk_pe.h \
  anastasis-gtk_pe-add-policy.c \
  anastasis-gtk_pe-delete-challenge.c \
  anastasis-gtk_pe-delete-policy.c \
  anastasis-gtk_pe-edit-policy.c \
  anastasis-gtk_progress.c anastasis-gtk_progress.h \
  os_installation.c

anastasis_gtk_LDADD = \
  @GTK_LIBS@ \
  @GLADE_LIBS@ @GNUNET_LIBS@ \
  @QR_LIBS@ \
  -lanastasisrest \
  -lanastasisredux \
  -lanastasisutil \
  -ltalerjson \
  -ltalerutil \
  -lgnunetgtk \
  -lgnunetutil \
  -lgnunetcurl \
  -lgnunetjson \
  -ljansson \
  -lmicrohttpd \
  -lmagic \
  $(INTLLIBS)
anastasis_gtk_CFLAGS = \
  @QR_CFLAGS@
anastasis_gtk_LDFLAGS = \
  -export-dynamic
