# SAP API Management: proxy `lumen-agent-v1` policies (Phase 3)

API Management sits between the AI agent and everything SAP. It is the **governance point**: who may
call, how often, with which credentials, and with what latency.

```
MCP server / agent ──APIKey──▶ APIM proxy  /lumen/v1/orders/status ──OAuth──▶ CPI iFlow ──▶ S/4HANA
                                           /lumen/v1/servicecloud/* ──xsuaa──▶ CAP service
```

Create the proxy: **Configure → APIs → Create**, target = your CPI runtime URL
(`https://<tenant>.it-cpitrial…/http/agent/orderstatus`). Create a **Product** `Lumen Agent Tools`,
publish it, subscribe an **Application** in the Developer Hub. The application's key is the
`API_KEY` the MCP server sends.

Attach policies in the **Policy Editor** (Edit → Policies). Names below are suggestions. The editor
validates the XML when you save, so fix whatever it flags. Policy element names follow the
Apigee-compatible schema that SAP API Management uses.

## Flow placement

| Flow | Step | Policy |
|------|------|--------|
| ProxyEndpoint PreFlow (Request) | 1 | `verifyKey` |
| | 2 | `spikeArrest` |
| | 3 | `quotaPerApp` |
| | 4 | `setCorrelationId` |
| | 5 | `orderCacheLookup` (ResponseCache, only on the orders resource) |
| TargetEndpoint PreFlow (Request) | 6 | v1: `basicToCpi`, or v2: the token chain below |
| ProxyEndpoint PostFlow (Response) | 7 | `orderCacheLookup` (same ResponseCache policy, populates the cache) |
| | 8 | `stripBackendHeaders` |

## 1. Verify API key

```xml
<VerifyAPIKey async="true" continueOnError="false" enabled="true" xmlns="http://www.sap.com/apimgmt">
  <APIKey ref="request.header.APIKey"/>
</VerifyAPIKey>
```

## 2. Spike arrest (protects S/4 from a runaway agent loop)

```xml
<SpikeArrest async="true" continueOnError="false" enabled="true" xmlns="http://www.sap.com/apimgmt">
  <Identifier ref="request.header.APIKey"/>
  <Rate>20ps</Rate>
</SpikeArrest>
```

## 3. Quota per consuming application

```xml
<Quota async="false" continueOnError="false" enabled="true" type="calendar" xmlns="http://www.sap.com/apimgmt">
  <Identifier ref="request.header.APIKey"/>
  <Allow count="2000"/>
  <Interval>1</Interval>
  <TimeUnit>hour</TimeUnit>
  <StartTime>2026-01-01 00:00:00</StartTime>
  <Distributed>true</Distributed>
  <Synchronous>true</Synchronous>
</Quota>
```

## 4. Correlation ID (end-to-end tracing agent → APIM → CPI MPL)

```xml
<AssignMessage async="false" continueOnError="false" enabled="true" xmlns="http://www.sap.com/apimgmt">
  <Set>
    <Headers>
      <Header name="X-Correlation-ID">{messageid}</Header>
    </Headers>
  </Set>
  <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>
  <AssignTo createNew="false" type="request">request</AssignTo>
</AssignMessage>
```

Remember to add `X-Correlation-ID` to the iFlow's **Allowed Header(s)**, or CPI drops it.

## 5. Response cache for order status (voice latency)

Order status changes slowly, but callers repeat themselves ("so it's coming Tuesday?"). A 60-second
cache keyed by order ID removes the second backend round-trip.

```xml
<ResponseCache async="false" continueOnError="false" enabled="true" xmlns="http://www.sap.com/apimgmt">
  <CacheKey>
    <KeyFragment ref="request.queryparam.orderId"/>
  </CacheKey>
  <Scope>Exclusive</Scope>
  <ExpirySettings>
    <TimeoutInSec>60</TimeoutInSec>
  </ExpirySettings>
  <SkipCacheLookup>request.verb != "GET"</SkipCacheLookup>
  <SkipCachePopulation>response.status.code != 200</SkipCachePopulation>
</ResponseCache>
```

Interview point: **never cache errors** (`SkipCachePopulation`), and never cache write calls.

## 6a. v1: Basic auth to CPI (get it working first)

CPI accepts the `clientid`/`clientsecret` of an `integration-flow` service key as Basic credentials.
Store them in an **encrypted Key Value Map** `cpi-credentials` (keys `clientId`, `clientSecret`).

