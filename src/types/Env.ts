import { DialogDO, GroupChatsDO } from ".."

export interface Env {
  readonly TWILIO_ACCOUNT_SID: string
  readonly TWILIO_AUTH_TOKEN: string
  readonly TWILIO_SERVICE_SID: string
  readonly JWT_SECRET: string

  readonly DB: D1Database
  readonly billing: any
  readonly USER_FILES: R2Bucket
  readonly ENV: string
  readonly REFRESH_TOKEN_DO: DurableObjectNamespace
  readonly FILES_KV: KVNamespace
  readonly USER_MESSAGING_DO: DurableObjectNamespace
  readonly GROUP_CHATS_DO: DurableObjectNamespace<GroupChatsDO>
  readonly DIALOG_DO: DurableObjectNamespace<DialogDO>

  readonly ORIGIN: string
}
