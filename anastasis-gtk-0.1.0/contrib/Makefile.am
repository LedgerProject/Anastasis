# This Makefile.am is in the public domain
# Process this file with automake to produce Makefile.in

SUBDIRS = .

pkgdatadir= $(prefix)/share/anastasis/

IMAGES = \
  qr_dummy.png \
  logo.png \
  country_selection.jpg \
  continent_selection.jpg \
  user_attributes.png \
  enter_secret.jpg \
  pay_with_taler.png \
  authentication_methods.png \
  satisfy_challenge.png \
  noun_blindfold_3574196.svg \
  outline_contact_support_black_24dp.png \
  outline_stay_current_portrait_black_24dp.png \
  outline_email_black_24dp.png \
  outline_video_camera_front_black_24dp.png \
  outline_home_work_black_24dp.png \
  ngi_ledger.png \
  bandiera_stelle.png

EXTRA_DIST = \
  $(pkgdata_DATA) \
  get_version.sh \
  pogen.sh

pkgdata_DATA = \
  $(IMAGES) \
  this_stays_private.glade \
  anastasis_gtk_about_window.glade \
  anastasis_gtk_auth_add_email.glade \
  anastasis_gtk_auth_add_iban.glade \
  anastasis_gtk_auth_add_post.glade \
  anastasis_gtk_auth_add_question.glade \
  anastasis_gtk_auth_add_sms.glade \
  anastasis_gtk_auth_add_video.glade \
  anastasis_gtk_challenge_code.glade \
  anastasis_gtk_challenge_iban.glade \
  anastasis_gtk_challenge_question.glade \
  anastasis_gtk_edit_providers.glade \
  anastasis_gtk_edit_policy.glade \
  anastasis_gtk_open_file_dialog.glade \
  anastasis_gtk_open_secret_dialog.glade \
  anastasis_gtk_main_window.glade \
  anastasis_gtk_save_file_dialog.glade \
  anastasis_gtk_save_secret_dialog.glade
