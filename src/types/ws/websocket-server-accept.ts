import { ServerResponsePayload } from './payload-types'

export interface WebsocketServerResponse {
  type: 'response'
  timestamp: number
  id: string
  payload?: ServerResponsePayload
}
