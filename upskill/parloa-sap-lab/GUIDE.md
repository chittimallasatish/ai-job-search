# Step-by-step build guide: Lumen Appliances × SAP agent integration

Work through the phases in order. Each phase ends with a **checkpoint** (prove it works) and an
**issue-log** entry (write down what broke and how you fixed it; this becomes your interview material).
Keep `templates/issue-log.md` open the whole time.

> **UI labels drift.** SAP renames menus often. When a click path below doesn't match your screen,
> search the label on developers.sap.com or help.sap.com and follow the current tutorial. The
> concepts and the order of steps stay the same.

---

## Phase 0: Accounts and tools (Day 1, ~3 h)

### 0.1 Accounts

| Account | Why | Notes |
|---|---|---|
| **SAP BTP trial** (account.hanatrial.ondemand.com) | Integration Suite, Cloud Foundry, HANA Cloud, BAS, Kyma | Choose **US East (VA) / us10** if offered: widest trial catalogue |
| **SAP Business Accelerator Hub** (api.sap.com) | S/4HANA Cloud sandbox APIs + your API key | Log in, open *API_SALES_ORDER_SRV* → *Show API Key* |
| **ServiceNow Personal Developer Instance** (developer.servicenow.com) | Non-SAP ITSM target for Open Connectors | Free; sleeps when idle, wake it before a session |
| **Salesforce Developer Edition** (optional) | Non-SAP CRM target | Free |
| **GitHub** | Version everything; it's your portfolio | Private repo is fine |
| **SAP Generative AI Hub trial** (Phase 8 only) | AI Launchpad, orchestration, LLMs | 30 days: **start it in Week 3**, not now |
| **Solace PubSub+ Cloud trial** (only if Event Mesh is unavailable) | Event broker (same engine as SAP Advanced Event Mesh) | Phase 6 |

### 0.2 Local tools

| Tool | Install |
|---|---|
| Node.js 20 or 22 + npm | nodejs.org |
| CAP dev kit | `npm i -g @sap/cds-dk` |
| Cloud Foundry CLI v8 + MultiApps plugin | `cf install-plugin multiapps` |
| MTA build tool | `npm i -g mbt` |
| VS Code + *SAP CDS Language Support* extension | or use **SAP Business Application Studio** in the trial |
| Bruno or Postman | API testing; save every request as a collection in git |
| Java 17 | Groovy test harness + Cloud Connector |
| Eclipse + **ABAP Development Tools** | Phase 5 |
| SAP GUI (Windows) or SAP GUI for Java (Mac) | Phase 5 (SE37, WE02, BD87, SM59) |
| Docker Desktop **with 32 GB RAM available**, or a cloud VM | Phase 5: ABAP Platform Trial. No such machine? Use a cloud VM (8 vCPU / 32 GB, stop it when idle) or your company sandbox *with permission* |
| An MCP client: **Claude Desktop** or `npx @modelcontextprotocol/inspector` | Plays the "Parloa agent" |

### 0.3 BTP trial set-up

1. In the trial subaccount, open **Service Marketplace** and subscribe to **Integration Suite** (trial plan).
   Follow SAP's tutorial *"Set Up Integration Suite Trial"*:
   https://developers.sap.com/tutorials/cp-starter-isuite-onboard-subscribe.html
2. Assign the role collection `Integration_Provisioner` to your user, open Integration Suite → **Add Capabilities**:
   - Build Integration Scenarios (**Cloud Integration**)
   - Manage APIs (**API Management**)
   - Extend Non-SAP Connectivity (**Open Connectors**)
   - Design, Develop and Manage B2B Scenarios (**Integration Advisor**), if offered
   - **Event Mesh**, *if the capability list shows it* (note in your log whether it does)
3. Assign the generated role collections (`PI_Administrator`, `PI_Integration_Developer`,
   `PI_Business_Expert`, and the `APIPortal.*` / `APIManagement.*` ones) to your user. Log out and back in.
