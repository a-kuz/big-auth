import { WorkerEntrypoint } from "cloudflare:workers";
import { getUserByToken } from "./services/get-user-by-token";
import { Env } from "./types/Env";
import { chatStorage, dialogStorage, isGroup } from "./durable-objects/messaging/utils/mdo";
import { getUserById } from "./db/services/get-user";
import { digest } from "./utils/digest";
import { NotFoundError } from "./errors/NotFoundError";

export class WorkerBigAuth extends WorkerEntrypoint {
  constructor(
    readonly ctx: ExecutionContext,
    readonly env: Env
  ) {
    super(ctx, env);
  };
  async getUserByToken(token: string) {
    const user = (await getUserByToken(this.env.DB, token, this.env.JWT_SECRET));
    return {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl
    };
  }
  async fetch(request: Request<unknown, CfProperties<unknown>>) {
    return new Response();
  }
  async getUsersOnChat(chatId: string, userId: string) {
    const returnObf:{
      id:string,
      participants:{
        id: string,
        username?: string
        firstName?: string
        lastName?: string
        avatarUrl?: string
      }[]
    } = {
      id:'',
      participants:[]
    }
    if (isGroup(chatId)) {
      const chat = chatStorage(this.env, chatId, userId);
      //@ts-ignore
      returnObf.participants = await Promise.all((await chat.chat(userId)).meta?.participants.map(async participant => {
        participant = await getUserById(this.env.DB, participant.id);
        return {
          id: participant.id,
          username: participant.username,
          firstName: participant.firstName,
          lastName: participant.lastName,
          avatarUrl: participant.avatarUrl
        }
      }));
    } else {
      try {
        const user = (await getUserById(this.env.DB, userId, new NotFoundError(`user ${userId} is not exists`)));
        const companion = (await getUserById(this.env.DB, chatId));
        returnObf.participants = [
          {
            id: user.id,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            avatarUrl: user.avatarUrl
          },
          {
            id: companion.id,
            username: companion.username,
            firstName: companion.firstName,
            lastName: companion.lastName,
            avatarUrl: companion.avatarUrl
          },
        ]
        const [user1Id, user2Id] = [userId, chatId].sort((a, b) => (a > b ? 1 : -1))
        returnObf.id = `${user1Id}:${user2Id}`
      } catch (e) {
        console.log(e);
      }
    }
    return returnObf;
  }
  async getChatIdOnChat(chatId: string, userId: string) {
    let id = chatId;
    if (!isGroup(chatId)) {
      try {
        const [user1Id, user2Id] = [userId, chatId].sort((a, b) => (a > b ? 1 : -1))
        id = `${user1Id}:${user2Id}`
      } catch (e) {
        console.log(e);
      }
    }
    return id;
  }
  async getUserOnId(userId: string) {
    const user = (await getUserById(this.env.DB, userId));
    return {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl
    };
  }
  async generateUid({ id, createdAt }: { id: string, createdAt?: number }) {
    const d = await digest(id)
    const twoBytes = parseInt(d.slice(0, 4), 16).toString(10)
    const numericId = parseInt(createdAt?.toString(10) + twoBytes, 10)
    return numericId;
  }
}