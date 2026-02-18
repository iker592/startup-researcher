/**
 * 🔐 Auth0 Authentication (Simple OAuth2 flow)
 * 
 * Uses Authorization Code flow with DynamoDB for state storage.
 */

import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { Resource } from "sst";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

// Use basePath to match API Gateway routing
const app = new Hono().basePath("/auth");

// DynamoDB client for state storage
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = Resource.ResearchData.name;

// Auth0 config
const auth0Domain = Resource.Auth0Domain.value;
const auth0ClientId = Resource.Auth0ClientId.value;
const auth0ClientSecret = Resource.Auth0ClientSecret.value;

// Frontend URL (will be set via env or default)
const FRONTEND_URL = process.env.FRONTEND_URL || "https://d3t2d2knwma4dv.cloudfront.net";

// 🔒 Email whitelist - only these users can log in
const ALLOWED_EMAILS = [
  "iker0592@gmail.com",
  "heiman0427@gmail.com",
];

console.log("Auth0 Config:", { domain: auth0Domain, clientId: auth0ClientId?.substring(0, 8) + "...", table: TABLE_NAME });

/**
 * GET /auth/authorize - Start OAuth flow
 */
app.get("/authorize", async (c) => {
  const redirectUri = c.req.query("redirect_uri") || FRONTEND_URL;
  const state = crypto.randomUUID();
  
  // Get the API base URL from request
  const host = c.req.header("host") || "";
  const proto = c.req.header("x-forwarded-proto") || "https";
  const apiBaseUrl = `${proto}://${host}`;
  
  // Store state in DynamoDB
  await db.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      pk: "AUTH_STATE",
      sk: state,
      redirectUri,
      apiBaseUrl,
      createdAt: Date.now(),
      ttl: Math.floor(Date.now() / 1000) + 600, // 10 min TTL
    },
  }));
  
  // Build Auth0 authorization URL
  const callbackUrl = `${apiBaseUrl}/auth/callback`;
  
  const authUrl = new URL(`https://${auth0Domain}/authorize`);
  authUrl.searchParams.set("client_id", auth0ClientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", callbackUrl);
  authUrl.searchParams.set("scope", "openid profile email");
  authUrl.searchParams.set("state", state);
  
  console.log("Redirecting to Auth0:", authUrl.toString());
  
  return c.redirect(authUrl.toString());
});

/**
 * GET /auth/callback - Handle OAuth callback
 */
app.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");
  
  console.log("Callback received:", { code: !!code, state, error });
  
  if (error) {
    const desc = c.req.query("error_description") || error;
    return c.redirect(`${FRONTEND_URL}#error=${encodeURIComponent(desc)}`);
  }
  
  if (!code || !state) {
    return c.redirect(`${FRONTEND_URL}#error=missing_params`);
  }
  
  // Get state from DynamoDB
  const result = await db.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk: "AUTH_STATE", sk: state },
  }));
  
  if (!result.Item) {
    console.error("State not found:", state);
    return c.redirect(`${FRONTEND_URL}#error=invalid_state`);
  }
  
  const redirectUri = result.Item.redirectUri as string;
  const apiBaseUrl = result.Item.apiBaseUrl as string;
  
  // Delete used state
  await db.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { pk: "AUTH_STATE", sk: state },
  }));
  
  // Exchange code for tokens
  const callbackUrl = `${apiBaseUrl}/auth/callback`;
  
  const tokenResponse = await fetch(`https://${auth0Domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: auth0ClientId,
      client_secret: auth0ClientSecret,
      code,
      redirect_uri: callbackUrl,
    }),
  });
  
  if (!tokenResponse.ok) {
    const err = await tokenResponse.text();
    console.error("Token exchange failed:", err);
    return c.redirect(`${redirectUri}#error=token_exchange_failed`);
  }
  
  const tokens = await tokenResponse.json() as { access_token: string; id_token?: string };
  console.log("Got tokens:", { hasAccessToken: !!tokens.access_token, hasIdToken: !!tokens.id_token });
  
  // 🔒 Check if user's email is in whitelist
  const userResponse = await fetch(`https://${auth0Domain}/userinfo`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  
  if (!userResponse.ok) {
    console.error("Failed to get user info");
    return c.redirect(`${redirectUri}#error=user_info_failed`);
  }
  
  const user = await userResponse.json() as { email?: string };
  console.log("User email:", user.email);
  
  if (!user.email || !ALLOWED_EMAILS.includes(user.email.toLowerCase())) {
    console.warn("🚫 Access denied for email:", user.email);
    return c.redirect(`${redirectUri}#error=access_denied&message=${encodeURIComponent("Your email is not authorized to use this app.")}`);
  }
  
  console.log("✅ Access granted for:", user.email);
  
  // Pass tokens via URL fragment (client-side only)
  const params = new URLSearchParams();
  params.set("access_token", tokens.access_token);
  if (tokens.id_token) {
    params.set("id_token", tokens.id_token);
  }
  
  return c.redirect(`${redirectUri}#${params.toString()}`);
});

/**
 * GET /auth/me - Get user info
 */
app.get("/me", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing token" }, 401);
  }
  
  const token = authHeader.slice(7);
  
  const userResponse = await fetch(`https://${auth0Domain}/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  if (!userResponse.ok) {
    return c.json({ error: "Invalid token" }, 401);
  }
  
  const user = await userResponse.json();
  return c.json(user);
});

/**
 * GET /auth/logout - Clear session
 */
app.get("/logout", async (c) => {
  const returnTo = c.req.query("returnTo") || FRONTEND_URL;
  
  const logoutUrl = new URL(`https://${auth0Domain}/v2/logout`);
  logoutUrl.searchParams.set("client_id", auth0ClientId);
  logoutUrl.searchParams.set("returnTo", returnTo);
  
  return c.redirect(logoutUrl.toString());
});

export const handler = handle(app);
