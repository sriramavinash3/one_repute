require('dotenv').config({ path: 'd:/dev project/onerepute-ag/one_repute/backend/.env' });
const Razorpay = require('razorpay');

async function testPlanCreation() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  try {
    const rzp = new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });

    console.log('Attempting to create a test plan on Razorpay...');
    const plan = await rzp.plans.create({
      period: 'monthly',
      interval: 1,
      item: {
        name: 'Starter India Monthly (Test)',
        amount: 99900,
        currency: 'INR',
        description: 'Test Plan'
      }
    });
    console.log('Plan created successfully on Razorpay! ID:', plan.id);
  } catch (err) {
    console.error('Error creating plan on Razorpay:', err.message);
  }
}

testPlanCreation();
