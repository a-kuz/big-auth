
# BIG Auth - Cloudflare Workers Implementation

<small>text was written by GPT</small>

This repository contains the Cloudflare Workers implementation of the BIG Auth application. It's designed to support the authentication and messaging functionalities of the BIG Messenger application. Instead of using Node.js, this project leverages Cloudflare Workers, Durable Objects, and WebSockets to provide scalable and efficient serverless infrastructure.

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
  - [Durable Objects](#durable-objects)
  - [WebSockets](#websockets)
  - [JWT Authentication](#jwt-authentication)
- [Architecture Example](#architecture-example)
  - [Geographical Distribution](#geographical-distribution)
  - [Data Management](#data-management)
  - [WebSocket Connections](#websocket-connections)
- [Development Setup](#development-setup)
  - [Prerequisites](#prerequisites)
  - [Running Locally](#running-locally)
- [Production Deployment](#production-deployment)
- [API Documentation](#api-documentation)
- [Useful Resources](#useful-resources)

## Introduction

BIG Auth provides authentication and messaging capabilities for BIG Messenger. The backend is built entirely on Cloudflare's serverless stack, which includes Cloudflare Workers, Durable Objects, and KV storage. This architecture ensures low latency and high availability for global users without the need for traditional server infrastructure.

## Features

### Durable Objects

Durable Objects are used extensively in this project to maintain state and provide coordination across different components. They allow you to have single-threaded, consistent views of data, which is crucial for chat applications.

Some key Durable Objects used include:

- **ChatGptDO:** Manages individual chat sessions with AI. It handles user messages, interacts with the GPT service, and stores chat history.
- **GroupChatsDO:** Coordinates messages and states in group chats. It manages participants, message delivery statuses, and chat history.
- **DialogsDO:** Handles peer-to-peer chat dialogs. It manages direct message exchanges between users, tracking delivery and read receipts.
- **PushDO:** Manages device tokens for push notifications. It stores and retrieves device tokens, ensuring users receive notifications across devices.
- **RefreshTokenDO:** Safely manages refresh tokens for users. It validates, stores, and refreshes tokens for continued user sessions.

### WebSockets

WebSockets are essential for real-time communication in chat applications. This project uses WebSockets to implement the chat functionality, enabling real-time message delivery and status updates. The `WebSocketGod` class provides the foundation for managing WebSocket connections and events.

### JWT Authentication

JSON Web Tokens (JWT) are used for securing the endpoints and verifying user identities. Here are the key aspects:

- Access tokens are generated when a user logs in and must be provided in subsequent requests for authentication.
- Refresh tokens are used to obtain new access tokens without requiring the user to log in again.
- Token management is handled by the `RefreshTokenDO` Durable Object.

## Geographical Distribution

### Worldwide users

Assume we have three users:

- Alice in India
- Bob in Germany
- Alexandr in France

The distribution of Durable Objects and their geographic locations impacts the latency and efficiency of the system significantly.

### Data Management

1. **User Data & Profiles:**
   - **Location:** Central D1 Database
   - **Details:** User profiles and related metadata are stored in a D1 relational database, ensuring consistency and accessibility.

2. **Messages and Chats:**
   - **Location:** Durable Objects
   - **Details:**
     - Alice, Bob, and Alexandr's individual chat logs are managed by their respective `DialogsDO` instances.
     - The group chat they all participate in is managed by `GroupChatsDO`.

3. **Group Chat Example:**
   - If a group chat Durable Object instance (`GroupChatsDO`) is created, Cloudflare may allocate this instance in one of the data centers close to one of the participants to optimize performance (e.g., Paris for Alexandr).

### WebSocket Connections

WebSockets are established to the nearest Cloudflare data center for each user to reduce latency:

- **Alice (India):** Connects to the nearest data center, possibly in Mumbai.
- **Bob (Germany):** Connects to a Frankfurt data center.
- **Alexandr (France):** Connects locally within France, likely Paris.

Each user's interaction with their WebSocket connection is then routed through Cloudflare's network to the data center managing the Durable Object, ensuring each message update or query is efficiently handled.

### Example Interaction

**Scenario:** Alice sends a message to the group chat.

1. **Message Handling:**
   - Alice's message is sent to the Paris data center (where the `GroupChatsDO` instance resides).
   - The message is processed, updating the state and sending responses back through the WebSocket connections.

2. **Notifications and Updates:**
   - Bob and Alexandr receive updates via their nearest data centers (Frankfurt and Paris, respectively), while the actual state is managed in Paris.

## Development Setup

### Prerequisites

Ensure you have the following installed:

- [Node.js](https://nodejs.org/)
- [Wrangler](https://developers.cloudflare.com/workers/cli-wrangler) - Cloudflare's command-line tool
- [Typescript](https://www.typescriptlang.org/)

### Running Locally

1. Clone the repository:

   ```sh
   git clone https://github.com/yourusername/big-auth
   cd big-auth
   ```

2. Install dependencies:

   ```sh
   npm install
   ```

3. Authenticate Wrangler with your Cloudflare account:

   ```sh
   wrangler login
   ```

4. Set up environment variables by creating a `.env` file with the following contents:

   ```sh
   TWILIO_SERVICE_SID='<your_twilio_service_sid>'
   TWILIO_ACCOUNT_SID='<your_twilio_account_sid>'
   TWILIO_AUTH_TOKEN='<your_twilio_auth_token>'
   JWT_SECRET='<your_jwt_secret>'
   OPEN_AI_API_KEY='<your_openai_api_key>'
   ```

5. Start the development server:

   ```sh
   wrangler dev
   ```

   The API will be accessible at `https://dev.iambig.ai`.

## Production Deployment

To deploy your application to Cloudflare's edge network, run:

```sh
wrangler publish
```

This command will deploy your application based on the configuration in the `wrangler.toml` file.

## API Documentation

The API is documented using OpenAPI standards. You can access the API documentation by navigating to `/docs` on the deployed application URL.

- **Send Code:** `POST /send-code`
- **Verify Code:** `POST /verify-code`
- **Refresh Token:** `POST /auth/refresh`
- **Create Chat:** `POST /chats`
- **Get Chats:** `GET /chats`
- **Send Message:** `POST /messages`

For detailed request and response schemas, refer to the handlers provided in the `src/handlers` directory.

## Useful Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Durable Objects Documentation](https://developers.cloudflare.com/workers/learning/using-durable-objects/)
- [JSON Web Tokens](https://jwt.io/)
- [Wrangler CLI Tool](https://developers.cloudflare.com/workers/cli-wrangler)
- [itty-router-openapi](https://github.com/cloudflare/itty-router-openapi)

Feel free to contribute by opening issues or submitting PRs to enhance the functionality and fix any bugs. Happy coding!"
