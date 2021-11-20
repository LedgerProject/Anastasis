
plantuml = plantuml

%.svg : %.pml
	$(plantuml) -tsvg $<

%.pdf : %.pml
	$(plantuml) -tpdf $<

files = taler-pay.pml taler-withdraw.pml \
cc3ds.pml contract.pml paypal.pml \
bitcoin.pml

all : $(files:.pml=.pdf) $(files:.pml=.svg)

