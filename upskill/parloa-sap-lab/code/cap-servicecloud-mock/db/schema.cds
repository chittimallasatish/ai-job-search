namespace lumen;

using { cuid, managed } from '@sap/cds/common';

// Stand-in for the SAP Service Cloud objects the Parloa agent touches.
// In a real landscape these live in Service Cloud V2 / C4C; here CAP plays that role
// so you can practise OData V4, CAP extension development and write-back patterns.

entity Customers {
  key ID         : String(10);
      firstName  : String(40);
      lastName   : String(40);
      phone      : String(20);
      email      : String(100);
      postalCode : String(10);
      cases        : Association to many Cases        on cases.customer = $self;
      appointments : Association to many Appointments on appointments.customer = $self;
}

type Priority   : String(10) enum { LOW; MEDIUM; HIGH; URGENT; }
type CaseStatus : String(12) enum { OPEN; IN_PROCESS; ESCALATED; CLOSED; }

entity Cases : cuid, managed {
  caseNumber          : Integer;
  customer            : Association to Customers;
  subject             : String(120);
  description         : String(1000);
  priority            : Priority default 'MEDIUM';
  status              : CaseStatus default 'OPEN';
  channel             : String(20) default 'VOICE';
  product             : String(40);
  salesOrder          : String(10);
  // Idempotency key: the agent's conversation ID. A retried tool call must not create a second case.
  conversationId      : String(64);
  conversationSummary : LargeString;
  handoffRequested    : Boolean default false;
}

entity Appointments : cuid {
  customer    : Association to Customers;
  serviceCase : Association to Cases;
  technician  : String(60);
  startsAt    : DateTime;
  endsAt      : DateTime;
  status      : String(12) enum { SCHEDULED; RESCHEDULED; CANCELLED; DONE; } default 'SCHEDULED';
}
