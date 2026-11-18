/*
 * Reusable: attach the current payload to the Message Processing Log - masked, and only on demand.
 *
 * Why: in production you cannot log raw customer conversations or orders (GDPR, ISO 27001), and
 * MPL attachments cost tenant storage. Switch logging per iFlow via an externalised parameter
 * {{logPayload}} -> Content Modifier property "logPayload" = true/false.
 * Use it before AND after the backend call while debugging, then switch it off.
 */
import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    if (!'true'.equalsIgnoreCase(message.getProperty('logPayload') as String)) return message

    def messageLog = messageLogFactory.getMessageLog(message)
    if (messageLog == null) return message

    String body = message.getBody(String) ?: ''
    String masked = body
        .replaceAll(/[\w.+-]+@[\w-]+\.[\w.]+/, '***@***')                         // e-mail
        .replaceAll(/\+?\d[\d\s().-]{7,}\d/, '***PHONE***')                       // phone numbers
        .replaceAll(/("(?:postalCode|PostalCode|IBAN|iban)"\s*:\s*")[^"]*(")/, '$1***$2')

    String step = message.getProperty('logStep') ?: 'payload'
    messageLog.addAttachmentAsString("${step}.json", masked.take(20000), 'application/json')
    messageLog.setStringProperty('orderId', message.getProperty('orderId') as String ?: '')
    return message
}
