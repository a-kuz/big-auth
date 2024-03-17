import { User } from "../db/models/User";
import { generateAccessToken, generateRefreshToken } from "../services/jwt";
import { Env } from "../types/Env";
import { errorResponse } from "../utils/error-response";

interface SetRequest {
  userId: string;
  refreshToken: string;
  ip?: string;
  fingerprint?: string;
  phoneNumber?: string;
}

interface Row {
  refreshToken: string;
  ip?: string;
  fingerprint?: string;
  phoneNumber?: string;
  createdAt: number;
}
export class RefreshTokenDO implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}
  async fetch(request: Request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const userId = url.searchParams.get("userId")!;

    if (request.method === "POST") {
      if (path === "/" || path === "/verify-code") {
        const req = await request.json<SetRequest>();
        const row: Row = {
          refreshToken: req.refreshToken,
          ip: req.ip,
          fingerprint: req.fingerprint,
          createdAt: Date.now(),
        };
        await this.set(req.refreshToken, req.phoneNumber!);
        return new Response();
      } else if (path === "/refresh") {
        const refreshToken = url.searchParams.get("refreshToken")!;
        const phoneNumber = url.searchParams.get("phoneNumber")!;

        return await this.refresh(refreshToken, userId, phoneNumber);
      } else return errorResponse("not found", 404);
    } else {
      const refreshToken = await this.get();
      return new Response(JSON.stringify({ refreshToken }));
    }
  }

  async refresh(
    refreshToken: string,
    userId: string,
    phoneNumber: string,
  ): Promise<Response> {
    const storedToken = await this.get();
    if (storedToken && storedToken.refreshToken === refreshToken) {
      if (Date.now() - storedToken.createdAt < 30 * 24 * 60 * 60 * 1000) {
        // Valid for 30 days
        const user = new User(userId, phoneNumber); // Construct user (ensure you have phoneNumber or remove it depending on your model)

        const newRefreshToken = await generateRefreshToken(userId);
        await this.set(newRefreshToken, phoneNumber);

        const newAccessToken = await generateAccessToken(
          user,
          this.env.JWT_SECRET,
        );

        return new Response(
          JSON.stringify({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
          }),
        );
      } else {
        return new Response("Refresh token expired", { status: 401 });
      }
    } else {
      return new Response(
        `Invalid refresh token ${JSON.stringify({ refreshToken })} ${JSON.stringify({ storedToken })}`,
        { status: 401 },
      );
    }
  }

  // Store the refresh token
  async set(refreshToken: string, phoneNumber: string) {
    await this.state.storage.put<Row>("refreshToken", {
      refreshToken,
      createdAt: Date.now(),
      phoneNumber,
    });
  }

  // Retrieve the refresh token
  async get(): Promise<Row | undefined> {
    return this.state.storage.get<Row>("refreshToken");
  }

  // async refresh(
  //   refreshToken: string,
  //   userId: string,
  //   env: Env,
  // ): Promise<Response> {
  //   const storedToken = await this.state.storage.get<Row>('token');
  //   if (storedToken && storedToken.refreshToken === refreshToken) {
  //     if (Date.now() - storedToken.createdAt < 30 * 24 * 60 * 60 * 1000) {
  //       // Valid for 30 days
  //       const user = new User(userId, storedToken.phoneNumber); // Construct user (ensure you have phoneNumber or remove it depending on your model)

  //       const newRefreshToken = await generateRefreshToken(
  //         userId,
  //         env.JWT_SECRET,
  //       );
  //       await this.set(userId, newRefreshToken);

  //       const newAccessToken = await generateAccessToken(user, env.JWT_SECRET);

  //       return new Response(
  //         JSON.stringify({
  //           accessToken: newAccessToken,
  //           refreshToken: newRefreshToken,
  //         }),
  //       );
  //     } else {
  //       return new Response("Refresh token expired", { status: 403 });
  //     }
  //   } else {
  //     return new Response("Invalid refresh token", { status: 401 });
  //   }
  // }
}
