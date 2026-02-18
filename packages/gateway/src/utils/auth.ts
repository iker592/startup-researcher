/**
 * Auth utilities - Extract user info from requests
 */

import { Resource } from "sst";

interface UserInfo {
  email: string;
  sub: string;
  name?: string;
}

const auth0Domain = Resource.Auth0Domain.value;

/**
 * Extract user email from Authorization header
 * Returns null if no valid auth
 */
export async function getUserFromRequest(event: any): Promise<UserInfo | null> {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  
  const token = authHeader.slice(7);
  
  try {
    // Validate token with Auth0 userinfo endpoint
    const response = await fetch(`https://${auth0Domain}/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!response.ok) {
      console.warn("Invalid token:", response.status);
      return null;
    }
    
    const user = await response.json() as { email?: string; sub?: string; name?: string };
    
    if (!user.email || !user.sub) {
      console.warn("User info missing email or sub");
      return null;
    }
    
    return {
      email: user.email.toLowerCase(),
      sub: user.sub,
      name: user.name,
    };
  } catch (error) {
    console.error("Error validating token:", error);
    return null;
  }
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuth(event: any): Promise<UserInfo> {
  const user = await getUserFromRequest(event);
  
  if (!user) {
    throw new Error("Authentication required");
  }
  
  return user;
}
