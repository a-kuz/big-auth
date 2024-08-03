# Messenger backend on Cloudflare Workers 
with Durable objects (websockets hibernation api), Queues, KV, D1

Designed to be fast and scalable

Used:
- workers native RPC
- outbox pattern for reliability
- queues for push notifications
- D1 for storing users
- durable objects stores chat data
- lazy loading messages and other chat data from do storage to memory
  
Features:
- auth with sms code
- online/offline/last seen statuses
- dialogs
- group chats
- chat with ai
- uploading phone book
- message statuses
- reply, forward, edit, delete messages
- video calls, including group calls
- online updates by websocket
- attachmetns


 

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
  - [Durable Objects](#durable-objects)
  - [WebSockets](#websockets)
  - [JWT Authentication](#jwt-authentication)
- [Architecture Overview](#architecture-overview)
  - [Geographical Distribution](#geographical-distribution)
  - [Data Management](#data-management)
  - [WebSocket Connections](#websocket-connections)
- [API Documentation](#api-documentation)
- [Useful Resources](#useful-resources)

## Introduction

BIG Auth provides authentication and messaging capabilities for BIG Messenger. The backend is entirely built on Cloudflare's serverless stack, including Cloudflare Workers, Durable Objects, and KV storage. This architecture ensures low latency and high availability for global users without traditional server infrastructure.

## Features

### Durable Objects

Durable Objects maintain state and provide coordination across different components. They offer single-threaded, consistent views of data, essential for chat applications.

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

## Architecture Overview

### Geographical Distribution

#### Worldwide users

Assume we have three users:

- Alice in India
- Bob in Germany
- Alexandr in France

The distribution of Durable Objects and their geographic locations significantly impact the system's latency and efficiency.

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

## API Documentation

- [Documentation](https://docs.iambig.ai)

## Useful Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Durable Objects Documentation](https://developers.cloudflare.com/workers/learning/using-durable-objects/)
- [JSON Web Tokens](https://jwt.io/)
- [Wrangler CLI Tool](https://developers.cloudflare.com/workers/cli-wrangler)
- [itty-router-openapi](https://github.com/cloudflare/itty-router-openapi)
