const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN,
});

// In-memory fallback mock database (resets on each serverless cold start — use for demo only)
const mockDatabase = [];

export default async function handler(req, res) {
  // Enable CORS for all origins (needed for multi-device testing)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    return handleStartTrip(req, res);
  }

  if (req.method === 'GET' && req.url === '/api/trips/debug') {
    return res.json({ total_records: mockDatabase.length, databaseRecords: mockDatabase });
  }

  return res.status(404).json({ error: 'Not found' });
}

async function handleStartTrip(req, res) {
  const idempotencyKey = req.headers['idempotency-key'];
  const { driverId, vehicleNumber, startLocation, simulateLag } = req.body;

  console.log(`\n========== INCOMING REQUEST ==========`);
  console.log(`[Idempotency-Key] ${idempotencyKey}`);
  console.log(`[Driver] ${driverId}`);
  console.log(`[Vehicle] ${vehicleNumber}`);
  console.log(`======================================\n`);

  if (!idempotencyKey) {
    return res.status(400).json({ error: 'Idempotency-Key header is mandatory.' });
  }

  try {
    // 1. Check Upstash Redis for cached response
    const cachedResponse = await redis.get(`idempotency:${idempotencyKey}`);

    if (cachedResponse) {
      const parsed = typeof cachedResponse === 'string'
        ? JSON.parse(cachedResponse)
        : cachedResponse;

      if (parsed.status === 'PENDING') {
        console.log(`[Cache Lock] Denying concurrent hit for key: ${idempotencyKey}`);
        return res.status(409).json({ message: 'Request is already being processed. Please wait.' });
      }

      console.log(`[Cache Hit] Duplicate request caught! Returning saved info for key: ${idempotencyKey}`);
      return res.status(200).json(parsed.body);
    }

    // 2. Lock the key (PENDING state) for 60 seconds
    await redis.set(`idempotency:${idempotencyKey}`, JSON.stringify({ status: 'PENDING' }), { ex: 60 });

    // 3. Determine processing time
    const processingTime = simulateLag ? 10000 : 5000;
    console.log(`\n[Processing] Fresh request from Driver: ${driverId}.`);
    console.log(`[Processing] Simulating processing time: ${processingTime / 1000} seconds...`);

    // 4. Simulate server processing delay
    await new Promise(resolve => setTimeout(resolve, processingTime));

    // 5. Generate trip and save to mock DB
    const crypto = require('crypto');
    const newTrip = {
      trip_id: `TRIP_${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      driverId,
      vehicleNumber,
      startLocation,
      timestamp: new Date().toISOString(),
    };

    mockDatabase.push(newTrip);
    console.log(`[Database] Inserted new row successfully. Trip ID: ${newTrip.trip_id}`);

    const responsePayload = {
      success: true,
      message: 'Trip started successfully',
      data: newTrip,
    };

    // 6. Update Redis to COMPLETED (cache for 60 seconds)
    await redis.set(
      `idempotency:${idempotencyKey}`,
      JSON.stringify({ status: 'COMPLETED', body: responsePayload }),
      { ex: 60 }
    );

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error('Server error:', error);
    await redis.del(`idempotency:${idempotencyKey}`);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
