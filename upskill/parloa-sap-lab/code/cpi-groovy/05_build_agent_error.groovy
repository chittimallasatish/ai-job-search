/*
 * Exception Subprocess (Error Start -> Script -> End): turn any failure into a small, typed error
 * an AI agent can act on, with the right HTTP status for API Management.
 *
 *   {"error":{"code":"ORDER_NOT_FOUND","retryable":false,"agentHint":"...","correlationId":"..."}}
 *
 * The agentHint is phrased as an instruction to the agent - that is how the agent turns a
 * backend failure into a graceful sentence instead of hallucinating an answer.
 */
import com.sap.gateway.ip.core.customdev.util.Message
import groovy.json.JsonOutput

def Message processData(Message message) {
    def ex = message.getProperty('CamelExceptionCaught')
    String code = message.getProperty('agentErrorCode') as String
    Integer backendStatus = null
    String backendBody = null

    // HTTP receiver adapter failures expose the backend status code and body.
    if (ex != null && ex.metaClass.respondsTo(ex, 'getStatusCode')) {
        backendStatus = ex.getStatusCode() as Integer
        backendBody = ex.metaClass.respondsTo(ex, 'getResponseBody') ? ex.getResponseBody() : null
    }

    if (!code) {
        switch (backendStatus) {
            case 404: code = 'ORDER_NOT_FOUND'; break
            case 400: code = 'INVALID_ORDER_ID'; break
            case [401, 403]: code = 'BACKEND_AUTH'; break
            case 429: code = 'BACKEND_THROTTLED'; break
            default: code = backendStatus ? 'BACKEND_ERROR' : 'INTEGRATION_ERROR'
        }
    }

    String orderId = message.getProperty('orderId') ?: ''
    def catalog = [
        INVALID_ORDER_ID : [400, false, 'Ask the caller to repeat the order number - it should contain digits only.'],
        ORDER_NOT_FOUND  : [404, false, "I could not find order ${orderId}. Ask the caller to check the number on the confirmation e-mail."],
        BACKEND_AUTH     : [502, false, 'The order system rejected our credentials. Apologise and offer a hand-off to a human.'],
        BACKEND_THROTTLED: [503, true,  'The order system is busy. Wait two seconds and try once more; if it fails again offer a callback.'],
        BACKEND_CONFIG   : [500, false, 'The order system is not configured. Offer a hand-off to a human.'],
        BACKEND_ERROR    : [502, true,  'The order system had a problem. Try once more; if it fails again offer a callback.'],
        INTEGRATION_ERROR: [500, true,  'Something went wrong on our side. Offer to create a case so a colleague follows up.']
    ]
    def (status, retryable, hint) = catalog[code] ?: catalog.INTEGRATION_ERROR

    def messageLog = messageLogFactory.getMessageLog(message)
    if (messageLog != null) {
        messageLog.setStringProperty('agentErrorCode', code)
        messageLog.addAttachmentAsString('error.txt',
            "code=${code}\nbackendStatus=${backendStatus}\nexception=${ex?.getClass()?.name}: ${ex?.message}\nbackendBody=${backendBody?.take(2000)}",
            'text/plain')
    }

    message.setBody(JsonOutput.toJson([error: [
        code         : code,
        retryable    : retryable,
        agentHint    : hint,
        correlationId: message.getProperty('correlationId') ?: message.getHeaders().get('SAP_MessageProcessingLogID')
    ]]))
    message.setHeader('CamelHttpResponseCode', status)
    message.setHeader('Content-Type', 'application/json')
    return message
}
