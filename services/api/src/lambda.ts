import { handle } from 'hono/aws-lambda';
import { createApp } from './app';
import { cognitoVerifierFromEnv } from './middleware/cognito-verifier';

export const handler = handle(createApp(cognitoVerifierFromEnv()));
