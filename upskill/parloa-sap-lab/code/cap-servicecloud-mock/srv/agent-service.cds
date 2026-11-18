using lumen from '../db/schema';

// The "agent-facing" API: small, task-shaped, least-privilege.
// Everything here is what an AI agent may do mid-conversation, nothing more.
@path    : '/servicecloud'
@requires: 'AgentTool'
service ServiceCloudAgentAPI {

  // PII minimisation: the agent never needs the e-mail address to resolve a call.
  @readonly
  entity Customers    as projection on lumen.Customers excluding { email };

  @restrict: [{ grant: ['READ', 'CREATE', 'UPDATE'], to: 'AgentTool' }]
  entity Cases        as projection on lumen.Cases;

  @readonly
  entity Appointments as projection on lumen.Appointments;

  type VerifyResult {
    verified   : Boolean;
    customerId : String(10);
    firstName  : String(40);
  }

  // Caller authentication step (the certified Parloa flow authenticates the caller first).
  action verifyCustomer(customerId : String(10), postalCode : String(10)) returns VerifyResult;

  action rescheduleAppointment(appointmentId : UUID, newStart : DateTime) returns Appointments;

  // Hand-off to a human with an AI-generated summary written back to the case.
  action requestHandoff(caseId : UUID, summary : String(4000)) returns Cases;

  // Business event for proactive / event-driven scenarios (Event Mesh / Advanced Event Mesh lab).
  event AppointmentRescheduled {
    appointmentId : UUID;
    customerId    : String(10);
    oldStart      : DateTime;
    newStart      : DateTime;
  }
}
