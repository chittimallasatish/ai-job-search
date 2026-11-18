package com.sap.it.api
class ITApiFactory { static def getService(Class c, Object o){ c.newInstance() } }