4. Create a **HANA Cloud** trial instance (SAP HANA Cloud Central). Note: trial instances **stop
   every night**; restart before each session.
5. Run `cf login -a <API endpoint from subaccount overview>`, then `cf target`.

**Checkpoint 0:** Integration Suite home shows the capability tiles; `cf apps` works; HANA Cloud is *Running*.

---

## Phase 1: The agent loop, locally (Days 1–2, ~5 h)

**Skills:** CAP, OData V4, MCP, conversational design, idempotency, PII minimisation.

1. Start the "Service Cloud" stand-in:
   ```bash
   cd code/cap-servicecloud-mock && npm install && cds watch
   ```
   Open http://localhost:4004 and log in as `parloa-agent` / `agent`.
2. Start the order mock (stands in for the CPI iFlow you build in Phase 2):
   ```bash
   cd code/mcp-server && npm install && node dev/mock-orders.mjs
   ```
3. Read `srv/agent-service.cds` and `srv/agent-service.js` line by line, until you can explain:
   - why `Customers` excludes `email` (least-privilege for agents)
   - why `conversationId` exists (voice platforms retry, so the API must be idempotent)
   - why `verifyCustomer` never says which factor failed
   - why errors are full sentences (the agent turns them into speech)
4. Connect the MCP server to Claude Desktop. In `claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "lumen-sap": {
         "command": "node",
         "args": ["/ABSOLUTE/PATH/code/mcp-server/server.mjs"],
         "env": {
           "SERVICECLOUD_API_URL": "http://localhost:4004/servicecloud",
           "ORDERS_API_URL": "http://localhost:4005/agent/orderstatus",
           "BASIC_AUTH": "parloa-agent:agent"
         }
       }
     }
   }
   ```
   Or use the inspector: `cd code/mcp-server && BASIC_AUTH=parloa-agent:agent npm run inspect`.
5. Paste `agent/briefing.md` into a Claude Desktop project as instructions. Run all 10 test conversations.
6. **Exercise:** add a 7th tool, `cancel_appointment`, end to end (CDS action → handler with a
   rule: no cancellation less than 24 h before start → MCP tool → test conversation).

**Checkpoint 1:** all 10 test conversations pass; your new tool works.
**Interview line:** *"I designed the tool surface the way an agent platform needs it: coarse,
task-shaped tools, idempotent writes, errors phrased as instructions to the agent."*

---

## Phase 2: Cloud Integration iFlows (Days 3–5, ~10 h)

**Skills:** SAP CI, Groovy, HTTP and OData adapters, exception handling, security material,
externalised parameters, monitoring and tracing, S/4HANA released APIs.

### 2.1 Runtime credentials
1. Service Marketplace → **SAP Process Integration Runtime**, plan `integration-flow`, roles
   `ESBMessaging.send`, grant type *Client Credentials*. Create a **service key**. You will use its
   `clientid`, `clientsecret`, `tokenurl` and `url`.
2. Test the S/4 sandbox directly first, so you know the backend works before you blame the iFlow:
   ```bash
   curl -H "apiKey: $S4KEY" -H "Accept: application/json" \
     "https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder?\$top=3&\$select=SalesOrder"
   ```
   Pick 2–3 real `SalesOrder` numbers from the result for testing.

### 2.2 iFlow `AGT_GetOrderStatus`
Design → create package **Lumen Agent Integrations** → add Integration Flow.

```
HTTPS Sender (/agent/orderstatus, CSRF protection OFF, role ESBMessaging.send)
  → Content Modifier "init"        (properties: logPayload={{logPayload}}, backendKeyAlias={{backendKeyAlias}})
  → Groovy 01_validate_order_request
  → Groovy 02_set_backend_apikey
  → Groovy 04_log_payload_masked   (logStep=request)
  → Request-Reply → HTTP Receiver  (GET; address + query string: copy them from the comment at the top of script 03)
  → Groovy 04_log_payload_masked   (logStep=backendResponse)
  → Groovy 03_map_salesorder_to_agent
  → End
Exception Subprocess: Error Start → Groovy 05_build_agent_error → End
```

