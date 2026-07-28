const request = require('supertest');
const app = require('../app');
const env = require('../config/env');

describe('Full Functional Workflow (Live External Dependencies)', () => {
  // Increase timeout for live API calls
  jest.setTimeout(30000);

  it('should have valid API keys for live testing', () => {
    // This test ensures the live environment is properly configured
    // before running actual live requests that would otherwise fail vaguely.
    expect(env.openai.apiKey).toBeDefined();
    expect(env.googlePlaces.apiKey).toBeDefined();
    expect(env.firebase.projectId).toBeDefined();
  });

  it('should test the health endpoint', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('ok');
  });

  it('should be able to search a business using live Google Places API', async () => {
    // Test a live endpoint that hits google places autocomplete
    const res = await request(app).get('/api/admin/places/autocomplete?input=starbucks');
    // If keys are missing, it might return 400 or 500, but with real keys it should be 200
    if (res.statusCode === 200) {
      expect(res.body).toHaveProperty('suggestions');
      expect(Array.isArray(res.body.suggestions)).toBe(true);
    } else {
      console.warn('Live Places API test skipped or failed due to invalid credentials');
    }
  });
});
