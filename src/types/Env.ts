import { TaskManager } from 'do-taskmanager/dist/types'
import { User } from '~/db/models/User'
import { PushDO } from '~/durable-objects/PushDO'
import { ChatGptDO, DialogsDO, GroupChatsDO, UserMessagingDO } from '..'
import { PushNotification } from './queue/PushNotification'

export interface Env {
  readonly TWILIO_ACCOUNT_SID: string
  readonly TWILIO_AUTH_TOKEN: string
  readonly TWILIO_SERVICE_SID: string
  readonly JWT_SECRET: string
  readonly OPEN_AI_API_KEY: string

  readonly DB: D1Database
  readonly billing: any
  readonly USER_FILES: R2Bucket
  readonly ENV: string
  readonly REFRESH_TOKEN_DO: DurableObjectNamespace
  readonly FILES_KV: KVNamespace
  readonly USER_MESSAGING_DO: DurableObjectNamespace<UserMessagingDO>
  readonly GROUP_CHATS_DO: DurableObjectNamespace<GroupChatsDO>
  readonly DIALOG_DO: DurableObjectNamespace<DialogsDO>
  readonly GPT_DO: DurableObjectNamespace<ChatGptDO>
  readonly PUSH_TOKEN_DO: DurableObjectNamespace<PushDO>

  readonly PUSH_QUEUE: Queue<PushNotification>

  readonly AI_AVATAR_URL: string
  readonly ORIGIN: string
  readonly TASK_MANAGER: TaskManager
  user: User
}
