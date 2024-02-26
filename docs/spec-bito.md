
# Big Auth Project

## Overview

The Big Auth project is designed to demonstrate the use of Cloudflare Workers along with the  itty-router-openapi  package to add OpenAPI 3 schema generation and validation. It includes functionalities for OTP (One-Time Password) verification, user profile management, and file handling through Cloudflare's R2 storage.

## Getting Started

### Setup

To start using this template, create a  my-project  directory by running one of the following commands:
sh
npx wrangler generate my-project worker-openapi
yarn wrangler generate my-project worker-openapi
pnpm wrangler generate my-project worker-openapi

### Local Development

For local development, run the following command and navigate to  /docs  or  /redocs  in your browser:
  sh
wrangler dev

### Deployment

Deploy your project using:
  sh
wrangler deploy

## Key Components

### Handlers

- **SendCodeHandler** ( /src/handlers/SendCodeHandler.ts ): Handles sending OTP codes via Twilio.
- **VerifyCodeHandler** ( /src/handlers/VerifyCodeHandler.ts ): Verifies OTP codes.
- **GetProfileHandler** and **UpdateProfileHandler** ( /src/handlers/GetProfileHandler.ts  and  /src/handlers/UpdateProfileHandler.ts ): Manage user profile retrieval and updates.
- **UploadFileHandler** and **RetrieveFileHandler** ( /src/handlers/UploadFileHandler.ts  and  /src/handlers/RetrieveFileHandler.ts ): Manage file uploads to and retrievals from Cloudflare's R2 storage.

### Services

- **JWT Services** ( /src/services/jwt.ts ): Includes functions to generate access and refresh tokens.
- **User Services** ( /src/services/get-user.ts  and  /src/services/get-user-by-token.ts ): Functions to retrieve user information from the database.

### Utilities

- **Error Response** ( /src/utils/error-response.ts ): A utility function to generate error responses.
- **Name Cases** ( /src/utils/name-сases.ts ): Functions to convert between snake_case and camelCase.

### Database Migrations

SQL scripts for creating and indexing the  users  table are located in  /src/migrations .

### Configuration Files

- **wrangler.toml**: Configures deployment settings and environment variables.
- **tsconfig.json**: TypeScript configuration.
- **package.json**: Defines project dependencies and scripts.

## Dependencies

This project utilizes several key npm packages:

- @cloudflare/itty-router-openapi : For routing and OpenAPI integration.
- class-transformer : For serializing and deserializing class instances.
- @tsndr/cloudflare-worker-jwt : For JWT handling.
- nanoid : For generating unique IDs.

## Conclusion

The Big Auth project showcases a practical implementation of authentication and file management using Cloudflare Workers. By following the setup and deployment instructions, you can get the project up and running quickly. The codebase is structured to be modular and extendable, allowing for easy integration of additional functionalities as needed.

For further customization and scaling, refer to the individual file comments and Cloudflare's documentation on Workers and R2 storage.
