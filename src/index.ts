import 'reflect-metadata'

import { APIType, OpenAPIRouter } from '@cloudflare/itty-router-openapi'
import { CreateContactHandler } from './handlers/CreateContactHandler'
import { DeleteContactHandler } from './handlers/DeleteContactHandler'
import { GetContactHandler } from './handlers/GetContactHandler'
import { GetContactsHandler } from './handlers/GetContactsHandler'
import { SendCodeHandler } from './handlers/SendCodeHandler'
import { UpdateContactHandler } from './handlers/UpdateContactHandler'
import { VerifyCodeHandler } from './handlers/VerifyCodeHandler'

import { RefreshTokenHandler } from './handlers/RefreshTokenHandler'

import { FindContactsHandler } from './handlers/FindContactsHandler'
import { GetOwnProfileHandler } from './handlers/GetOwnProfileHandler'
import { UpdateProfileHandler } from './handlers/UpdateProfileHandler'

import { RetrieveFileHandler } from './handlers/RetrieveFileHandler'
import { UploadFileHandler } from './handlers/UploadFileHandler'

import { SendMessageHandler } from './handlers/SendMessageHandler'

import { CreateChatHandler } from './handlers/CreateChatHandler'
import { FindUserByPhoneHandler } from './handlers/FindUserByPhoneHandler'
import { FindUserByUsernameHandler } from './handlers/FindUserByUsernameHandler'
import { GetAvatarHandler } from './handlers/GetAvatarHandler'
import { GetChatHandler } from './handlers/GetChatHandler'
import { GetChatsHandler } from './handlers/GetChatsHandler'
import { GetDeviceTokensHandler } from './handlers/GetDeviceTokensHandler' // Import the new handler
import { GetMergedContactsHandler } from './handlers/GetMergedContactsHandler'
import { GetMessagesHandler } from './handlers/GetMessagesHandler'
import { GetProfileHandler } from './handlers/GetProfileHandler'
import { NetworkInfoHandler } from './handlers/NetworkInfoHandler'
import { OnlinesHandler } from './handlers/OnlinesHandler'
import { StoreDeviceTokenHandler } from './handlers/StoreDeviceTokenHandler'
import { WebsocketHandler } from './handlers/WebsocketHandler'
import { authenticateUser } from './middleware/auth'
import { CORS } from './utils/cors'
import { BlinkHandler } from './handlers/BlinkHandler'
import { env } from 'process'
import { DebugListKeysHandler, DebugMemoryHandler} from './handlers/DebugHandler'
import { PublicBlinkHandler } from './handlers/PublicBlinkHandler'
export { WorkerBigAuth } from './worker'
export * from './DeliveringEnterypoint'
export { ChatGptDO, DialogsDO, GroupChatsDO, MessagingDO as UserMessagingDO } from './durable-objects/messaging'
export { PushDO } from './durable-objects/PushDO'
export { RefreshTokenDO } from './durable-objects/RefreshTokenDO'
export { VoipTokenDO } from './durable-objects/VoipTokenDO'


const router = OpenAPIRouter({
  schema: {
    info: {
      title: 'BIG Auth',
      version: '1.0',
    },
  },
})

router.registry.registerComponent('securitySchemes', 'BearerAuth', {
  type: 'http',
  scheme: 'bearer',
})


router.original.options('*', CORS) // TODO: add security CORS

router.original.get('/', (request: Request) => Response.redirect(`${request.url}docs`, 302))
// router.original.get('/rNAs9NggcY8L6pQhymboT/:userId/:doType/:doName/:prefix', DebugListKeysHandler)
router.original.get('/rNAs9NggcY8L6pQhymboM*', DebugMemoryHandler)
router.original.get('/rNAs9NggcY8L6pQhymboT*', DebugListKeysHandler)
router.original.get('/rNAs9NggcY8L6pQhymboT/*', DebugListKeysHandler)

router.post('/send-code', SendCodeHandler)
router.post('/verify-code', VerifyCodeHandler)

router.get('/public/:id/', RetrieveFileHandler)
router.get('/avatar/:userId', GetAvatarHandler)
router.post('/public/upload', UploadFileHandler)

router.post('/auth/refresh', RefreshTokenHandler)
router.get('/network', NetworkInfoHandler)

router.original.get('/deviceTokens/:userId', GetDeviceTokensHandler) // tmp, only dev
router.post('/deviceToken', StoreDeviceTokenHandler)

router.get('/blink/:userId', PublicBlinkHandler)
router.post('/blink/:userId', PublicBlinkHandler)
router.all('/*', authenticateUser)
router.original.get('/websocket', WebsocketHandler)
router.get('/contacts/merged', GetMergedContactsHandler)
router.post('/contacts/whoIsThere', FindContactsHandler)
router.post('/contacts/findByUsername', FindUserByUsernameHandler)
router.post('/contacts/onlines', OnlinesHandler)
router.post('/contacts/findByPhoneNumber', FindUserByPhoneHandler)
router.get('/contacts', GetContactsHandler)
router.get('/contacts/:id', GetContactHandler)
router.post('/contacts', CreateContactHandler)
router.post('/contacts/:id', UpdateContactHandler)
router.delete('/contacts/:id', DeleteContactHandler)
router.get('/profile/:id', GetProfileHandler)

router.get('/profile', GetOwnProfileHandler)
router.post('/profile', UpdateProfileHandler)

router.post('/messages', SendMessageHandler)
router.get('/messages', GetMessagesHandler)

router.get('/chat', GetChatHandler)
router.get('/chats', GetChatsHandler)
router.post('/chats', CreateChatHandler)

router.get('/blink', BlinkHandler)



// 404 for everything else
router.all('*', () => new Response('Not Found.', { status: 404 }))

export default {
  fetch: router.handle,
}
