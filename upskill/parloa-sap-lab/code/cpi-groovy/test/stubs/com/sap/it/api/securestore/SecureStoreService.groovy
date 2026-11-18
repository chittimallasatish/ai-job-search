package com.sap.it.api.securestore
class SecureStoreService { def getUserCredential(String a){ a=="S4_SANDBOX_APIKEY" ? new Cred() : null } }
