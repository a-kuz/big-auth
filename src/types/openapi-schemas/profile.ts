import { Str } from "@cloudflare/itty-router-openapi";
import { z } from "zod";

export const ProfileSchema = z.object({
	id: new Str({ example: 'weEEwwecw_wdx2' }),
	phoneNumber: new Str({ example: '+79333333333' }),
	username: new Str({ required: false, example: '@ask_uznetsov' }),
	firstName: new Str({ required: false, example: 'Aleksandr' }),
	lastName: new Str({ required: false, example: 'Ivanov' }),
	avatarUrl: new Str({
		required: false,
		example: 'https://pics.png/png.png',
	}),
	verified: new Str({ required: false, example: 'true' }),
})
