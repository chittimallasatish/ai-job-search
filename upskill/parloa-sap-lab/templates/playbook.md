# Playbook: connecting a conversational AI agent to a customer's SAP estate

_The SAP CoE deliverable: how to do the Lumen project again, faster, for the next customer._

## 1. Discovery workshop (half-day): questions to ask
- Top 5 contact reasons by volume. Which ones need SAP data or actions?
- Which SAP systems hold that data? S/4HANA (cloud/private/on-prem), ECC, Service Cloud/C4C, CRM, non-SAP.
- Is there a released API (Business Accelerator Hub) per use case? If not: BAPI/RFC, IDoc, or custom CDS/RAP service?
- Integration platform in place: Integration Suite? PI/PO? Third-party ESB? Who owns it?
- Connectivity: Cloud Connector installed? Network/firewall lead times?
- Identity: how is the caller authenticated today? What may the agent see before/after authentication?
- Latency: response time of the backend APIs today (measure, don't assume).
- Security/compliance: PII rules, logging retention, GDPR/HIPAA/PCI scope.
- Clean Core stance and transport/change process.
- Hand-off: which agent desktop? What must the summary contain?

## 2. Reference architecture
_Link `architecture.md`. Agent → MCP/tools → API Management → CPI (mapping/orchestration) → backends._

## 3. Reusable assets
| Asset | Location | Customise per customer |
|---|---|---|
| iFlow package "Agent Integrations" (order status S/4, ECC variant, case create) | CPI | backend URLs, credentials |
| Groovy library: validation, agent error catalogue, masked logging | `code/cpi-groovy` | error hints / language |
| APIM product template + policy set | `code/apim-policies` | quotas |
| Agent contract (JSON shapes) | | none: keep stable |
| MCP tool server | `code/mcp-server` | tool list |
| Test conversation set | `agent/briefing.md` | per use case |

## 4. Delivery plan template (2–6 weeks to first go-live)
| Week | Activities | Exit criterion |
|---|---|---|
| 1 | Discovery, API inventory, connectivity requests | Use cases + APIs agreed |
| 2 | Build read APIs, agent contract, tests | Order status live in test |
| 3 | Write APIs (cases, appointments), idempotency, hand-off | All tools pass test conversations |
| 4 | Performance, security review, monitoring set-up | p95 within budget, runbook ready |
| 5 | UAT with service experts, go-live | Go-live checklist signed |

## 5. Go-live checklist
- [ ] Payload logging off / masked; trace off
- [ ] Credentials in secure store / KVM, rotated from test values
- [ ] Quotas and spike arrest set per consumer
- [ ] Alerts on CPI failures (alert notification service / Cloud ALM)
- [ ] Runbook: top 10 errors and their fixes (from the issue log)
- [ ] Rollback plan

## 6. Lessons learned (from issue log)
- …
