/*
 * iFlow AGT_GetOrderStatus - step 1: validate the agent's request.
 * HTTPS sender address: /agent/orderstatus   (call: GET .../http/agent/orderstatus?orderId=4711)
 *
 * Reads orderId from the query string (header CamelHttpQuery), validates it, and stores it
 * as exchange property "orderId" for the receiver adapter: ...A_SalesOrder('${property.orderId}')
 * Invalid input throws -> exception subprocess -> 05_build_agent_error.groovy returns HTTP 400.
 *
 * Runtime config of the iFlow: Allowed Header(s) = X-Correlation-ID
 */
import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    def headers = message.getHeaders()
    String query = headers.get('CamelHttpQuery') ?: ''

    Map<String, String> params = [:]
    query.split('&').findAll { it }.each { pair ->
        def kv = pair.split('=', 2)
        String key = URLDecoder.decode(kv[0], 'UTF-8')
        String value = kv.size() > 1 ? URLDecoder.decode(kv[1], 'UTF-8') : ''
        params[key] = value
    }

    String orderId = params['orderId']?.trim()
    if (!(orderId ==~ /\d{1,10}/)) {
        message.setProperty('agentErrorCode', 'INVALID_ORDER_ID')
        throw new IllegalArgumentException("orderId must be 1-10 digits, got '${orderId}'")
    }

    message.setProperty('orderId', orderId)
    // Correlation: reuse the ID API Management sends, otherwise fall back to the MPL ID.
    String correlationId = headers.get('X-Correlation-ID') ?: headers.get('SAP_MessageProcessingLogID')
    message.setProperty('correlationId', correlationId)
    message.setHeader('SAP_ApplicationID', orderId) // searchable in Monitor > Message Processing
    return message
}
