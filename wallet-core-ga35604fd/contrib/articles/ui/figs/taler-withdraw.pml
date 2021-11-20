@startuml
autonumber

Actor "Customer Browser" as Customer
Participant "Bank Site" as Bank
Participant "Taler Exchange" as Exchange

note over Customer, Bank: HTTPS
note over Customer, Exchange: HTTPS
note over Bank, Exchange: wire transfer

title Taler (Withdraw coins)

Customer->Bank: user authentication
Bank->Customer: send account portal

Customer->Customer: initiate withdrawal (specify amount and exchange)

Customer->Exchange: request coin denomination keys and wire transfer data
Exchange->Customer: send coin denomination keys and wire transfer data

Customer->Bank: execute withdrawal

opt
Bank->Customer: request transaction authorization
Customer->Bank: transaction authorization
end

Bank->Customer: withdrawal confirmation
Bank->Exchange: execute wire transfer


Customer->Exchange: withdraw request
Customer<-Exchange: signed blinded coins
Customer->Customer: unblind coins

@enduml
