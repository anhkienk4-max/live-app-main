# RC1.6G forward reconciliation

Reconcile verified RC13A route schema and the legacy three-argument Shift RPC
without changing applied migrations, data, RBAC or the create/four-argument RPC.
Two guarded transactional SQL files live outside automatic db-push discovery.
An explicit hashed manifest demonstrates prerequisite order on synthetic legacy
and fresh operational baselines. Production excludes both legacy-only files.
Cloud apply and ledger recording require a separately approved operator plan.

Validation reuses isolated PG16/17 and Node22/24 gates. Auth/staffing/version helpers
come from the read-only catalog snapshot; fixture limitations are recorded explicitly.
No claim of a full Staging clone, provider UAT, deployment or cloud authorization.
