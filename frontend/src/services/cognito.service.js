// src/services/aws/cognito.service.js
import { createHmac } from "crypto";
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const client = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
});

function secretHash(username) {
  return createHmac("sha256", process.env.COGNITO_CLIENT_SECRET)
    .update(username + process.env.COGNITO_CLIENT_ID)
    .digest("base64");
}

// ✅ export เพิ่มให้ controller ใช้ได้
export const cognitoClient = client;
export { secretHash };

// (option) service wrappers ถ้าจะใช้ที่อื่น
export async function signUp({ username, password, email }) {
  const cmd = new SignUpCommand({
    ClientId: process.env.COGNITO_CLIENT_ID,
    SecretHash: secretHash(username),
    Username: username,
    Password: password,
    UserAttributes: [{ Name: "email", Value: email }],
  });
  return client.send(cmd);
}

export async function confirmSignUp({ username, code }) {
  const cmd = new ConfirmSignUpCommand({
    ClientId: process.env.COGNITO_CLIENT_ID,
    SecretHash: secretHash(username),
    Username: username,
    ConfirmationCode: code,
  });
  return client.send(cmd);
}

export async function login({ username, password }) {
  const cmd = new InitiateAuthCommand({
    ClientId: process.env.COGNITO_CLIENT_ID,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
      SECRET_HASH: secretHash(username),
    },
  });
  return client.send(cmd);
}
