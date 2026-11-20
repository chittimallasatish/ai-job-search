# Reference architecture: AI customer-service agent on an SAP estate (Lumen Appliances)

## 1. Context
- Business goal: resolve order-status, appliance-fault and appointment calls end-to-end by an AI agent, with hand-off to humans.
- Systems: S/4HANA Cloud (sales orders), ECC on-premise (legacy orders, via ABAP trial), Service Cloud (cases/appointments: CAP stand-in), ServiceNow (IT tickets), event broker.
- Consumers: conversational agent (via MCP), Joule (internal users).

## 2. Diagram
_(Draw it: draw.io / Excalidraw. Show agent → MCP → APIM → CPI / CAP → S/4, ECC (via Cloud Connector), ServiceNow (Open Connectors), broker.)_

## 3. ISA-M classification
| Interface | ISA-M integration style | Pattern | Technology | Why |
|---|---|---|---|---|
| get order status (S/4) | Process integration | Synchronous request-reply (API) | APIM → CPI → OData V2 | Agent needs answer within the turn |
| get order status (ECC) | Process integration | Synchronous, cloud-to-on-premise | CPI RFC adapter + Cloud Connector | No released API in ECC |
| create case / reschedule | Process integration | Synchronous API, idempotent | APIM → CAP OData V4 | |
| appointment rescheduled | Process integration | Event-driven, asynchronous | Event Mesh / AEM, AMQP | Proactive outreach, decoupling |
| IT ticket | Process integration | Sync API, non-SAP | Open Connectors | |
| post-call summary | (AI) | Request-reply to LLM via orchestration | Generative AI hub | Masking + filtering |
| _(fill in)_ | | | | |

## 4. Clean Core assessment
- S/4: only **released APIs** used (API_SALES_ORDER_SRV); no modifications. ✔/✘
- ECC: custom RFC `Z_LUMEN_ORDER_STATUS` is acceptable because ECC has no released API for this; plan for its replacement at S/4 migration.
- Extensions are **side-by-side** on BTP (CAP), not in the core.
- No business logic in the integration layer beyond mapping/validation (the iFlow doesn't decide business rules).

## 5. Security
- Agent → APIM: API key per consuming app (+ quota/spike arrest). Next step: OAuth client credentials / mTLS.
- APIM → CPI: OAuth client credentials, token cached.
- CPI → S/4: (sandbox: API key in secure store) / real: OAuth or principal propagation.
- CPI → ECC: technical RFC user, least-privilege S_RFC authorisations, Cloud Connector resource allow-list.
- PII: agent-facing projections exclude unneeded fields; MPL payload logging off by default and masked; LLM input masked.
- Caller authentication before any data disclosure (verify_customer).

## 6. Non-functional requirements
| NFR | Target | Measured | How achieved |
|---|---|---|---|
| Tool-call latency (p95) | < 1,000 ms for voice | | cache, $select, token cache |
| Availability | graceful degradation | | agentHint errors, hand-off |
| Idempotency | no duplicate cases on retry | ✔ | conversationId |
| Observability | trace a call end-to-end | | X-Correlation-ID → MPL Application ID |

## 7. Decisions (ADR log)
| # | Decision | Options considered | Why |
|---|---|---|---|
| 1 | Map S/4 payload to an agent-shaped contract in CPI | pass-through OData; map in MCP server | Keeps the agent contract stable across S/4 and ECC backends |
| 2 | HTTP adapter vs OData adapter for read | | |
| 3 | | | |
