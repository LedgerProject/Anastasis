;; suggested integration of uncrustify for Emacs
;; This assumes that the 'uncrustify-mode.el' is
;; installed to '~/.emacs.d/load-path/'. Feel free
;; to put it elsewhere and adjust the load path below!

;; adding the following to ~/.emacs will then run
;; uncrustify whenever saving a C buffer.

(add-to-list 'load-path "~/.emacs.d/load-path/")
(require 'uncrustify-mode)
(add-hook 'c-mode-common-hook 
	  '(lambda ()
             (uncrustify-mode 1)))