1. Add the five scripts from `code/cpi-groovy/` (Script → Create, paste). Before you upload a changed
   script, run `code/cpi-groovy/test/run-tests.sh` locally.
2. **Security Material** → Create → *Secure Parameter* `S4_SANDBOX_APIKEY` = your Hub API key.
3. **Externalise** `logPayload` (default `false`) and `backendKeyAlias`. Configure → set → deploy.
4. Runtime Configuration → *Allowed Header(s)*: `X-Correlation-ID`.
5. Deploy. Monitor → **Manage Integration Content** → copy the endpoint URL.
6. Call it (basic auth = service-key clientid:clientsecret):
   ```bash
   curl -u "$CID:$CSECRET" "https://<runtime-host>/http/agent/orderstatus?orderId=<real id>"
   curl -u "$CID:$CSECRET" "https://<runtime-host>/http/agent/orderstatus?orderId=abc"
   curl -u "$CID:$CSECRET" "https://<runtime-host>/http/agent/orderstatus?orderId=999999999"
   ```
   Expect 200 with `speakable`, 400 `INVALID_ORDER_ID`, and 404 `ORDER_NOT_FOUND`.
7. **Monitor:** find each run in *Monitor Message Processing* (search by Application ID = order
   number). Switch log level to **Trace** for 10 minutes, rerun, and inspect payload per step.
8. Set `logPayload=true`, redeploy, and confirm the masked attachments appear. Then switch it back off.

### 2.3 Variant: OData V2 receiver adapter
Copy the iFlow to `AGT_GetOrderStatus_OData` and replace the HTTP receiver with the **OData V2
adapter**: use *Select* in the query wizard, pull the EDMX from the Hub, and select fields plus
`to_Item`. Compare the wizard, metadata handling and paging with the HTTP approach. Note the
trade-offs in your log; that comparison is an interview question waiting to happen.

### 2.4 Orchestration iFlow `AGT_CreateCaseForOrder` (after Phase 3.1 deploys CAP)
Input `{customerId, orderId, subject, conversationId}` → Request-Reply S/4 (read first item's
material = product) → **Content Enricher** / Groovy merge → **OData V4 receiver** `POST Cases` on
the deployed CAP app (OAuth2 Client Credentials credential from the CAP xsuaa service key) →
return `{caseNumber}`. Add a **Router**: if the order is not found, still create the case, without
product.

**Checkpoint 2:** 3 status codes behave correctly; MPL search by order number works; trace shows each step.

---

## Phase 3: Deploy CAP + API Management (Days 6–7, ~7 h)

**Skills:** CAP on BTP, XSUAA, MTA, HANA Cloud HDI, API Management (proxy, product, policies, analytics).

### 3.1 Deploy CAP
```bash
cd code/cap-servicecloud-mock
cds add hana,xsuaa,mta
npm install
```
Edit `xs-security.json` and add **authorities**, so a *technical* client (CPI, APIM) gets the role:
```json
"authorities": ["$XSAPPNAME.AgentTool"]
```
(Without it, client-credentials tokens get **403**. Make this mistake on purpose first and log it.)
```bash
mbt build && cf deploy mta_archives/*.mtar
```
Create a service key on the xsuaa instance, fetch a client-credentials token, and call `/servicecloud/Cases`.

### 3.2 API Management
Follow `code/apim-policies/POLICIES.md`:
1. Proxy `lumen-agent-v1` with two resources: `/orders/status` → CPI, `/servicecloud/*` → CAP.
2. Policies: Verify API Key → Spike Arrest → Quota → Correlation ID → Response Cache → backend auth.
3. Product `Lumen Agent Tools` → publish → Developer Hub → create application → copy the key.
4. Start with **v1 Basic** to CPI. Once it works, upgrade to **v2 OAuth token caching** and measure the latency difference.
5. Look at **Analyze → API analytics**: calls, errors and latency by proxy.

