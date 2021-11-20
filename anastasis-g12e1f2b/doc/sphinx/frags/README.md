# docs.git/frags

This directory contains fragments to be included by the directive:

  .. include:: RELATIVE-FILE-NAME

If the fragment includes header lines, you MUST include it at top-level
(no indentation for the directive).

Otherwise, it can be included at either top-level or indented.

See <https://docutils.sourceforge.io/docs/ref/rst/directives.html#including-an-external-document-fragment>.

Tips:

- Don't put index entries in frags/* files.
  (They will result in a Sphinx warning.)
  Instead, keep them in the *including* text.
