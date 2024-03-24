import { UserMessagingDO } from "../durable-objects/messaging/UserMessagingDO";
import { Env } from "../types/Env";

// UserMessagingService encapsulates the logic for interacting with the UserMessagingDO Durable Object
export class UserMessagingService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  // Method to retrieve an instance of UserMessagingDO
  private getUserMessagingDO(userId: string): DurableObjectStub {
    const id = this.env.USER_MESSAGING_DO.idFromName(userId);
    return this.env.USER_MESSAGING_DO.get(id);
  }

  // Method to send a message using UserMessagingDO
  async sendMessage(userId: string, message: string): Promise<Response> {
    const userMessagingDO = await this.getUserMessagingDO(userId);
    return userMessagingDO.fetch("https://user-messaging/send", {
      method: "POST",
      body: JSON.stringify({ message }),
    });
  }

  // Method to retrieve messages using UserMessagingDO, now using POST instead of GET
  async retrieveMessages(userId: string, chatId: string): Promise<Response> {
    const userMessagingDO = await this.getUserMessagingDO(userId);
    return userMessagingDO.fetch("https://user-messaging/retrieve", {
      method: "POST",
      body: JSON.stringify({ chatId }),
    });
  }
}
