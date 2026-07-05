# Authentication: NextAuth v5 (Auth.js)

The web dashboard uses NextAuth v5 (also called Auth.js) for OAuth authentication. This guide covers setup, configuration, and customization.

## Overview

**Purpose:** Secure user authentication via OAuth, storing sessions in Postgres.

**Providers:** Google, GitHub, or custom OpenID providers.

**Session Storage:** Postgres `User`, `Account`, `Session` tables (via Prisma).

## Quick Start

### 1. Setup OAuth Provider (Google)

Visit [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

1. Create a new OAuth 2.0 credential (Web application)
2. Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
3. Copy Client ID and Secret

### 2. Configure Environment

```bash
# .env
AUTH_SECRET=$(openssl rand -base64 33)
AUTH_URL=http://localhost:3000

AUTH_GOOGLE_ID=<your-client-id>
AUTH_GOOGLE_SECRET=<your-client-secret>
```

### 3. Start Web Dashboard

```bash
cd web
npm run dev
# http://localhost:3000 → redirects to login
```

### 4. Click "Sign in with Google"

You'll be redirected to Google's consent screen, then back to the dashboard.

## Configuration

### Setup New OAuth Provider

Edit `web/auth.config.ts`:

```typescript
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import MyProvider from "next-auth/providers/custom";

export const authOptions: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    MyProvider({
      // Custom provider config
    }),
  ],
  // ... other options
};
```

### Modify Session Callback

Customize what data is stored in the session:

```typescript
callbacks: {
  async session({ session, user }) {
    // Add custom data to session
    session.user.id = user.id;
    session.user.isAdmin = user.isAdmin;  // if User model has this
    return session;
  },

  async jwt({ token, user }) {
    // Add custom data to JWT token
    if (user) {
      token.uid = user.id;
    }
    return token;
  },
},
```

## Environment Variables

### Required

```bash
# Auth.js secret (generate: openssl rand -base64 33)
AUTH_SECRET=<random-string>

# Base URL of your app
AUTH_URL=http://localhost:3000  # local dev
AUTH_URL=https://careerops.example.com  # production
```

### OAuth Providers (Add at Least One)

**Google:**
```bash
AUTH_GOOGLE_ID=<from Google Cloud Console>
AUTH_GOOGLE_SECRET=<from Google Cloud Console>
```

**GitHub:**
```bash
AUTH_GITHUB_ID=<from GitHub Settings>
AUTH_GITHUB_SECRET=<from GitHub Settings>
```

## How It Works

### Login Flow

```
1. User clicks "Sign in with Google"
2. Redirects to GET /api/auth/signin/google
3. NextAuth redirects to google.com
4. User authenticates with Google
5. Google redirects to /api/auth/callback/google?code=...
6. NextAuth exchanges code for access_token
7. NextAuth creates session (stored in Postgres)
8. Redirect to dashboard
```

### Subsequent Requests

```
1. User has session token in HTTP-only cookie
2. Request to /api/applications
3. NextAuth validates session token against Postgres
4. Endpoint retrieves userId from session
5. Database query filtered by userId
6. Response sent (only this user's data)
```

### Logout

```
1. User clicks "Sign out"
2. Deletes session from Postgres
3. Clears session cookie
4. Redirects to login page
```

## Session Management

### Get Current Session in Page

```typescript
import { getSession } from "@/lib/session";

export default async function DashboardPage() {
  const session = await getSession();
  
  if (!session) {
    return <div>Not authenticated</div>;
  }

  return (
    <div>
      <p>Welcome, {session.user.email}</p>
    </div>
  );
}
```

### Get Current Session in API Route

```typescript
import { requireUserId } from "@/lib/session";

export async function GET(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // userId is guaranteed here
  const apps = await db.application.findMany({
    where: { userId },
  });

  return NextResponse.json({ applications: apps });
}
```

### Check Session in Middleware

```typescript
// web/middleware.ts
import { auth } from "@/auth";

export const middleware = auth((req) => {
  // This runs only if user is authenticated
  if (!req.auth) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: ["/", "/dashboard", "/profile"],
};
```

## User Management

### Create User (Automatic)

Users are created automatically on first OAuth login.

**Prisma User Model:**
```prisma
model User {
  id        String    @id @default(cuid())
  email     String?   @unique
  name      String?
  image     String?
  createdAt DateTime  @default(now())
  
  accounts  Account[]
  sessions  Session[]
  // ...
}
```

### Link Multiple Accounts to One User

If a user logs in with Google, then later with GitHub, should they be the same account?

**Option 1: Allow linking (current)**
```typescript
allowDangerousEmailAccountLinking: true,
```
This allows the same email to link multiple OAuth providers.

**Option 2: Block linking**
```typescript
allowDangerousEmailAccountLinking: false,
```
This prevents linking; users must use the same provider each time.

### Delete User

```typescript
// Delete user and all associated data
await db.user.delete({
  where: { id: userId },
  // Cascades delete Account, Session, Application, FilterKeyword
});
```

## Testing Authentication Locally

### Test OAuth Flow Manually

```bash
# 1. Start dashboard
cd web
npm run dev

# 2. Open in browser
open http://localhost:3000

# 3. Click "Sign in with Google"
# You'll be redirected to Google (use your own Google account)

# 4. After login, should see dashboard
```

### Test with Fake User (Dev Only)

For testing without OAuth, create a fake session in dev:

```typescript
// In a test route
import { auth } from "@/auth";

export async function GET() {
  // Get real session
  const session = await auth();
  
  // session will be null if not authenticated
  // Redirect to /api/auth/signin if needed
}
```

## Troubleshooting

### "Invalid OAuth Credentials"

**Error:** `invalid_grant` or `invalid_client`

**Cause:** Client ID or secret is wrong.

**Fix:**
1. Go to Google Cloud Console / GitHub Settings
2. Verify client ID and secret match `.env`
3. Verify redirect URI matches `AUTH_URL/api/auth/callback/{provider}`

### "AUTH_URL mismatch"

**Error:** `OAuth callback URL mismatch`

**Cause:** `AUTH_URL` doesn't match registered redirect URI.

**Fix:**
1. Set `AUTH_URL` in `.env` to match your domain (e.g., `https://careerops.example.com`)
2. Register that exact URL in OAuth provider settings
3. For localhost, use `http://localhost:3000`

### "Session not found"

**Error:** Clicking authenticated endpoints returns 401

**Cause:** Session token not in cookie or expired.

**Fix:**
```bash
# Clear cookies and re-login
# Browser DevTools → Application → Cookies → Delete nextauth.*
# Then refresh and log in again
```

### "Prisma Client Error"

**Error:** `Prisma Client Error: connect() failed` during session check

**Cause:** Postgres is down or `DATABASE_URL` is incorrect.

**Fix:**
```bash
# Check Postgres
docker compose ps postgres

# Check DATABASE_URL
echo $DATABASE_URL

# Restart if needed
docker compose restart postgres
```

## Security Considerations

### 1. Use HTTPS in Production

Always use `https://` URLs in production:

```bash
AUTH_URL=https://careerops.example.com
```

### 2. Protect AUTH_SECRET

Keep `AUTH_SECRET` private and strong:

```bash
# Generate a new secret
openssl rand -base64 33
# Example output: F8x9Kq2+L7w/J3p5Zr8n+X4Y9c/D6e=

# Add to .env (keep private, never commit)
AUTH_SECRET=F8x9Kq2+L7w/J3p5Zr8n+X4Y9c/D6e=
```

### 3. Use Secure Cookies

In production, cookies are automatically marked as `Secure` and `HttpOnly`.

### 4. Scoped Queries

Always filter database queries by `userId`:

```typescript
// ✓ Good: Scoped to user
const apps = await db.application.findMany({
  where: { userId: session.user.id },
});

// ✗ Bad: Returns all applications
const apps = await db.application.findMany();
```

## See Also

- [Web Dashboard Overview](./overview.md)
- [Rest API Reference](./api.md)
- [NextAuth.js Documentation](https://authjs.dev/)
