# RC1.6F — P0/P1 và next tasks

| ID | Mức/loại | Current status / evidence | Exact next action / owner |
| --- | --- | --- | --- |
|C01|P0 dependency|BLOCKED;noofficialGeminiRC16 branch/SHA/PR|Owner supplies approvedsource+scope;engineer audits37flows and parity before separateintegrationbranch |
|C02|P0 environment|BLOCKED;noauthorizedimmutablecandidate/effectivekey+providerproof;RC16EcodePASS!=cloudisolation|Operator executes read-only I01–I09 protocol on explicitlyapprovedcandidate;deployment/envchange requiresseparateapproval |
|C03|P0 migration|BLOCKED;RC15RPC digest incompatibility and5missingroutecols/oldchecks;RC16absent|Implement+review newforward-onlyroute/RPCreconciliation,fullschemarehearsal;then approvepackage,target/window/backup separately |
|C04|P0 go-live policy|OPEN;Prod1activeAdmin;Staging2activeAdmin but no login/mappingapproval|OwnernamesindependentA/B forUAT;secondProdreviewer orapprovedFinanceRBACtask;neverLeader salary grant |
|C05|P0 acceptance policy|OPEN;noapprovedrate/OT/break/late/grace/minsample policies|HR/Finance signs actualpolicy;synthetic100000/15000 isnotproductionpolicy |
|C06|Backendresolved|Discoverycontracts unchanged;Payrollregressions retained|Gemini wiring stillNOTRUN |
|C07|P1 policy|OPEN;terminalvoid retainsglobalsegmentreservation;no recovery/reissue|Ownerexplicitlyacceptlimitation or separatelydesign auditedreissue withoutdoublepay |
|C08|P1 Storage|OPEN;physicalproviderUATnotrun|Storageownerapprovesisolatedaccount/root/route;thenbytes/hash/parent/reconnectevidence |
|C09|P1 compatibility|IsolatedPG16/17+Node22/24 gateadded;cloud17.6 vsDocker17.11|CIandlocalrehearsalevidence separate;fullStaging17.6baseline/runtimeUATstillUNVERIFIED |
|C10|Coderesolved|Sharedbuild/runtimeguards retained;securityregressions executed|Do notcloseC02frommatchingURLs/sourcechecks |
|C11|P0 release dependency|OPEN;Stagingprivacy/historyapplied,backendsourceabsent,Proddivergent|Release/Securityownerpinsapprovedforward-onlyfiles preservingnarrowedRLS/RPCcontract |
|C12|P1 Workforcecoverage|OPEN;trends/fullcompletion/GMVattributionunavailable|N/A/warnings;separateWorkforceiteration, nofabricatedscores |

Next safe executable engineering task: add forward-only RC13A→RC15 route-schema
and Staging ShiftRPC reconciliation **as new files**, pin current catalogdigests,
add synthetic compatibility/regressiontests, obtain approved sanitizedschema-only
baseline for fuller rehearsal. Không applycloud. Inparallel ownercanidentify
Gemini source and nominate immutableintegrationcandidate; operatorcanprepare
credentialprovenance/providerisolationevidence without revealingkeys.

E2E mutation remains blocked until C01/C02/C03 and G01–G08 entrygates meet explicit
approvals. KeepPR24/25Draft;nointegrationbranchfromunverifiedfrontend,nomerge/deploy.
