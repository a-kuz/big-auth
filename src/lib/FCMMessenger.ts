export class FCMMessenger {
  private static fcmSendEndpoint = 'https://fcm.googleapis.com/fcm/send';

  static async sendMessage(to: string, title: string, body: string): Promise<Response> {
    const message = {
      to,
      notification: {
        title,
        body,
      },
    };

    const response = await fetch(this.fcmSendEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    return new Response(JSON.stringify(await response.json()), { status: response.status });
  }
}
