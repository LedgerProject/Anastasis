
@startuml

hide footbox

box "User"
  Participant "Wallet" as W
  Participant "Browser" as U
end box

box "Merchant"
  Participant "Storefront" as S
  Participant "Backend" as B
end box

autonumber

S -> B : proposed contract 
B -> S : signed contract 

S -> U : custom (HTTP(S))

U -> W : signed contract
W -> U : signed coins

U -> S : custom (HTTP(S))

S -> B : signed coins (HTTP(S))
B -> S : confirmation (HTTP(S))

@enduml
