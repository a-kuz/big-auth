import 'reflect-metadata'

import { APIType, OpenAPIRouter } from '@cloudflare/itty-router-openapi'

import { SendCodeHandler } from './handlers/SendCodeHandler'
import { VerifyCodeHandler } from './handlers/VerifyCodeHandler'

import { RefreshTokenHandler } from './handlers/RefreshTokenHandler'

import { FindContactsHandler } from './handlers/FindContactsHandler'
import { GetOwnProfileHandler } from './handlers/GetOwnProfileHandler'
import { UpdateProfileHandler } from './handlers/UpdateProfileHandler'

import { RetrieveFileHandler } from './handlers/RetrieveFileHandler'
import { UploadFileHandler } from './handlers/UploadFileHandler'

import { SendMessageHandler } from './handlers/SendMessageHandler'

import { CreateChatHandler } from './handlers/CreateChatHandler'
import { GetChatsHandler } from './handlers/GetChatsHandler'
import { GetMessagesHandler } from './handlers/GetMessagesHandler'
import { GetProfileHandler } from './handlers/GetProfileHandler'
import { NetworkInfoHandler } from './handlers/NetworkInfoHandler'
import { WebsocketHandler } from './handlers/WebsocketHandler'
import { CORS } from './utils/cors'
import { GetChatHandler } from './handlers/GetChatHandler'
import { StoreDeviceTokenHandler } from './handlers/StoreDeviceTokenHandler'
import { GetAvatarHandler } from './handlers/GetAvatarHandler'

export { RefreshTokenDO } from './durable-objects/RefreshTokenDO'
export { PushDO } from './durable-objects/PushDO'
export { DialogsDO, GroupChatsDO, UserMessagingDO, ChatGptDO } from './durable-objects/messaging'

const router = OpenAPIRouter({
  schema: {
    info: {
      title: 'BIG Auth',
      version: '1.0',
    },
  },

  aiPlugin: {
    name_for_human: 'B.I.G Ai',
    name_for_model: 'expert_of_all',
    description_for_human: "Get data insights from Cloudflare's and BIG messenger point of view.",
    description_for_model:
      "Plugin for retrieving the data based on Cloudflare Radar's data. Use it whenever a user asks something that might be related to Internet usage, eg. outages, Internet traffic, or Cloudflare Radar's data in particular.",
    contact_email: 'support@iambig.ai',
    legal_info_url: 'https://www.cloudflare.com/website-terms/',
    logo_url:
      'https://dev.iambig.ai/public/1feb2e3c2d04dec268da0606dd163e76f6869233129be1633ab9937903640818',

    api: {
      has_user_authentication: false,
      type: APIType.OPENAPI,
      url: '/openai.json',
    },
  },
})

router.registry.registerComponent('securitySchemes', 'BearerAuth', {
  type: 'http',
  scheme: 'bearer',
})

router.post('/send-code', SendCodeHandler)
router.post('/verify-code', VerifyCodeHandler)
router.post('/auth/refresh', RefreshTokenHandler)

router.get('/profile/:id', GetProfileHandler)

router.get('/profile', GetOwnProfileHandler)
router.post('/profile', UpdateProfileHandler)

router.get('/public/:id/', RetrieveFileHandler)
router.post('/public/upload', UploadFileHandler)

router.post('/contacts/whoIsThere', FindContactsHandler)

router.post('/messages', SendMessageHandler)
router.get('/messages', GetMessagesHandler)

router.get('/chat', GetChatHandler)
router.get('/chats', GetChatsHandler)
router.post('/chats', CreateChatHandler)

router.post('/deviceToken', StoreDeviceTokenHandler)

router.get('/network', NetworkInfoHandler)

router.get('/websocket', WebsocketHandler)
router.options('*', CORS) // TODO: add security CORS
router.get('/avatar/:userId', GetAvatarHandler)
// Redirect root request to the /docs page
router.original.get('/', (request: Request) => Response.redirect(`${request.url}docs`, 302))

// 404 for everything else
router.all('*', () => new Response('Not Found.', { status: 404 }))

export default {
  fetch: router.handle,
}
