# Turning the lab into interview answers

## 1. How to describe this work (and stay credible)

Parloa's later rounds are technical (the sibling Agent Architect posting lists a Technical Screen,
Technical Interview(s) and a Bar Raiser). Experienced interviewers probe until they reach the
edge of what you actually did. So use precise framing. It **is** experience, and it's
demo-able, which beats a vague client claim.

| Say | Don't say |
|---|---|
| "I built a reference implementation of exactly this pattern on BTP: an AI agent calling S/4HANA and an ECC-style backend through API Management and Cloud Integration. Happy to show it." | "I delivered this for a client." |
| "In my current role I work with Integration Suite, CAP, Joule and AI Core in production. In the lab I extended that to RFC/IDoc via Cloud Connector, Event Mesh and Open Connectors." | Implying lab-only skills came from client projects |
| "I haven't run PI/PO in production; I know the migration path to Integration Suite and the assessment tooling." | Claiming PI/PO production experience |

Your issue log is real troubleshooting experience. Tell those stories with confidence.

## 2. The 2-minute architecture talk track (whiteboard)

1. **Problem.** *"An agent that only talks is a demo. It has to read and act on systems of record
   mid-conversation, within a voice latency budget, securely, and the same way at every customer."*
2. **Layers.** Agent → tools (MCP) → **API Management** (keys, quotas, caching, one governance
   point) → **Cloud Integration** (mapping to an agent-shaped contract, orchestration, error
   translation) → backends: **S/4 released OData APIs**, **ECC via RFC + Cloud Connector**,
   **Service Cloud** for cases, **non-SAP via Open Connectors**, **events** for proactive scenarios.
3. **Agent contract.** *"Same JSON for S/4 and ECC, so the agent never changes when the backend
   does. Errors carry an `agentHint`, so the agent apologises correctly instead of hallucinating."*
4. **Non-functionals.** Idempotent writes (`conversationId`), caller verification before
   disclosure, PII minimisation and masked logs, measured p95 latency per hop.
5. **Clean core.** Released APIs only in S/4, side-by-side CAP extensions, custom RFC only in ECC
   where no released API exists.
6. **Repeatability.** Reusable iFlow package, Groovy library, APIM product template, test
   conversations, playbook. *"That's what a CoE should produce."*

## 3. STAR stories to prepare (fill from your issue log)

| Story | Source | Fill in |
|---|---|---|
| A 403 that wasn't an auth bug | Phase 3: xs-security `authorities` | S/T/A/R |
| Making a voice agent faster | Phase 9 perf study (cache, `$select`, token cache) with numbers | |
| BAPI "success" but nothing saved | Phase 5: commit/LUW | |
| IDoc in status 51 | Phase 5: WE02 → root cause → BD87 | |
| Duplicate cases from retries | Phase 1: idempotency key | |
| Same agent, two backends | Phase 5: S/4 OData + ECC RFC behind one contract | |
| An AI guardrail | Current job: anomaly agent returned INCONCLUSIVE instead of inventing a baseline | (already have) |

Format: **S**ituation (1 sentence) → **T**ask → **A**ction (the technical detail, tools used) →
**R**esult (number) → **Lesson** (what's now in the playbook).

## 4. Likely technical questions, with outline answers

**Integration Suite**
- *OData adapter vs HTTP adapter?* OData: metadata-driven wizard, handles CSRF, paging and batch.
  HTTP: full control, lighter, needs manual CSRF for writes. Choose by operation and reuse.
- *How do you handle errors in an iFlow?* Exception subprocess, typed error catalogue, correct HTTP
  status back to the caller, MPL custom properties and attachments, alerting; idempotent retries
  (JMS / Idempotent Process Call) for async.
- *How do you secure credentials?* Security material (user credentials, OAuth2 client credentials,
  secure parameters), keystore for certificates, never in Content Modifiers.
- *Groovy best practices?* Stream large payloads (no `getBody(String)` on big messages), no
  logging of PII, reusable script collections, local unit tests (you have a harness: mention it).
- *Performance tuning?* `$select`/`$filter` at source, avoid unnecessary XML↔JSON conversions,
  parallel multicast where independent, cache in APIM, measure per step with trace.

**Interfaces**
- *OData V2 vs V4?* V4: JSON-native, `$apply`, better batch; S/4 has both; CAP serves V4 by default.
- *RFC vs BAPI vs IDoc?* RFC = remote function call (sync or tRFC/qRFC async); BAPI = released,
  business-object RFC with BAPIRET2 and caller-owned commit; IDoc = async document via ALE, with
  status tracking (WE02/BD87) and partner profiles.
- *When would you still use SOAP?* Released SOAP services in S/4 (many async A2A services), and
  legacy partners.

**Connectivity and security**
- *How does CPI reach on-prem?* Cloud Connector (outbound-only tunnel), system mapping with virtual
  host, resource allow-list, destination with ProxyType OnPremise; Location ID for several connectors.
- *Principal propagation?* User identity flows from cloud to on-prem via short-lived certificates
  mapped to backend users. For an agent acting on behalf of an anonymous caller you typically use a
  technical user plus your own caller verification, so be able to explain this trade-off.

**Agents, AI, MCP**
- *What makes a good agent tool?* Coarse, task-shaped, described for the model, strict schemas,
  idempotent writes, small speakable responses, errors as instructions.
- *Where does MCP fit with SAP?* A standard way to expose the governed API layer to any agent
  (Parloa, Joule, others) instead of a bespoke connector per platform; secure it with OAuth, and
  treat tool output as untrusted input (prompt injection).
- *SAP AI Core / generative AI hub?* Resource groups, deployments, orchestration (templating,
  masking, filtering, grounding), model access across providers; AI Launchpad as the UI.
- *How do you stop the agent inventing an order status?* Tools are the only source of facts, the
  briefing says so, errors carry hints, and test conversations check it (your Performance-Lab table).

**Architecture**
- *Clean Core in one sentence?* Keep the ERP standard: released APIs and extension points only,
  extensions side-by-side on BTP, so upgrades stay cheap.
- *ISA-M?* SAP's integration methodology: classify by integration domain and style (process, data,
  analytics, user, thing), pick a pattern, then a technology. Your `architecture.md` table is an example.
- *How would you make this repeatable across 20 customers?* Show `playbook.md`.

## 5. Questions to ask them (technical rounds)
- What share of SAP deployments uses the standard Service Cloud path vs. custom S/4/ECC integration?
- Do customers bring their own Integration Suite tenant, or does Parloa host the integration layer?
- How do Agent Architects consume integrations today: REST tools, MCP, something else?
- What's the latency budget for a tool call in a live voice conversation?
- How mature is the CoE asset library today, and what should the first reusable asset be?
