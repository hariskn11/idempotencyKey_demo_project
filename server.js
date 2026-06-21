const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const Redis = require('ioredis');

const app = express();

app.use(cors());
app.use(express.json());

const redis = new Redis(); 
const mockDatabase = [];

app.post('/api/trips/start', async (req, res) => {
  const idempotencyKey = req.headers['idempotency-key'];
  
  // Notice we extract 'simulateLag' from the incoming request body
  const { driverId, vehicleNumber, startLocation, simulateLag, deviceId } = req.body;

  if (!idempotencyKey) {
    return res.status(400).json({ error: 'Idempotency-Key header is mandatory.' });
  }

  try {
    // 1. Check Redis for existing request
    const cachedResponse = await redis.get(`idempotency:${idempotencyKey}`);

    if (cachedResponse) {
      const parsed = JSON.parse(cachedResponse);
      
      if (parsed.status === 'PENDING') {
        console.log(`[Cache Lock] Denying concurrent hit for key: ${idempotencyKey}`);
        return res.status(409).json({ message: 'Request is already being processed. Please wait.' });
      }

      console.log(`[Cache Hit] Duplicate request caught! Returning saved info for key: ${idempotencyKey}`);
      return res.status(200).json(parsed.body);
    }

    // 2. Lock the key (PENDING state) for 30 seconds
    await redis.set(`idempotency:${idempotencyKey}`, JSON.stringify({ status: 'PENDING' }), 'EX', 30);
    
    // 3. Determine how long the server should take
    const processingTime = simulateLag ? 10000 : 5000;
    console.log(`\n[Processing] Fresh request from Driver: ${driverId}.`);
    console.log(`[Processing] Device: ${deviceId || 'unknown'}. Simulating processing time: ${processingTime / 1000} seconds...`);
    
    // 4. SIMULATING SERVER LAG / DOWNTIME dynamically
    await new Promise(resolve => setTimeout(resolve, processingTime));

    // 5. Generate backend Trip ID and save to the Mock Database
    const newTrip = {
      trip_id: `TRIP_${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      driverId,
      vehicleNumber,
      startLocation,
      timestamp: new Date().toISOString()
    };
    
    mockDatabase.push(newTrip);
    console.log(`[Database] Inserted new row successfully. Trip ID: ${newTrip.trip_id}`);

    const responsePayload = {
      success: true,
      message: 'Trip started successfully',
      data: newTrip
    };

    // 6. Update Redis state to COMPLETED
    await redis.set(
      `idempotency:${idempotencyKey}`, 
      JSON.stringify({ status: 'COMPLETED', body: responsePayload }), 
      'EX', 
      30
    );

    return res.status(200).json(responsePayload);

  } catch (error) {
    console.error('Server error:', error);
    await redis.del(`idempotency:${idempotencyKey}`);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/trips/debug', (req, res) => {
  res.json({ total_records: mockDatabase.length, databaseRecords: mockDatabase });
});

app.listen(3000, () => console.log('Backend fleet server running on http://localhost:3000'));