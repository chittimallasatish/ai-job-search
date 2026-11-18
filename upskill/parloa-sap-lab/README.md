# Parloa SAP Integration Architect: hands-on lab

**One project that exercises every skill in the Parloa "SAP Integration Architect" posting.**
You build what that role builds: the bridge that lets a conversational AI agent *read and act on*
SAP data mid-conversation, and then you turn it into a repeatable playbook.

## The scenario
**Lumen Appliances** (fictional) sells dishwashers, fridges and ovens and runs SAP. Its AI phone
agent "Leo" must:
1. verify the caller → 2. tell them where their order is (S/4HANA, or ECC for legacy orders) →
3. open a service case for a broken appliance (Service Cloud) → 4. reschedule a technician →
5. hand off to a human with an AI summary → 6. notify proactively when something changes (events) →
7. open IT tickets in ServiceNow for internal callers.

This mirrors the flow SAP used to certify Parloa as an Endorsed App: voice authentication,
service-order retrieval, appointment rescheduling, troubleshooting, and hand-off with an AI summary.

## Architecture
```
 Caller ─▶ AI agent (Claude Desktop / MCP Inspector / Joule  ≈ "Parloa")
              │  MCP tools  (code/mcp-server)
              ▼
     SAP API Management  ── key, quota, spike arrest, cache, OAuth to backends
        │                              │
        ▼                              ▼
 SAP Cloud Integration            CAP service on BTP (code/cap-servicecloud-mock)
 (Groovy, exception handling)     "Service Cloud": cases, appointments, hand-off
   │          │          │              │ events
   ▼          ▼          ▼              ▼
 S/4HANA   ECC (ABAP   ServiceNow    Event Mesh / Advanced Event Mesh ─▶ CPI ─▶ notification
 sandbox   trial) via  via Open
 OData     Cloud Conn. Connectors
           RFC/BAPI/IDoc
              ▲
 Generative AI hub (AI Core / Launchpad): post-call summaries with masking + filtering
```

## What's in here
| Path | What | Status |
|---|---|---|
| `GUIDE.md` | Step-by-step build guide, 11 phases, with checkpoints | read first |
| `INTERVIEW.md` | How to talk about it, talk track, STAR slots, technical Q&A | |
| `code/cap-servicecloud-mock/` | CAP (Node) OData V4 service: auth roles, idempotency, business rules, events | ✅ runs locally, tested |
| `code/mcp-server/` | MCP server with 6 tools, stdio + HTTP transports; `dev/mock-orders.mjs` | ✅ runs locally, tested |
| `code/cpi-groovy/` | 5 CPI scripts + local test harness (`test/run-tests.sh`) | ✅ all pass locally against stub SAP classes |
| `code/apim-policies/POLICIES.md` | API Management policy set (key, quota, cache, OAuth token caching) | paste-ready; validate in the policy editor |
| `code/abap/` | Table, structure, seed class, RFC FM + BAPI and IDoc exercises | for ABAP trial / company sandbox |
| `agent/briefing.md` | Natural-language agent briefing + 10 test conversations | |
| `templates/` | Issue log, architecture doc (ISA-M / Clean Core), CoE playbook | fill as you go |

