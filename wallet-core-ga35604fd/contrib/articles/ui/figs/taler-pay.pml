@startuml
autonumber

Actor "Payer (Shopper) Browser" as Payer
Participant "Payee (Merchant) Site" as Payee
Participant "Taler Exchange" as Exchange

note over Payer, Payee: Tor/HTTPS
note over Payee, Exchange: HTTP/HTTPS

title Taler (Payment)

== Request Offer ==

Payer->Payee: Choose goods by navigating to offer URL

Payee->Payer: Send signed digital contract proposal

opt
Payer->Payer: Select Taler payment method (skippable with auto-detection)
end

== Execute Payment ==

opt
Payer->Payer: Affirm contract
end

Payer->Payee: Navigate to fulfillment URL

Payee->Payer: Send hash of digital contract and payment information

Payer->Payee: Send payment

Payee->Exchange: Forward payment

Exchange->Payee: Confirm payment

Payee->Payer: Confirm payment

== Fulfillment ==

Payer->Payee: Reload fulfillment URL for delivery

Payee->Payer: Provide product resource

@enduml