**Checkpoint 3:** `curl -H "APIKey: $KEY" https://<apim-host>/lumen/v1/orders/status?orderId=…` works;
without the key you get 401; at more than 20 req/s you get spike-arrest errors.

---

## Phase 4: End-to-end in the cloud (Day 8, ~4 h)

1. Repoint the MCP server: `ORDERS_API_URL=https://<apim>/lumen/v1/orders/status`,
   `SERVICECLOUD_API_URL=https://<apim>/lumen/v1/servicecloud`, `API_KEY=<key>`, and remove `BASIC_AUTH`.
2. Rerun all 10 test conversations against the real chain:
   **agent → MCP → APIM → CPI → S/4 sandbox**, and **agent → MCP → APIM → CAP/HANA**.
3. Deploy the MCP server itself (HTTP transport) to Cloud Foundry:
   ```bash
   cd code/mcp-server
   cf push lumen-mcp -m 256M -b nodejs_buildpack -c "node server.mjs" --no-start
   cf set-env lumen-mcp MCP_TRANSPORT http
   cf set-env lumen-mcp MCP_BEARER_TOKEN "<long random string>"
   cf set-env lumen-mcp ORDERS_API_URL ... ; cf set-env lumen-mcp SERVICECLOUD_API_URL ... ; cf set-env lumen-mcp API_KEY ...
   cf start lumen-mcp
   ```
   Connect MCP Inspector to `https://<route>/mcp` with the bearer token.
4. **Optional Kyma (Kubernetes) variant:** enable the Kyma trial, containerise the MCP server
   (`node:22-alpine`, `npm ci --omit=dev`, `CMD ["node","server.mjs"]`), and deploy a Deployment +
   Service + APIRule. Time-boxed to 3 h: it covers "Kubernetes foundational knowledge".
5. Record a **3-minute demo video** of a voice-style conversation (read test conversations 2, 4, 7, 8
   aloud) while showing the CPI monitor and the CAP case.

**Checkpoint 4:** full conversation runs against cloud backends; one correlation ID is traceable in APIM analytics and the CPI MPL.

---

## Phase 5: On-premise / ECC path (Days 9–12, ~12 h)

**Skills:** Cloud Connector, RFC/BAPI, ABAP, IDoc/ALE, principal concepts of hybrid integration.

1. Run the **ABAP Platform Trial 2023** (`sapse/abap-cloud-developer-trial:2023`; follow
   https://github.com/SAP-docs/abap-platform-trial-image; hostname must be `vhcala4hci`; install
   the licence). Or use your company sandbox **with written permission**.
2. Create the ABAP objects in `code/abap/` (see its README) and test `Z_LUMEN_ORDER_STATUS` in SE37.
3. **Cloud Connector:** connect it to your trial subaccount → *Cloud To On-Premise* → add system
   (ABAP System, RFC, internal host `vhcala4hci`, instance `00`, virtual host `lumen-ecc`) →
   resources: function names prefixed `Z_LUMEN`, `BAPI_FL`, `BAPI_TRANSACTION`.
   Then the HTTP path `/sap/bc/srt/idoc` for the IDoc step.
4. **BTP destination** `LUMEN_ECC_RFC`: type RFC, proxy OnPremise, `jco.client.ashost=lumen-ecc`,
   `jco.client.sysnr=00`, `jco.client.client=001`, user/password of a dedicated RFC user.
5. iFlow `AGT_GetOrderStatus_ECC`: HTTPS sender → Groovy 01 → **RFC receiver** (destination
   `LUMEN_ECC_RFC`) with an RFC-XML request built by Content Modifier:
   ```xml
   <ns0:Z_LUMEN_ORDER_STATUS xmlns:ns0="urn:sap-com:document:sap:rfc:functions">
     <IV_ORDER_ID>${property.orderId}</IV_ORDER_ID>
   </ns0:Z_LUMEN_ORDER_STATUS>
   ```
   → Groovy (write it yourself; use 03 as the model): read `ES_ORDER`, check `ET_RETURN` for type
   `E`/`A`, then map to the **same agent JSON** as the S/4 iFlow.
   *This is the key architectural point: one agent contract, two backends (S/4 OData and ECC RFC).*
