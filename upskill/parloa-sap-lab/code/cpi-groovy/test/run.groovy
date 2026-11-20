import com.sap.gateway.ip.core.customdev.util.Message
class Log { def att=[:]; def props=[:]; void addAttachmentAsString(String n,String b,String t){att[n]=b}; void setStringProperty(String k,String v){props[k]=v} }
def mk(Map p, Map h = [:]) { def m = new Message(); p.each { k, v -> m.setProperty(k, v) }; h.each { k, v -> m.setHeader(k, v) }; m }
def log = new Log()
def factory = [getMessageLog: { m -> log }]
def dir = args[0]
def run = { String file, Message m ->
  def b = new Binding(); b.setVariable('messageLogFactory', factory)
  def s = new GroovyShell(this.class.classLoader, b).parse(new File(dir, file)); s.processData(m) }

// 01 valid / invalid
def m = new Message(hdrs:[CamelHttpQuery:'orderId=4711&x=1', SAP_MessageProcessingLogID:'MPL1'])
run('01_validate_order_request.groovy', m); println "01 ok: ${m.props}"
def bad = new Message(hdrs:[CamelHttpQuery:'orderId=12ab'])
try { run('01_validate_order_request.groovy', bad); println '01 FAIL no throw' } catch(IllegalArgumentException e){ println "01 invalid -> ${bad.props.agentErrorCode}: ${e.message}" }
// 02
run('02_set_backend_apikey.groovy', m); println "02 apiKey=${m.hdrs.apiKey} query removed=${!m.hdrs.containsKey('CamelHttpQuery')}"
// 03
m.setBody('''{"d":{"SalesOrder":"4711","CreationDate":"/Date(1762905600000)/","RequestedDeliveryDate":"/Date(1764115200000)/","OverallSDProcessStatus":"B","OverallDeliveryStatus":"A","TotalNetAmount":"2140.00","TransactionCurrency":"USD","to_Item":{"results":[{"SalesOrderItem":"000010","Material":"FR-900","SalesOrderItemText":"Fridge","RequestedQuantity":"1","RequestedQuantityUnit":"PC"}]}}}''')
run('03_map_salesorder_to_agent.groovy', m); println "03 -> ${m.getBody(String)}"
// 04
m.setProperty("logPayload","true"); m.setBody('{"email":"a.b@example.com","phone":"+1 212 555 0101","postalCode":"10001"}')
run('04_log_payload_masked.groovy', m); println "04 -> ${log.att}"
// 05 with agent code, and with HTTP exception
def e1 = mk([agentErrorCode:'INVALID_ORDER_ID', CamelExceptionCaught: new IllegalArgumentException('x')])
run('05_build_agent_error.groovy', e1); println "05a ${e1.hdrs.CamelHttpResponseCode} ${e1.getBody(String)}"
class HttpEx extends RuntimeException { int getStatusCode(){404}; String getResponseBody(){'{"error":"nf"}'}; HttpEx(){super('404')} }
def e2 = mk([orderId:'77', CamelExceptionCaught: new HttpEx()], [SAP_MessageProcessingLogID:'MPL2'])
run('05_build_agent_error.groovy', e2); println "05b ${e2.hdrs.CamelHttpResponseCode} ${e2.getBody(String)}"
def e3 = mk([CamelExceptionCaught: new RuntimeException('boom')])
run('05_build_agent_error.groovy', e3); println "05c ${e3.hdrs.CamelHttpResponseCode} ${e3.getBody(String)}"