```xml
<KeyValueMapOperations mapIdentifier="cpi-credentials" async="true" continueOnError="false" enabled="true" xmlns="http://www.sap.com/apimgmt">
  <Get assignTo="private.cpi.clientId" index="1"><Key><Parameter>clientId</Parameter></Key></Get>
  <Get assignTo="private.cpi.clientSecret" index="1"><Key><Parameter>clientSecret</Parameter></Key></Get>
  <Scope>environment</Scope>
</KeyValueMapOperations>
```
```xml
<BasicAuthentication async="false" continueOnError="false" enabled="true" xmlns="http://www.sap.com/apimgmt">
  <Operation>Encode</Operation>
  <IgnoreUnresolvedVariables>false</IgnoreUnresolvedVariables>
  <User ref="private.cpi.clientId"/>
  <Password ref="private.cpi.clientSecret"/>
  <AssignTo createNew="false">request.header.Authorization</AssignTo>
</BasicAuthentication>
```

## 6b. v2: OAuth client-credentials token with caching (the upgrade story)

Chain in TargetEndpoint PreFlow:

1. `getCpiCreds` (KVM above)
2. `lookupToken`
3. condition `cpi.token = null`: `buildTokenRequest`, `encodeTokenAuth`, `callTokenEndpoint`, `extractToken`, `populateToken`
4. `setBearer`

```xml
<LookupCache async="false" continueOnError="false" enabled="true" xmlns="http://www.sap.com/apimgmt">
  <CacheResource>cpi-oauth</CacheResource>
  <CacheKey><KeyFragment>cpi-token</KeyFragment></CacheKey>
  <Scope>Exclusive</Scope>
  <AssignTo>cpi.token</AssignTo>
</LookupCache>
```
```xml
<AssignMessage async="false" continueOnError="false" enabled="true" xmlns="http://www.sap.com/apimgmt">
  <AssignTo createNew="true" type="request">tokenRequest</AssignTo>
  <Set>
    <Verb>POST</Verb>
    <Headers><Header name="Content-Type">application/x-www-form-urlencoded</Header></Headers>
    <FormParams><FormParam name="grant_type">client_credentials</FormParam></FormParams>
  </Set>
  <IgnoreUnresolvedVariables>false</IgnoreUnresolvedVariables>
</AssignMessage>
```
```xml
<BasicAuthentication async="false" continueOnError="false" enabled="true" xmlns="http://www.sap.com/apimgmt">
  <Operation>Encode</Operation>
  <IgnoreUnresolvedVariables>false</IgnoreUnresolvedVariables>
  <User ref="private.cpi.clientId"/>
  <Password ref="private.cpi.clientSecret"/>
  <AssignTo createNew="false">tokenRequest.header.Authorization</AssignTo>
</BasicAuthentication>
```
```xml
<ServiceCallout async="false" continueOnError="false" enabled="true" xmlns="http://www.sap.com/apimgmt">
  <Request clearPayload="false" variable="tokenRequest"/>
  <Response>tokenResponse</Response>
  <Timeout>3000</Timeout>
  <HTTPTargetConnection>
    <!-- tokenurl from the integration-flow service key, plus /oauth/token -->
    <URL>https://YOUR-SUBDOMAIN.authentication.us10.hana.ondemand.com/oauth/token</URL>
  </HTTPTargetConnection>
</ServiceCallout>
```
```xml
<ExtractVariables async="true" continueOnError="false" enabled="true" xmlns="http://www.sap.com/apimgmt">
  <Source>tokenResponse</Source>
  <JSONPayload>
    <Variable name="cpi.token" type="string"><JSONPath>$.access_token</JSONPath></Variable>
    <Variable name="cpi.expires" type="string"><JSONPath>$.expires_in</JSONPath></Variable>
  </JSONPayload>
</ExtractVariables>
```
```xml
<PopulateCache async="false" continueOnError="false" enabled="true" xmlns="http://www.sap.com/apimgmt">
  <CacheResource>cpi-oauth</CacheResource>
  <CacheKey><KeyFragment>cpi-token</KeyFragment></CacheKey>
  <Scope>Exclusive</Scope>
  <ExpirySettings><TimeoutInSec>3000</TimeoutInSec></ExpirySettings>
  <Source>cpi.token</Source>
</PopulateCache>
```
```xml
<AssignMessage async="false" continueOnError="false" enabled="true" xmlns="http://www.sap.com/apimgmt">
  <Set><Headers><Header name="Authorization">Bearer {cpi.token}</Header></Headers></Set>
  <IgnoreUnresolvedVariables>false</IgnoreUnresolvedVariables>
  <AssignTo createNew="false" type="request">request</AssignTo>
</AssignMessage>
```

Measure before and after (`curl -w '%{time_total}\n'`, 20 calls each). The token cache removes one
XSUAA round-trip per call. Write the numbers in your issue log; they become an interview story.

## 8. Strip backend headers

```xml
<AssignMessage async="false" continueOnError="false" enabled="true" xmlns="http://www.sap.com/apimgmt">
  <Remove>
    <Headers>
      <Header name="sap-server"/>
      <Header name="x-vcap-request-id"/>
      <Header name="Set-Cookie"/>
    </Headers>
  </Remove>
  <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>
  <AssignTo createNew="false" type="response">response</AssignTo>
</AssignMessage>
```
