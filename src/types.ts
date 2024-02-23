export interface Env {
  readonly TWILIO_ACCOUNT_SID: string;
  readonly TWILIO_AUTH_TOKEN: string;
  readonly TWILIO_SERVICE_SID: string;
  readonly JWT_SECRET: string;

  readonly DB: D1Database;
  readonly billing: any;
	readonly USER_FILES: R2Bucket;
  readonly ENV: string;
}
