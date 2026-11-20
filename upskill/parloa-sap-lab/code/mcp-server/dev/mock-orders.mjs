// Local stand-in for the Cloud Integration iFlow "AGT_GetOrderStatus" (Phase 1 of the lab).
// Returns exactly the agent-friendly shape that cpi-groovy/map_salesorder_to_agent.groovy produces,
// so you can wire the MCP server end-to-end before BTP is set up. Replace with the real
// API Management URL once Phases 2-3 are done.
import http from 'node:http'

const orders = {
  1: { orderId: '1', processingStatus: 'C', processingStatusText: 'completely processed', deliveryStatus: 'C', deliveryStatusText: 'fully delivered', requestedDeliveryDate: '2026-11-10', totalNetAmount: '1299.00', currency: 'USD', items: [{ item: '10', material: 'DW-500', description: 'Dishwasher DW-500', quantity: '1', unit: 'PC' }] },
  2: { orderId: '2', processingStatus: 'B', processingStatusText: 'partially processed', deliveryStatus: 'B', deliveryStatusText: 'partially delivered', requestedDeliveryDate: '2026-11-25', totalNetAmount: '2140.00', currency: 'USD', items: [{ item: '10', material: 'FR-900', description: 'Fridge FR-900', quantity: '1', unit: 'PC' }, { item: '20', material: 'IK-01', description: 'Installation kit', quantity: '1', unit: 'PC' }] }
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  const id = url.searchParams.get('orderId') ?? ''
  res.setHeader('Content-Type', 'application/json')
  if (!/^\d{1,10}$/.test(id)) {
    res.statusCode = 400
    return res.end(JSON.stringify({ error: { code: 'INVALID_ORDER_ID', retryable: false, agentHint: 'Ask the caller to repeat the order number - it should contain digits only.' } }))
  }
  const o = orders[Number(id)]
  if (!o) {
    res.statusCode = 404
    return res.end(JSON.stringify({ error: { code: 'ORDER_NOT_FOUND', retryable: false, agentHint: `I could not find order ${id}. Ask the caller to check the number on the confirmation e-mail.` } }))
  }
  const speakable = `Order ${o.orderId} is ${o.processingStatusText} and ${o.deliveryStatusText}. The requested delivery date is ${o.requestedDeliveryDate}.`
  res.end(JSON.stringify({ ...o, speakable }))
}).listen(4005, () => console.log('mock CPI order endpoint on http://localhost:4005/agent/orderstatus?orderId=2'))