6. Add an APIM route `/orders/status?system=ecc` (or a header) that routes to the ECC iFlow. The
   agent and the MCP server don't change at all.
7. **BAPI + commit** and **IDoc** exercises: see `code/abap/README.md`.

**Checkpoint 5:** the agent reads an "ECC" order through Cloud Connector; you produced an IDoc in
status 51, fixed it, and reprocessed it in BD87.

---

## Phase 6: Event-driven (Days 13–14, ~6 h)

**Skills:** Event Mesh / Advanced Event Mesh, AMQP, topics vs. queues, CloudEvents, proactive agent scenarios.

Scenario: when a technician appointment is rescheduled, or (simulated) a delivery is delayed,
an event triggers a **proactive outbound notification**. Parloa markets proactive outage and delivery updates.

Pick the first option your account offers:
- **A. Event Mesh in Integration Suite** (if the capability appeared in 0.3), or the Event Mesh service in a company subaccount.
- **B. Solace PubSub+ Cloud trial** (the broker behind SAP Advanced Event Mesh).
- **C. Fallback:** CAP local messaging + a CPI JMS queue for guaranteed delivery. Be honest that this is the fallback.

Steps (A or B):
1. Create the queue `lumen/agent/notifications`, subscribed to topic `lumen/servicecloud/appointment/rescheduled/v1`.
2. In CAP, change `requires.messaging` in production to your broker (`enterprise-messaging-shared`
   for Event Mesh; for AEM, the CAP AEM plugin, if your release supports it), redeploy, and
   reschedule an appointment.
3. CPI iFlow `EVT_AppointmentRescheduled`: **AMQP sender** (queue) → Groovy builds the notification
   text → HTTP to a webhook (webhook.site), or Twilio SMS trial.
4. Make the consumer fail on purpose: watch the redelivery, then add a dead-letter queue.

**Checkpoint 6:** reschedule in the agent → event → notification arrives. You can explain queue vs. topic, at-least-once delivery, and why consumers must be idempotent.

---

## Phase 7: Non-SAP + B2B (Days 15–16, ~6 h)

**Skills:** Open Connectors, Integration Advisor (MIG/MAG), non-SAP CRM/ITSM.

1. **Open Connectors → ServiceNow:** create a connector instance against your PDI, and test
   `POST /incidents` in the API docs view.
2. iFlow `AGT_CreateITTicket`: HTTPS → **Open Connectors receiver** → ServiceNow incident.
   Add MCP tool `create_it_ticket`. *Story hook:* SAP itself uses Parloa as an internal IT
   concierge; this is exactly that pattern.
3. Optional: the same against Salesforce (Case object), to show "SAP-centric, but not SAP-only".
4. **Integration Advisor:** build a MIG for `ORDERS05` IDoc and a MIG for X12 850 (or EDIFACT ORDERS);
   create the MAG mapping, generate runtime artefacts, and deploy into CPI. Two to three hours is enough;
   you only need to be able to describe MIG → MAG → runtime artefact.

**Checkpoint 7:** an IT ticket is created in ServiceNow from the agent conversation.

---

## Phase 8: SAP Business AI (Days 17–19, ~8 h)

**Skills:** SAP AI Core, AI Launchpad, generative AI hub orchestration, Joule, MCP.

1. Start the **Generative AI Hub trial** now (30 days). In **AI Launchpad**: check the resource group,
   deploy the orchestration service, and try models in the prompt editor.
2. Build the **post-call summary** in CAP: new action `summarizeConversation(caseId, transcript)` that
   calls the orchestration service through the SAP Cloud SDK for AI (`@sap-ai-sdk/orchestration`; check
   the current README for the exact API) with:
   - a **template** that outputs the 4-part hand-off summary format from the briefing
   - **data masking** (anonymise names and phone numbers before the LLM sees them)
   - **content filtering** on input and output

   It writes the result to `Cases.conversationSummary`. This mirrors Parloa's post-call summarisation.
