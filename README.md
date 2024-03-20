# Big Project

This project provides a comprehensive authentication, user profile management, messaging, and file handling solution for applications. Built on Cloudflare Workers, it includes features such as sending OTP for verification, refreshing tokens, finding contacts, managing user profiles, sending messages, uploading and retrieving files, and providing network info.

## Features

- **Authentication:** Send OTP and verify it. Refresh access tokens.
- **User Profile Management:** Find contacts by phone numbers, get and update user profiles.
- **Messaging:** Send, receive, and manage messages. Retrieve chat lists.
- **File Handling:** Upload and retrieve files.
- **Network Information:** Provide information about the network request.

## How It Works

- **Authentication:** Utilizes Twilio for OTP verification and JWT for token management.
- **User Profiles:** Stores user data in a Cloudflare D1 database. Allows updating user profiles.
- **Messaging:** Implements a Durable Object for each user to handle messaging logic.
- **File Handling:** Files are uploaded to and retrieved from Cloudflare R2 storage.
- **Network Information:** Offers insights into the request's network information like country, region, and more.

## Technologies Used

- Cloudflare Workers for serverless function execution.
- Cloudflare D1 for database storage.
- Cloudflare R2 for file storage.
- JWT for token generation and verification.
- Twilio for sending OTPs.

## Getting Started

1. **Setup Cloudflare Worker:**
   - Clone the repository.
   - Set up Wrangler CLI and authenticate with Cloudflare.
   - Configure `wrangler.toml` with your Cloudflare account details.

2. **Configure Environment Variables:**
   - Twilio account SID, auth token, and service SID.
   - JWT secret for token encryption.

3. **Deploy:**
   - Run `wrangler publish` to deploy the worker.

## Structure

- **`./src/index.ts`:** Main entry point.
- **`./handlers/`:** Request handlers for different features.
- **`./durable-objects/`:** Durable Objects for stateful logic.
- **`./db/`:** Database models and services.
- **`./utils/`:** Utility functions.

## Documentation

Access the API documentation by navigating to `/docs` endpoint after deployment.

## License

This project is licensed under the MIT License.
