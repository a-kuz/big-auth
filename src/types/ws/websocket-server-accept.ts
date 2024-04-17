import { ServerResponsePayload } from './payload-types'

export interface WebsocketServerAccept {
  type: 'accept'
  timestamp: number
  id: string
  payload?: ServerResponsePayload
}
