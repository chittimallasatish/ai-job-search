#!/usr/bin/env node
// Lumen SAP MCP server
// --------------------
// Exposes six task-shaped tools that an AI agent (Claude Desktop, MCP Inspector, a Joule agent,
// or - conceptually - a Parloa agent) can call mid-conversation. Each tool calls the governed
// API layer you build in the lab:
//
//   ORDERS_API_URL        -> SAP API Management proxy -> Cloud Integration iFlow -> S/4HANA sales order API
//   SERVICECLOUD_API_URL  -> SAP API Management proxy -> CAP "Service Cloud" mock (OData V4)
//
// Transports: stdio (default, for desktop MCP clients) or streamable HTTP (MCP_TRANSPORT=http,
// for deployment on Cloud Foundry / Kyma).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import express from 'express'
import { z } from 'zod'

const cfg = {
  ordersUrl: process.env.ORDERS_API_URL ?? 'http://localhost:4005/agent/orderstatus',
  scBase: (process.env.SERVICECLOUD_API_URL ?? 'http://localhost:4004/servicecloud').replace(/\/$/, ''),
  apiKey: process.env.API_KEY ?? '',
  apiKeyHeader: process.env.API_KEY_HEADER ?? 'APIKey',
  basicAuth: process.env.BASIC_AUTH ?? '', // "user:password" - only for local CAP testing
  timeoutMs: Number(process.env.TIMEOUT_MS ?? 4000),
  transport: process.env.MCP_TRANSPORT ?? 'stdio',
  port: Number(process.env.PORT ?? 8080),
  bearer: process.env.MCP_BEARER_TOKEN ?? ''
}

// stdout belongs to the MCP protocol in stdio mode - log to stderr only.
const log = (...a) => console.error('[lumen-mcp]', ...a)

class ToolError extends Error {}

async function call (method, url, body) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (cfg.apiKey) headers[cfg.apiKeyHeader] = cfg.apiKey
  if (cfg.basicAuth) headers.Authorization = 'Basic ' + Buffer.from(cfg.basicAuth).toString('base64')

  const started = Date.now()
  let res
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeoutMs)
    })
  } catch (e) {
    log(method, url, 'FAILED', e.name, e.message)
    throw new ToolError(e.name === 'TimeoutError'
      ? 'The backend system did not answer in time. Apologise, offer to create a case so a colleague follows up.'
      : 'The backend system is unreachable right now. Offer a callback or a hand-off to a human.')
  }
  const text = await res.text()
  log(method, url, res.status, `${Date.now() - started}ms`)
  let json
  try { json = text ? JSON.parse(text) : {} } catch { json = { raw: text } }
  if (!res.ok) {
    // Pass through agent-friendly errors from CPI (error.agentHint) or CAP (error.message).
    const msg = json?.error?.agentHint ?? json?.error?.message ?? `Backend returned HTTP ${res.status}`
    throw new ToolError(msg)
  }
  return json
}

const ok = data => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] })
const fail = msg => ({ content: [{ type: 'text', text: `ERROR: ${msg}` }], isError: true })
const strip = o => { if (o && typeof o === 'object') delete o['@odata.context']; return o }

async function guarded (fn) {
  try { return ok(await fn()) } catch (e) {
    if (e instanceof ToolError) return fail(e.message)
    log('Unexpected error', e)
    return fail('Unexpected internal error. Offer a hand-off to a human.')
  }
}

