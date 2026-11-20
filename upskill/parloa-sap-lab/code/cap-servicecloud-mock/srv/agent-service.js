const cds = require('@sap/cds')

const LOG = cds.log('agent-api')
const SLOT_MINUTES = 120
const OPEN_HOUR_UTC = 13 // simplified business hours: 13:00-23:00 UTC = 08:00-18:00 US Eastern (standard time)
const CLOSE_HOUR_UTC = 23

const iso = d => new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z')

// Very small keyword heuristic so the agent doesn't have to guess a priority.
function inferPriority (text = '') {
  const t = text.toLowerCase()
  if (/(gas|smoke|fire|flood|leak|sparks|shock)/.test(t)) return 'URGENT'
  if (/(not working|broken|stopped|error code|won't start|wont start)/.test(t)) return 'HIGH'
  if (/(noise|slow|question|how do i)/.test(t)) return 'LOW'
  return 'MEDIUM'
}

module.exports = class ServiceCloudAgentAPI extends cds.ApplicationService {
  init () {
    const { Customers, Cases, Appointments } = this.entities

    // ---- Case creation: validation, numbering, priority, idempotency -------------------------
    this.before('CREATE', Cases, async req => {
      const { customer_ID, subject } = req.data
      if (!customer_ID) return req.error(400, 'customer_ID is required', 'customer_ID')
      if (!subject) return req.error(400, 'subject is required', 'subject')
      const customer = await SELECT.one.from(Customers).columns('ID').where({ ID: customer_ID })
      if (!customer) return req.error(404, `Customer ${customer_ID} not found`)
      const { max } = await SELECT.one.from(Cases).columns('max(caseNumber) as max')
      req.data.caseNumber = (max ?? 100000) + 1
      if (!req.data.priority) req.data.priority = inferPriority(`${subject} ${req.data.description ?? ''}`)
    })

    this.on('CREATE', Cases, async (req, next) => {
      const { conversationId } = req.data
      if (conversationId) {
        const existing = await SELECT.one.from(Cases).where({ conversationId })
        if (existing) {
          LOG.info(`Idempotent replay for conversation ${conversationId} -> case ${existing.caseNumber}`)
          return existing
        }
      }
      return next()
    })

    // ---- Caller verification ----------------------------------------------------------------
    this.on('verifyCustomer', async req => {
      const { customerId, postalCode } = req.data
      const c = await SELECT.one.from(Customers).where({ ID: customerId })
      // Never reveal *which* factor failed - that leaks information to an impostor.
      if (!c || String(c.postalCode) !== String(postalCode ?? '').trim()) {
        LOG.warn(`Verification failed for customerId=${customerId}`)
        return { verified: false, customerId: null, firstName: null }
      }
      return { verified: true, customerId: c.ID, firstName: c.firstName }
    })

    // ---- Appointment rescheduling with business rules ---------------------------------------
    this.on('rescheduleAppointment', async req => {
      const { appointmentId, newStart } = req.data
      const appt = await SELECT.one.from(Appointments).where({ ID: appointmentId })
      if (!appt) return req.error(404, `Appointment ${appointmentId} not found`)
      if (appt.status === 'CANCELLED' || appt.status === 'DONE') {
        return req.error(409, `Appointment is ${appt.status} and cannot be rescheduled`)
      }

      const start = new Date(newStart)
      if (isNaN(start)) return req.error(400, 'newStart must be an ISO date-time, e.g. 2026-12-03T14:00:00Z')
      if (start <= new Date()) return req.error(400, 'newStart must be in the future')
      const day = start.getUTCDay()
      const hour = start.getUTCHours()
      if (day === 0 || day === 6) return req.error(400, 'Technicians work Monday to Friday only')
      if (hour < OPEN_HOUR_UTC || hour + SLOT_MINUTES / 60 > CLOSE_HOUR_UTC) {
        return req.error(400, 'Slot must lie within business hours (08:00-18:00 Eastern)')
      }

      const end = new Date(start.getTime() + SLOT_MINUTES * 60000)
      const clash = await SELECT.one.from(Appointments).where({
        technician: appt.technician,
        ID: { '!=': appt.ID },
        status: { '!=': 'CANCELLED' },
        startsAt: { '<': iso(end) },
        endsAt: { '>': iso(start) }
      })
      if (clash) {
        return req.error(409, `${appt.technician} is already booked from ${clash.startsAt} to ${clash.endsAt}. Offer a different time.`)
      }

      await UPDATE(Appointments, appt.ID).with({ startsAt: iso(start), endsAt: iso(end), status: 'RESCHEDULED' })
      await this.emit('AppointmentRescheduled', {
        appointmentId: appt.ID,
        customerId: appt.customer_ID,
        oldStart: appt.startsAt,
        newStart: iso(start)
      })
      return SELECT.one.from(Appointments).where({ ID: appt.ID })
    })

    // ---- Human hand-off with summary write-back ---------------------------------------------
    this.on('requestHandoff', async req => {
      const { caseId, summary } = req.data
      if (!summary || summary.trim().length < 20) {
        return req.error(400, 'A hand-off needs a summary of at least 20 characters so the human agent has context')
      }
      const n = await UPDATE(Cases, caseId).with({
        status: 'ESCALATED',
        handoffRequested: true,
        conversationSummary: summary.trim()
      })
      if (!n) return req.error(404, `Case ${caseId} not found`)
      return SELECT.one.from(Cases).where({ ID: caseId })
    })

    this.on('AppointmentRescheduled', msg => LOG.info('Event emitted: AppointmentRescheduled', msg.data))

    return super.init()
  }
}
