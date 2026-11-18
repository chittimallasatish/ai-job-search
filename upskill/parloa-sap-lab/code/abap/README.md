# ABAP objects for the "ECC / on-premise" path (Phase 5)

Target system: **ABAP Platform Trial 2023** (Docker image `sapse/abap-cloud-developer-trial:2023`)
or a **sandbox/dev client of your company system, with written permission**. Never use production.

The trial system is plain SAP NetWeaver ABAP. It has **no SD tables (VBAK/VBUK)**, so you create a
small custom order table. That is the honest, standard way to simulate an ECC backend. Your
integration skills (RFC destination, Cloud Connector, RFC adapter, BAPIRET2 handling, IDoc
monitoring) are exactly the same as against real ECC.

Create the objects in Eclipse ADT (package `ZLUMEN`, local or transportable):

| # | Object | File |
|---|--------|------|
| 1 | Structure `ZLUMEN_S_ORDER_STATUS` | `zlumen_s_order_status.ddls.txt` |
| 2 | Table `ZLUMEN_ORDERS` | `zlumen_orders.tabl.txt` |
| 3 | Class `ZCL_LUMEN_SEED` (F9 to run: seeds 3 orders) | `zcl_lumen_seed.clas.abap` |
| 4 | Function group `ZLUMEN_RFC` + RFC-enabled FM `Z_LUMEN_ORDER_STATUS` | `z_lumen_order_status.fugr.abap` |

After activation, test in SE37 (SAP GUI) with `IV_ORDER_ID = 4711`, then `9999` (expect an `E` row in `ET_RETURN`).

## Standard BAPI exercise (flight data model, already in the trial)

1. SE38 → run `SAPBC_DATA_GENERATOR` (standard data set) to fill SFLIGHT / SBOOK.
2. SE37 → test `BAPI_FLIGHT_GETLIST` (read), then `BAPI_FLBOOKING_CREATEFROMDATA` (write).
3. Notice the booking **does not persist** until `BAPI_TRANSACTION_COMMIT` runs in the *same* session.
   In SE37 use *Function Module → Test → Test Sequences* to run both together.
4. In CPI, a single RFC receiver call is one session. Either use the RFC adapter's commit option
   (check the adapter's Processing tab on your tenant) or write a wrapper RFC that calls the BAPI
   and `BAPI_TRANSACTION_COMMIT` and returns `BAPIRET2`. Be ready to explain this in the interview:
   *"BAPIs don't commit; the caller owns the LUW."*

## IDoc exercise (ALE)

Use message type `FLIGHTBOOKING_CREATEFROMDAT` (the ALE interface of the booking BAPI, in the trial):

1. BD54: logical systems `LUMENCPI` (sender) and the trial's own client LS (check SCC4).
2. SRTIDOC: register the SOAP IDoc service so the system accepts IDoc-XML over HTTP (`/sap/bc/srt/idoc`).
3. WE20: partner profile for `LUMENCPI`, inbound message type `FLIGHTBOOKING_CREATEFROMDAT`, process code `BAPI`.
4. Cloud Connector: expose HTTP path `/sap/bc/srt/idoc` on the virtual host.
5. CPI: iFlow with **IDoc receiver adapter** (Proxy Type: On-Premise, URL `http://<virtual-host>:<port>/sap/bc/srt/idoc?sap-client=001`).
6. Send one good and one deliberately bad IDoc (unknown flight). Monitor in **WE02 / BD87**: status 53 (posted) vs 51 (application error). Fix and reprocess the 51 in BD87. That is your IDoc troubleshooting story.
