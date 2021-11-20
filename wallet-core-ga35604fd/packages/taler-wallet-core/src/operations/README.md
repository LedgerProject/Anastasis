# Wallet Operations

This folder contains the implementations for all wallet operations that operate on the wallet state.

To avoid cyclic dependencies, these files must **not** reference each other.  Instead, other operations should only be accessed via injected dependencies.

Avoiding cyclic dependencies is important for module bundlers.