## Skill coverage: every line of the posting
| Posting requirement | Where you practise it |
|---|---|
| Own integration & orchestration architectures, SAP + non-SAP, cloud + on-prem | Phases 2, 5, 7, 10 · `templates/architecture.md` |
| Full lifecycle: discovery → build → test → go-live | Phases 1–10 · playbook discovery and go-live checklist |
| **SAP CI** | Phase 2 (3 iFlows), 5, 6, 7 |
| **Event Mesh** | Phase 6 |
| **API Management** | Phase 3 · `POLICIES.md` |
| **Integration Advisor** | Phase 7.4 |
| **Open Connectors** | Phase 7 |
| SAP PI/PO (on demand) | Phase 10.3: knowledge + migration path (no trial exists; be honest) |
| **OData / REST** | Phases 1–4 (V2 S/4, V4 CAP) |
| **SOAP** | Phase 5 IDoc-over-SOAP (`/sap/bc/srt/idoc`); optional: a released S/4 SOAP API from the Hub |
| **RFM / BAPI** | Phase 5 · `code/abap` |
| **ALE / IDoc** | Phase 5 · `code/abap/README.md` |
| Monitoring, troubleshooting, connectivity config, performance tuning | Phase 9 (12 break-it labs + perf study) |
| **SAP AI Core, AI Launchpad** | Phase 8 |
| **Joule agents & skills** | Phase 8.3 (company tenant) |
| **MCP** | Phases 1, 4, 8.4 · `code/mcp-server` |
| Groovy | `code/cpi-groovy` (+ unit tests) |
| Foundational ABAP | `code/abap` |
| Customer workshops / advisory | `templates/playbook.md` §1 + `INTERVIEW.md` talk track |
| Enable non-SAP colleagues | Write the README of your GitHub repo for an "Agent Architect" audience |
| CoE: accelerators, reference architectures, playbooks | Phase 10 |
| *Nice:* LLM / conversational design | `agent/briefing.md` + test conversations |
| *Nice:* contact-centre / telephony | Phase 6 notification (Twilio trial optional); voice-first latency thinking |
| *Nice:* Clean Core, ISA-M, Extensibility | `templates/architecture.md` §3–4 |
| *Nice:* Service Cloud / CX | CAP stand-in models the case → appointment → hand-off flow |
| *Nice:* **CAP on BTP** | Phases 1, 3, 8 |
| *Nice:* non-SAP CRM/ITSM | Phase 7 (ServiceNow, Salesforce) |
| *Nice:* cloud + Kubernetes, Node/TypeScript, SQL | Phase 4 (CF + optional Kyma), MCP server, CDS/HANA |
| *Nice:* Datasphere / SAC | Not covered: low priority for this role |

## Where each piece runs
| Piece | BTP trial | Local | Company system (written permission only, sandbox/dev only) |
|---|---|---|---|
| Integration Suite (CI, APIM, Open Connectors, Integration Advisor) | ✅ | | |
| Event Mesh | ⚠ check capability list; trial availability has been intermittent | Solace trial as fallback | ✅ if licensed |
| CAP + HANA Cloud + Cloud Foundry, Kyma | ✅ (HANA stops nightly) | ✅ CAP with SQLite | |
| S/4HANA | Business Accelerator Hub **sandbox** (read) | | |
| ECC / RFC / BAPI / IDoc / ABAP | Cloud Connector | ABAP Platform Trial in Docker (32 GB RAM) or a cloud VM | ✅ preferred if available |
| AI Core / AI Launchpad / generative AI hub | Generative AI hub 30-day trial (AI Core isn't in the standard trial) | | ✅ |
| Joule Studio | ✘ | | ✅ |
| PI/PO | ✘ | | read-only exploration if it exists |

> **Company system rule:** use only a sandbox/dev client, get your manager's OK in writing, never
> copy company data or code into this repo, and say "in my company sandbox" when you describe it.

## Schedule (~3–4 h/day)
| When | Phases | Interview value |
|---|---|---|
| **Today / tomorrow** | Recruiter screen Nov 19: no build needed. Read README + INTERVIEW §2 | You can say you're building it |
| Week 1 | 0–4: local loop → CPI → CAP + APIM → cloud end-to-end | **Core story: enough for a first technical screen** |
| Week 2 | 5–7: Cloud Connector, RFC/BAPI/IDoc, events, Open Connectors, Integration Advisor | Breadth across the posting's interface list |
| Week 3 | 8–10: AI hub, Joule, MCP auth, break-it labs, architecture + playbook, demo video | Bar-raiser depth |

If the technical interview comes sooner, prioritise in this order: **Phase 1 → 2 → 3 → 9 (items 1, 2, 9, 10) → 5 → 10**.

## Quick start (5 minutes, local)
```bash
cd code/cap-servicecloud-mock && npm install && npx cds watch              # terminal 1
cd code/mcp-server && npm install && node dev/mock-orders.mjs               # terminal 2
cd code/mcp-server && BASIC_AUTH=parloa-agent:agent npm run inspect          # terminal 3
```
In the MCP Inspector (if the tools return 401, add `BASIC_AUTH=parloa-agent:agent` under *Environment Variables* in the Inspector's left panel and reconnect): call `verify_customer` with `1000001` / `10001`, then `get_appointments` for `1000001`.
