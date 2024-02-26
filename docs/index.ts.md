# BIG Auth API Specification

## Overview

This API is designed to handle authentication and user profile management. It includes endpoints for sending verification codes, verifying codes, retrieving and updating user profiles, and handling file uploads and retrievals.

## Endpoints

### POST /send-code

This endpoint is used to send a verification code.

**Handler:** `SendCodeHandler`

### POST /verify-code

This endpoint is used to verify a code that was previously sent.

**Handler:** `VerifyCodeHandler`

### GET /profile

This endpoint is used to retrieve the profile of the authenticated user.

**Handler:** `GetProfileHandler`

### POST /profile

This endpoint is used to update the profile of the authenticated user.

**Handler:** `UpdateProfileHandler`

### GET /public/:id/

This endpoint is used to retrieve a file with the given ID.

**Handler:** `RetrieveFileHandler`

### POST /public/upload

This endpoint is used to upload a file.

**Handler:** `UploadFileHandler`

## Security Schemes

The API uses the Bearer Authentication scheme.

## Error Handling

For all other requests, a 404 Not Found response will be returned.

## Redirection

A request to the root ("/") will be redirected to the "/docs" page.