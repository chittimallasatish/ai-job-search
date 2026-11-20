/*
 * iFlow AGT_GetOrderStatus - step 3: turn the S/4HANA OData V2 response into an agent-friendly payload.
 *
 * Backend call (HTTP receiver, GET):
 *   https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder('${property.orderId}')
 *   Query: $select=SalesOrder,CreationDate,RequestedDeliveryDate,OverallSDProcessStatus,OverallDeliveryStatus,TotalNetAmount,TransactionCurrency,to_Item/SalesOrderItem,to_Item/Material,to_Item/SalesOrderItemText,to_Item/RequestedQuantity,to_Item/RequestedQuantityUnit&$expand=to_Item&$format=json
 *
 * Why map at all? A voice agent pays for every token and every millisecond. The raw OData
 * payload is ~40 fields of SAP codes; the agent needs ~8 human-readable fields and one sentence
 * it can say out loud ("speakable").
 */
import com.sap.gateway.ip.core.customdev.util.Message
import groovy.json.JsonOutput
import groovy.json.JsonSlurper

import java.time.Instant
import java.time.ZoneOffset

def Message processData(Message message) {
    def root = new JsonSlurper().parseText(message.getBody(String) ?: '{}')
    def so = root?.d ?: root  // OData V2 wraps in "d"

    if (!so?.SalesOrder) {
        message.setProperty('agentErrorCode', 'ORDER_NOT_FOUND')
        throw new IllegalStateException('Backend response contained no SalesOrder')
    }

    def items = (so.to_Item?.results ?: []).collect { it ->
        [
            item       : stripZeros(it.SalesOrderItem),
            material   : it.Material,
            description: it.SalesOrderItemText,
            quantity   : it.RequestedQuantity,
            unit       : it.RequestedQuantityUnit
        ]
    }

    String processingText = statusText(so.OverallSDProcessStatus, 'processing')
    String deliveryText = statusText(so.OverallDeliveryStatus, 'delivery')
    String requested = odataDate(so.RequestedDeliveryDate)

    def out = [
        orderId              : so.SalesOrder,
        processingStatus     : so.OverallSDProcessStatus,
        processingStatusText : processingText,
        deliveryStatus       : so.OverallDeliveryStatus,
        deliveryStatusText   : deliveryText,
        createdOn            : odataDate(so.CreationDate),
        requestedDeliveryDate: requested,
        totalNetAmount       : so.TotalNetAmount,
        currency             : so.TransactionCurrency,
        itemCount            : items.size(),
        items                : items.take(5), // never read 40 lines to a caller
        speakable            : "Order ${so.SalesOrder} is ${processingText} and ${deliveryText}" +
                               (requested ? ". The requested delivery date is ${requested}." : '.'),
        correlationId        : message.getProperty('correlationId')
    ]

    message.setBody(JsonOutput.toJson(out))
    message.setHeader('Content-Type', 'application/json')
    message.getHeaders().remove('apiKey')
    return message
}

// SAP overall status codes: blank/A = not yet processed, B = partially, C = completely.
static String statusText(def code, String kind) {
    switch (code ?: '') {
        case 'A': return kind == 'delivery' ? 'not yet delivered' : 'not yet processed'
        case 'B': return kind == 'delivery' ? 'partially delivered' : 'partially processed'
        case 'C': return kind == 'delivery' ? 'fully delivered' : 'completely processed'
        default : return kind == 'delivery' ? 'not relevant for delivery' : 'in an unknown processing state'
    }
}

// OData V2 Edm.DateTime arrives as "/Date(1700000000000)/" -> "2023-11-14"
static String odataDate(def raw) {
    if (!raw) return null
    def m = (raw =~ /\/Date\((-?\d+)/)
    if (!m.find()) return raw.toString()
    return Instant.ofEpochMilli(m.group(1) as long).atZone(ZoneOffset.UTC).toLocalDate().toString()
}

static String stripZeros(def s) { s ? s.toString().replaceFirst(/^0+(?!$)/, '') : s }
