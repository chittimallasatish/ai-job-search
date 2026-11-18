/*
 * iFlow AGT_GetOrderStatus - step 2: inject the S/4HANA sandbox API key from the Security Material.
 *
 * Why: the Business Accelerator Hub sandbox authenticates with an "apiKey" HTTP header. Hard-coding
 * it in a Content Modifier would leak it to anyone who can open the iFlow. Store it instead under
 * Monitor > Integrations and APIs > Security Material > Create > Secure Parameter,
 * name = S4_SANDBOX_APIKEY (externalise the alias as {{backendKeyAlias}}).
 *
 * Real S/4HANA: you would NOT do this - you would use the receiver adapter's own authentication
 * (OAuth2 Client Credentials / Principal Propagation / Basic via destination).
 */
import com.sap.gateway.ip.core.customdev.util.Message
import com.sap.it.api.ITApiFactory
import com.sap.it.api.securestore.SecureStoreService

def Message processData(Message message) {
    String alias = message.getProperty('backendKeyAlias') ?: 'S4_SANDBOX_APIKEY'
    def secureStore = ITApiFactory.getService(SecureStoreService.class, null)
    def credential = secureStore.getUserCredential(alias)
    if (credential == null) {
        message.setProperty('agentErrorCode', 'BACKEND_CONFIG')
        throw new IllegalStateException("Secure parameter '${alias}' not deployed")
    }
    message.setHeader('apiKey', new String(credential.getPassword()))
    message.setHeader('Accept', 'application/json')
    // Remove inbound headers that must not travel to the backend.
    ['Authorization', 'APIKey', 'CamelHttpQuery'].each { message.getHeaders().remove(it) }
    return message
}
