import { WorkerEntrypoint } from "cloudflare:workers";
import { getUserByToken } from "./services/get-user-by-token";
import { Env } from "./types/Env";
import { chatStorage, dialogStorage, groupStorage, isGroup, userStorage } from "./durable-objects/messaging/utils/mdo";
import { getUserById } from "./db/services/get-user";
import { digest } from "./utils/digest";
import { NotFoundError } from "./errors/NotFoundError";
import { Group, Dialog } from "./types/Chat";
import { VoipPushNotification } from "./types/queue/PushNotification";
import { NewCallRequest, CloseCallRequest } from "./types/ws/client-requests";

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
      returnObf.participants = (await chat.chat(userId)).meta?.participants;
    } else {
      try {
        const user = (await getUserById(this.env.DB, userId, new NotFoundError(`user ${userId} is not exists`))).profile();
        const companion = (await getUserById(this.env.DB, chatId)).profile();
        returnObf.participants = [
          user,
          companion
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
    return user.profile();
  }
  async generateUid({ id, createdAt }: { id: string, createdAt?: number }) {
    const d = await digest(id)
    const twoBytes = parseInt(d.slice(0, 4), 16).toString(10)
    const numericId = parseInt(createdAt?.toString(10) + twoBytes, 10)
    return numericId;
  }
  async voipPush(
    callId: string,
    chatId: string,
    participants: {
      id: string,
      uid: number,
      token: string
    }[],
    appId: string,
    userId: string,
    type: string = 'new'
  ) {

    const title = (await chatStorage(this.env, chatId, chatId).chat(chatId) as Group | Dialog).name;
  
    const VOIP_TOKEN_DO = this.env.VOIP_TOKEN_DO;
    const sendTokens: string[] = [];
    for (let participant of participants) {
      if(participant.id == userId) continue;
      const id = VOIP_TOKEN_DO.idFromName(participant.id);
      const voipTokenDO = await VOIP_TOKEN_DO.get(id, { locationHint: 'weur' })
      const deviceVoipToken = await voipTokenDO.getToken();
      console.log(`
      participant.id : ${participant.id}
      deviceVoipToken: ${deviceVoipToken}
      `);
      
      if (deviceVoipToken && !sendTokens.includes(deviceVoipToken)) {
        sendTokens.push(deviceVoipToken);
        const push: VoipPushNotification = {
          voip: true,
          deviceToken: deviceVoipToken,
          event: {
            appId,
            callId,
            uid: participant.uid,
            token: participant.token,
            chatId,
            title,
            isVideo: false,
            isGroup: isGroup(chatId),
            type
          },
          title
        }
        await this.env.PUSH_QUEUE.send(push, {
          contentType: 'json'
        });
      }
    }
    return;
  }
  async startCall(data: NewCallRequest) {
    if (isGroup(data.chatId)) {
      const group = await groupStorage(this.env, data.chatId);
      await group.newCall(data.callId, data.userId);
    }
  }
  async closeCall(data: CloseCallRequest) {
    if (isGroup(data.chatId)) {
      const group = await groupStorage(this.env, data.chatId);
      await group.closeCall(data.callId, data.userIdCreateCall);
    }
    
  }
}