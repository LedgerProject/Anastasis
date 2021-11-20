/*
Simple Alloy4 model for Taler backup&sync.
*/

sig AnastasisMasterSecret { }

// Key pair that each wallet has.
sig WalletDeviceKey { }

sig SyncProvider { }

// Key pair to access the sync account.
sig SyncAccountKey { }

// Abstraction of what's in a sync blob
sig SyncBlobHeader {
	// Access matrix, abstracts the DH
	// suggested by Christian (https://bugs.gnunet.org/view.php?id=6077#c16959)
	// The DH will yield the symmetric blob encryption key for the "inner blob"
	access: AnastasisMasterSecret -> WalletDeviceKey,
}

sig SyncAccount {
	account_key: SyncAccountKey,
	prov: SyncProvider,
	hd: SyncBlobHeader,
}

sig WalletState {
	device_key: WalletDeviceKey,
	anastasis_key: AnastasisMasterSecret,
	enrolled: set SyncAccount,
}


fact DifferentDeviceKeys {
	all disj w1, w2: WalletState | w1.device_key != w2.device_key
}

fact AnastasisKeyConsistent {
	all disj w1, w2: WalletState, s: SyncAccount | 
		s in (w1.enrolled & w2.enrolled) implies
			w1.anastasis_key = w2.anastasis_key
}

fact NoBoringInstances {
	#WalletState >= 2
	all w: WalletState | #w.enrolled >= 1
}

run {} for 5

