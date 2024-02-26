import { generateAccessToken, generateRefreshToken } from "../services/jwt";
import { Env } from "../types";

interface SetRequest {
  userId: string;
  refreshToken: string;
  ip?: string;
  fingerprint?: string;
}

interface Row {
  refreshToken: string;
  ip?: string;
  fingerprint?: string;
  createdAt: Date;
}
export class RefreshTokenDO implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    env: Env,
  ) {}

  async fetch(request: Request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const userId = url.searchParams.get("userId")!;

    if (request.method === "POST") {
      if (path === "/") {
        const req = await request.json<SetRequest>();
        const row: Row = {
          refreshToken: req.refreshToken,
          ip: req.ip,
          fingerprint: req.fingerprint,
          createdAt: new Date(),
        };
        await this.set(req.userId, req.refreshToken);
        return new Response();
      } else if (path === "/refresh") {
        const refreshToken = url.searchParams.get("refre");
        await this.refresh();
        return new Response();
      }
    } else {
      const refreshToken = await this.get(userId);
      return new Response();
    }
  }

  async refresh(
    refreshToken: string,
    userId: string,
    env: Env,
  ): Promise<Response> {
    const storedToken = await this.get<>(userId);
    if (storedToken && storedToken.refreshToken === refreshToken) {
      if (Date.now() - storedToken.iss < 30 * 24 * 60 * 60 * 1000) {
        // Valid for 30 days
        const user = new User(userId, storedToken.phoneNumber); // Construct user (ensure you have phoneNumber or remove it depending on your model)

        const newRefreshToken = await generateRefreshToken();
        await this.set(userId, newRefreshToken);

        const newAccessToken = await generateAccessToken(user, env.JWT_SECRET);

        return new Response(
          JSON.stringify({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
          }),
        );
      } else {
        return new Response("Refresh token expired", { status: 403 });
      }
    } else {
      return new Response("Invalid refresh token", { status: 401 });
    }
  }

  // Store the refresh token
  async set(userId: string, refreshToken: String) {
    await this.state.storage.put(`refreshToken`, {
      refreshToken,
      iss: Date.now(),
    });
  }

  // Retrieve the refresh token
  async get(userId: string) {
    return await this.state.storage.get(`refreshToken_${userId}`);
  }

  async refresh(
    refreshToken: string,
    userId: string,
    env: Env,
  ): Promise<Response> {
    const storedToken = await this.get(userId);
    if (storedToken && storedToken.refreshToken === refreshToken) {
      if (Date.now() - storedToken.iss < 30 * 24 * 60 * 60 * 1000) {
        // Valid for 30 days
        const user = new User(userId, storedToken.phoneNumber); // Construct user (ensure you have phoneNumber or remove it depending on your model)

        const newRefreshToken = await generateRefreshToken(
          userId,
          env.JWT_SECRET,
        );
        await this.set(userId, newRefreshToken);

        const newAccessToken = await generateAccessToken(user, env.JWT_SECRET);

        return new Response(
          JSON.stringify({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
          }),
        );
      } else {
        return new Response("Refresh token expired", { status: 403 });
      }
    } else {
      return new Response("Invalid refresh token", { status: 401 });
    }
  }
}
