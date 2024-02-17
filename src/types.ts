export interface Env {
  readonly TWILIO_ACCOUNT_SID: string
  readonly TWILIO_AUTH_TOKEN: string
  readonly TWILIO_SERVICE_SID: string


  readonly DB: D1Database
  readonly billing: any
  ENV: string
}
