import { User } from "../db/models/User";
import { generateAccessToken, generateRefreshToken } from "../services/jwt";
import { Env } from "../types/Env";
import { errorResponse } from "../utils/error-response";

// Interface for the request to set a new refresh token
interface SetRequest {
  userId: string;
  refreshToken: string;
  ip?: string;
  fingerprint?: string;
  phoneNumber?: string;
}

// Interface for the stored refresh token data
interface Row {
  refreshToken: string;
  ip?: string;
  fingerprint?: string;
  phoneNumber?: string;
  createdAt: number;
}

// Durable Object class for handling refresh tokens
export class RefreshTokenDO implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  // Handles incoming HTTP requests to the Durable Object
  async fetch(request: Request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const userId = url.searchParams.get("userId")!;

    if (request.method === "POST") {
      if (path === "/" || path === "/verify-code") {
        const req = await request.json<SetRequest>();
        await this.set(req.refreshToken, req.phoneNumber!);
        return new Response(null, { status: 200 });
      } else if (path === "/refresh") {
        const refreshToken = url.searchParams.get("refreshToken")!;
        const phoneNumber = url.searchParams.get("phoneNumber")!;

        return await this.refresh(refreshToken, userId, phoneNumber);
      } else {
        return errorResponse("Not found", 404);
      }
    } else {
      const refreshToken = await this.get();
      return new Response(JSON.stringify({ refreshToken }), { status: 200 });
    }
  }

  // Refreshes the refresh token if valid and not expired
  async refresh(refreshToken: string, userId: string, phoneNumber: string): Promise<Response> {
    const storedToken = await this.get();
    if (storedToken && storedToken.refreshToken === refreshToken) {
      if (Date.now() - storedToken.createdAt < 30 * 24 * 60 * 60 * 1000) { // Valid for 30 days
        const user = new User(userId, phoneNumber); // Construct user

        const newRefreshToken = await generateRefreshToken(userId);
        await this.set(newRefreshToken, phoneNumber);

        const newAccessToken = await generateAccessToken(user, this.env.JWT_SECRET);

        return new Response(JSON.stringify({ accessToken: newAccessToken, refreshToken: newRefreshToken }), { status: 200 });
      } else {
        return new Response("Refresh token expired", { status: 401 });
      }
    } else {
      return new Response("Invalid refresh token", { status: 401 });
    }
  }

  // Stores a new refresh token along with the creation timestamp and phone number
  async set(refreshToken: string, phoneNumber: string) {
    await this.state.storage.put<Row>("refreshToken", {
      refreshToken,
      createdAt: Date.now(),
      phoneNumber,
    });
  }

  // Retrieves the stored refresh token and its associated data
  async get(): Promise<Row | undefined> {
    return this.state.storage.get<Row>("refreshToken");
  }
}