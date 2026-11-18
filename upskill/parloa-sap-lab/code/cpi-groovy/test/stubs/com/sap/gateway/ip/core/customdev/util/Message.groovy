package com.sap.gateway.ip.core.customdev.util
class Message {
  Map<String,Object> hdrs = [:]; Map<String,Object> props = [:]; Object payload
  Map<String,Object> getHeaders(){ hdrs }; void setHeader(String k, Object v){ hdrs[k]=v }
  Object getProperty(String k){ k in ['hdrs','props','payload','metaClass'] ? this.@"$k" : props[k] }
  void setProperty(String k, Object v){ props[k]=v }
  def getBody(Class c){ payload?.toString() }; void setBody(Object b){ payload=b }
}
