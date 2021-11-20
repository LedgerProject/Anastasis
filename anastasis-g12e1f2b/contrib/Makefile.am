# This Makefile.am is in the public domain
# Process this file with automake to produce Makefile.in

SUBDIRS = .

# English (en)
tosendir=$(datadir)/anastasis/tos/en

# English (en)
ppendir=$(datadir)/anastasis/pp/en

tosen_DATA = \
  tos/en/0.txt \
  tos/en/0.pdf \
  tos/en/0.epub \
  tos/en/0.xml \
  tos/en/0.html

ppen_DATA = \
  pp/en/0.txt \
  pp/en/0.pdf \
  pp/en/0.epub \
  pp/en/0.xml \
  pp/en/0.html



pkgdatadir= $(prefix)/share/anastasis/

EXTRA_DIST = \
  $(pkgdata_DATA) \
  $(tosen_DATA) \
  $(ppen_DATA) \
  tos/Makefile \
  tos/README \
  tos/tos.rst \
  tos/conf.py \
  tos/locale/de/LC_MESSAGES/tos.po \
  pp/Makefile \
  pp/README \
  pp/pp.rst \
  pp/conf.py \
  pp/locale/de/LC_MESSAGES/pp.po \
  pogen.sh \
  uncrustify.cfg \
  uncrustify_precommit \
  gana.sh \
  gana-update.sh \
  microhttpd.tag

pkgdata_DATA = \
  redux.al.json \
  redux.be.json \
  redux.ch.json \
  redux.cz.json \
  redux.de.json \
  redux.dk.json \
  redux.es.json \
  redux.in.json \
  redux.it.json \
  redux.jp.json \
  redux.sk.json \
  redux.us.json \
  redux.xx.json \
  redux.xy.json \
  redux.countries.json \
  provider-list.json

# Change the set of supported languages here. You should
# also update tos'XX'data and EXTRA_DIST accordingly.
TOS_LANGUAGES="en de"
PP_LANGUAGES="en de"

# Change the terms-of-service version (Etag) to generate here!
# This value should be incremented whenever there is a substantive
# change in the original text (but not for the translations).
TOS_VERSION=0
PP_VERSION=0

update-tos:
	VERSION=$(TOS_VERSION) ./update-tos.sh $(TOS_LANGUAGES)
update-pp:
	VERSION=$(PP_VERSION) ./update-pp.sh $(PP_LANGUAGES)