3. **Joule** (use your company tenant, with permission; Joule Studio isn't in the trial): build a Joule
   skill/agent "Order status for employees" that calls **the same APIM proxy** through a destination.
   *Talking point:* one governed API layer, two agent consumers: Parloa for external customers, Joule for internal users.
4. **MCP depth:** add OAuth to the HTTP MCP endpoint (XSUAA-issued JWT instead of a static bearer),
   and be ready to discuss MCP tool-description design, prompt-injection risk from tool output, and
   why write tools need confirmation steps.

**Checkpoint 8:** a hand-off writes an LLM-generated, PII-masked summary; the Joule skill answers from the same API.

---

## Phase 9: Operate it, tune it, break it (Day 20, plus continuously, ~6 h)

Do every exercise below on purpose, and log symptom → diagnosis → fix → prevention in `templates/issue-log.md`.

| # | Break it | Where you diagnose | Fix |
|---|----------|--------------------|-----|
| 1 | Leave **CSRF protection ON** on the HTTPS sender, then POST | 403 in CPI MPL | Disable CSRF for server-to-server, or fetch the token |
| 2 | Remove `authorities` from xs-security | 403 from CAP with a valid token | Add `$XSAPPNAME.AgentTool` to authorities, redeploy, rebind |
| 3 | Wrong virtual host in the destination vs. Cloud Connector | *"Could not open connection"*, Cloud Connector audit log | Match virtual host/port exactly |
| 4 | RFC resource not exposed in Cloud Connector | `Access denied for Z_LUMEN_…` | Add the function-name prefix |
| 5 | Forget `BAPI_TRANSACTION_COMMIT` | BAPI returns success, no booking in SBOOK | Commit in the same session, or a wrapper FM |
| 6 | Send an IDoc for a non-existent flight | WE02 status 51 | Fix the data, reprocess in BD87 |
| 7 | Encode `$filter` wrongly (spaces, quotes) | 400 from OData | URL-encode; let the adapter build the query |
| 8 | Expired/wrong S/4 API key | 401 → agent hint `BACKEND_AUTH` | Rotate the secure parameter, no redeploy of the iFlow needed |
| 9 | Fire 50 parallel calls | APIM spike-arrest 429s, CPI latency | Tune rate, add response cache, `$select` |
| 10 | Pull `$expand=to_Item` without `$select` | Payload ~10× bigger, slower | Trim fields: measure before/after |
| 11 | Let HANA Cloud trial stop overnight | CAP 500 at startup | Restart instance; discuss health checks |
| 12 | Disable the consumer during events | Messages pile up in the queue | Explain at-least-once + idempotent consumer |

**Performance mini-study:** for the order status call, measure p50/p95 over 30 calls at four stages:
direct S/4 sandbox, via CPI, via APIM, via APIM with cache. Put the table in your architecture doc.
For voice, every hop matters, so be ready to say where the milliseconds go.

---

## Phase 10: Architecture, playbook, story (Days 21–22, ~6 h)

1. Fill `templates/architecture.md`: context diagram, ISA-M integration styles and patterns used,
   Clean Core assessment, security model, NFRs (latency budget!), and the decisions you made.
2. Fill `templates/playbook.md`: how Lumen's integration would be **repeated for the next customer**
   (discovery questions, reference architecture, reusable iFlow package, APIM product template,
   go-live checklist). This is literally the CoE job.
3. **PI/PO module (knowledge only; there's no PI/PO trial).** Study: ICO vs. iFlow, adapter mapping
   PI → CPI, Integration Suite's **migration assessment** and **migration tooling**, and what can't
   migrate 1:1 (ccBPM, some adapter modules). If your company system has PI/PO, explore it
   read-only with permission. Say *"I know the migration path"*, never *"I ran PI/PO in production"*
   unless you did.
4. Push everything to GitHub with a README and the demo video link.
5. Rehearse `INTERVIEW.md` out loud.
