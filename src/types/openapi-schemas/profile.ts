import { Num, Str } from '@cloudflare/itty-router-openapi'
import { z } from 'zod'
import { REGEX_URL_FILTER } from '~/constants'

const ZodProfile = {
  id: new Str({ example: 'weEEwwecw_wdx2' }),
  phoneNumber: new Str({ example: '+79333333333' }),
  username: new Str({ required: false, example: '@ask_uznetsov' }),
  firstName: new Str({ required: false, example: 'Aleksandr' }),
  lastName: new Str({ required: false, example: 'Ivanov' }),
  avatarUrl: z.string().regex(REGEX_URL_FILTER, { message: 'url must be at iambig.ai' }).optional().openapi({example: "https://dev.iambig.ai/public/1feb2e3c2d04dec268da0606dd163e76f6869233129be1633ab9937903640818"}),
  verified: new Str({ required: false, example: 'true' }).optional(),
}

export const ProfileSchema = z.object(ZodProfile)

export const ProfileWithLastSeenSchema = z.object({
  ...ZodProfile,
  lastSeen: new Num({ example: 1719781200000 }).optional(),
})