function buildServer () {
  const server = new McpServer({ name: 'lumen-sap-tools', version: '1.0.0' })

  server.registerTool('verify_customer', {
    title: 'Verify caller identity',
    description: 'Authenticate the caller BEFORE sharing any order or case data. Requires the customer number and the postal code on file. Returns verified=true/false only - never reveal which factor was wrong.',
    inputSchema: {
      customerId: z.string().regex(/^\d{1,10}$/).describe('Customer number, digits only'),
      postalCode: z.string().min(3).max(10).describe('Postal code the caller states')
    }
  }, args => guarded(async () => strip(await call('POST', `${cfg.scBase}/verifyCustomer`, args))))

  server.registerTool('get_order_status', {
    title: 'Get sales order status',
    description: 'Look up a sales order in SAP S/4HANA: processing and delivery status, requested delivery date and items. Use only after verify_customer succeeded. The response contains a "speakable" sentence suitable for voice.',
    inputSchema: {
      orderId: z.string().regex(/^\d{1,10}$/).describe('Sales order number, digits only')
    }
  }, ({ orderId }) => guarded(async () => {
    const u = new URL(cfg.ordersUrl)
    u.searchParams.set('orderId', orderId)
    return call('GET', u.toString())
  }))

  server.registerTool('create_case', {
    title: 'Create service case',
    description: 'Create a service case in SAP Service Cloud for a verified customer. Always pass the conversationId so a retried call does not create a duplicate case. Priority is inferred automatically if omitted.',
    inputSchema: {
      customerId: z.string().regex(/^\d{1,10}$/),
      subject: z.string().min(5).max(120).describe('Short problem statement, e.g. "Dishwasher error E24"'),
      description: z.string().max(1000).optional(),
      product: z.string().max(40).optional(),
      salesOrder: z.string().regex(/^\d{1,10}$/).optional(),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
      conversationId: z.string().min(3).max(64).describe('Unique ID of this conversation (idempotency key)')
    }
  }, ({ customerId, ...rest }) => guarded(async () => {
    const c = strip(await call('POST', `${cfg.scBase}/Cases`, { customer_ID: customerId, channel: 'VOICE', ...rest }))
    return { caseId: c.ID, caseNumber: c.caseNumber, priority: c.priority, status: c.status }
  }))

  server.registerTool('get_appointments', {
    title: 'List technician appointments',
    description: 'List upcoming technician appointments for a verified customer.',
    inputSchema: { customerId: z.string().regex(/^\d{1,10}$/) }
  }, ({ customerId }) => guarded(async () => {
    const filter = encodeURIComponent(`customer_ID eq '${customerId}' and status ne 'CANCELLED'`)
    const r = await call('GET', `${cfg.scBase}/Appointments?$filter=${filter}&$orderby=startsAt`)
    return r.value.map(({ ID, technician, startsAt, endsAt, status }) => ({ appointmentId: ID, technician, startsAt, endsAt, status }))
  }))

  server.registerTool('reschedule_appointment', {
    title: 'Reschedule appointment',
    description: 'Move a technician appointment to a new start time (ISO 8601, UTC). Slots are 2 hours, Monday-Friday, 08:00-18:00 Eastern. If the technician is busy the error tells you so - offer the caller another time.',
    inputSchema: {
      appointmentId: z.string().uuid(),
      newStart: z.string().describe('ISO 8601 date-time in UTC, e.g. 2026-12-04T14:00:00Z')
    }
  }, args => guarded(async () => strip(await call('POST', `${cfg.scBase}/rescheduleAppointment`, args))))

  server.registerTool('handoff_to_human', {
    title: 'Hand off to a human agent',
    description: 'Escalate to a human agent. Writes your conversation summary to the case so the human does not have to re-ask. Summary must state: who the caller is (verified?), the problem, what was tried, and what the caller wants.',
    inputSchema: {
      caseId: z.string().uuid(),
      summary: z.string().min(20).max(4000)
    }
  }, args => guarded(async () => {
    const c = strip(await call('POST', `${cfg.scBase}/requestHandoff`, args))
    return { caseNumber: c.caseNumber, status: c.status, handoffRequested: c.handoffRequested }
  }))

  return server
}

async function main () {
  if (cfg.transport === 'http') {
    const app = express()
    app.use(express.json({ limit: '1mb' }))
    app.get('/health', (_req, res) => res.json({ status: 'UP' }))
    app.post('/mcp', async (req, res) => {
      if (cfg.bearer && req.headers.authorization !== `Bearer ${cfg.bearer}`) {
        return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null })
      }
      // Stateless mode: a fresh server + transport per request.
      const server = buildServer()
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
      res.on('close', () => { transport.close(); server.close() })
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    })
    app.listen(cfg.port, () => log(`HTTP MCP endpoint on :${cfg.port}/mcp`))
  } else {
    await buildServer().connect(new StdioServerTransport())
    log('stdio transport ready')
  }
}

main().catch(e => { log(e); process.exit(1) })
