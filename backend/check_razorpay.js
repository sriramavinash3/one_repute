require('dotenv').config({ path: 'd:/dev project/onerepute-ag/one_repute/backend/.env' });
const Razorpay = require('razorpay');

async function checkRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  console.log('Using Razorpay Key:', keyId);

  try {
    const rzp = new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });

    console.log('Fetching all Razorpay Plans...');
    const plans = await rzp.plans.all();
    console.log('Plans fetched successfully. Count:', plans.items?.length);
    console.log('Plans List:');
    plans.items?.forEach(p => {
      console.log(`- ID: ${p.id}, Name: ${p.item?.name}, Amount: ${p.item?.amount / 100} ${p.item?.currency}, Interval: ${p.period}`);
    });
  } catch (err) {
    console.error('Error fetching Razorpay Plans:', err.message);
  }
}

checkRazorpay();
