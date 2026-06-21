# Trip Idempotency Key Demo

A real-world demo showing how **idempotency keys** prevent duplicate trip requests when a driver's app crashes mid-request.

## 🧠 Concept

1. Driver clicks "Start Trip" → App generates a unique key, saves it to **localStorage**, sends it to the server
2. Server takes 5-10 seconds to process (simulating real-world lag)
3. If the app crashes (network abort at 2s), the **key stays in localStorage**
4. When the driver reopens the app, it finds the saved key and **retries with the same key**
5. Server detects the duplicate key → returns the **original result** (no duplicate trip created)

## 🚀 Deploy to Vercel (via GitHub)

### Prerequisites
- A [GitHub](https://github.com) account
- A [Vercel](https://vercel.com) account (free)
- A [Upstash](https://upstash.com) Redis account (free tier)

### Step 1: Push to GitHub

```bash
# Initialize git repo
cd trip-idempotencyKey-demo
git init
git add .
git commit -m "Initial commit: idempotency key demo"

# Create a repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/trip-idempotency-demo.git
git branch -M main
git push -u origin main
```

### Step 2: Set Up Upstash Redis

1. Go to [upstash.com](https://upstash.com) → Sign up free
2. Create a new Redis database (choose the **Global** or **AWS us-east-1** region — free tier)
3. After creation, copy two values from the **REST API** section:
   - `UPSTASH_REDIS_URL` (e.g., `https://xxxx.upstash.io`)
   - `UPSTASH_REDIS_TOKEN`

### Step 3: Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your `trip-idempotency-demo` GitHub repo
3. In **Environment Variables**, add:
   - `UPSTASH_REDIS_URL` → paste your Upstash URL
   - `UPSTASH_REDIS_TOKEN` → paste your Upstash token
4. **Framework Preset**: Leave as **Other**
5. Click **Deploy**

### Step 4: Open on Multiple Devices

Once deployed, Vercel gives you a URL like:
```
https://trip-idempotency-demo.vercel.app
```

Open this URL on **multiple devices** (phone, laptop, tablet, another browser) to test the concept.

## 🧪 How to Test Multi-Device Scenario

### Scenario: App Crash + Retry (Cross-Device)

| Step | Device A (Phone) | Server | Device B (Laptop) |
|------|-----------------|--------|-------------------|
| 1 | Opens app → Device ID: `DEVICE_ABC1` | — | — |
| 2 | Clicks **"Start Trip & Simulate App Crash"** | Starts processing (10s) | — |
| 3 | App "crashes" at 2s (request aborted) | Still processing... | — |
| 4 | Key `abc-123` saved in localStorage ❌ | — | — |
| 5 | — | Processing completes ✅ Trip created | — |
| 6 | Clicks **"Start Trip (Normal / Retry)"** | Detects key `abc-123` → **Cache HIT!** Returns same trip ✅ | — |
| 7 | Trip confirmed, key removed from storage ✅ | — | — |

### Scenario: Two Different Devices (Different Keys)

| Step | Device A (Phone) | Server | Device B (Laptop) |
|------|-----------------|--------|-------------------|
| 1 | Opens app → Device ID: `DEVICE_ABC1` | — | Opens app → Device ID: `DEVICE_XYZ2` |
| 2 | Starts trip with key `key-A` | Creates Trip #1 ✅ | Starts trip with key `key-B` |
| 3 | — | — | Creates Trip #2 ✅ |

### Scenario: Same Key Used from Wrong Device (Idempotency Protection)

| Step | Device A (Phone) | Server | Device B (Laptop) |
|------|-----------------|--------|-------------------|
| 1 | Starts trip, gets key `abc-123` | Creates Trip #1 ✅ | — |
| 2 | Trip successful, key cleared ✅ | — | — |
| 3 | — | — | Tries to manually reuse `abc-123` |
| 4 | — | Returns cached Trip #1 (no duplicate) ✅ | Idempotency works! |

## 📁 Project Structure

```
trip-idempotencyKey-demo/
├── api/
│   └── trips/
│       └── start.js       # Vercel serverless function (uses Upstash Redis)
├── index.html              # Frontend UI (works on any device)
├── server.js               # Local dev server (uses ioredis + local Redis)
├── client.js               # CLI-based test client
├── client1.js              # CLI: Simulates app crash
├── client2.js              # CLI: Simulates app reopen & retry
├── package.json
├── vercel.json             # Vercel deployment config
└── README.md
```

## 💻 Local Development

```bash
# 1. Start local Redis (Docker)
docker run -p 6379:6379 redis

# 2. Install dependencies
npm install

# 3. Start server
node server.js

# 4. Open http://localhost:3000 in browser
#    (The local server.js serves index.html automatically if you add static serving)
```

> **Note:** The local `server.js` works with `ioredis` (local Redis). The Vercel function `api/trips/start.js` works with `@upstash/redis` (serverless Redis).

## 🔑 Key Takeaway

**localStorage is per-device.** Each device (phone, laptop, tablet) has its own localStorage. The idempotency key ensures that even if the same device retries a request, the server won't create a duplicate trip. The shared Redis backend is what makes this work across devices.
