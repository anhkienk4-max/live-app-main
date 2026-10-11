# RC1.6F — P0/P1 và next tasks

| ID | Mức/loại | Current status / evidence | Exact next action / owner |
| --- | --- | --- | --- |
|C01|P0 dependency|BLOCKED;noofficialGeminiRC16 branch/SHA/PR|Owner supplies approvedsource+scope;engineer audits37flows and parity before separateintegrationbranch |
|C02|P0 environment|BLOCKED;noauthorizedimmutablecandidate/effectivekey+providerproof;RC16EcodePASS!=cloudisolation|Operator executes read-only I01–I09 protocol on explicitlyapprovedcandidate;deployment/envchange requiresseparateapproval |
|C03|P0 migration|OPEN;RC16G forward-only files+21scenario PG16/17 PASS;actual Staging apply NOT RUN|Owner review pinned manifest+hash/SQL;approve fullbaseline gaps,target/window/backup/new ledger recording;actual apply+postverify separately |
|C04|P0 go-live policy|OPEN;Prod1activeAdmin;Staging2activeAdmin but no login/mappingapproval|OwnernamesindependentA/B forUAT;secondProdreviewer orapprovedFinanceRBACtask;neverLeader salary grant |
|C05|P0 acceptance policy|OPEN;noapprovedrate/OT/break/late/grace/minsample policies|HR/Finance signs actualpolicy;synthetic100000/15000 isnotproductionpolicy |
|C06|Backendresolved|Discoverycontracts unchanged;Payrollregressions retained|Gemini wiring stillNOTRUN |
|C07|P1 policy|OPEN;terminalvoid retainsglobalsegmentreservation;no recovery/reissue|Ownerexplicitlyacceptlimitation or separatelydesign auditedreissue withoutdoublepay |
|C08|P1 Storage|OPEN;physicalproviderUATnotrun|Storageownerapprovesisolatedaccount/root/route;thenbytes/hash/parent/reconnectevidence |
|C09|P1 compatibility|IsolatedPG16/17+Node22/24 gateadded;cloud17.6 vsDocker17.11|CIandlocalrehearsalevidence separate;fullStaging17.6baseline/runtimeUATstillUNVERIFIED |
|C10|Coderesolved|Sharedbuild/runtimeguards retained;securityregressions executed|Do notcloseC02frommatchingURLs/sourcechecks |
|C11|P0 release dependency|OPEN;Stagingprivacy/historyapplied,backendsourceabsent,Proddivergent|Release/Securityownerpinsapprovedforward-onlyfiles preservingnarrowedRLS/RPCcontract |
|C12|P1 Workforcecoverage|OPEN;trends/fullcompletion/GMVattributionunavailable|N/A/warnings;separateWorkforceiteration, nofabricatedscores |

RC16G đã implement hai forward-only reconciliation files với manifest outside
auto-discovery và real helper regressions. Next safe task: owner technical review
approval package,obtain approved sanitizedschema-only baseline cho phần còn thiếu
(Auth/audit/privacy/reports/provider),chốt target/window/backup và operator executor.
Không applycloud trước authorization riêng. Inparallel ownercanidentify
Gemini source and nominate immutableintegrationcandidate; operatorcanprepare
credentialprovenance/providerisolationevidence without revealingkeys.

E2E mutation remains blocked until C01/C02/C03 and G01–G08 entrygates meet explicit
approvals. KeepPR24/25Draft;nointegrationbranchfromunverifiedfrontend,nomerge/deploy.
