require('dotenv').config();
const { google } = require('googleapis');

// Replace this with a valid OAuth 2.0 Access Token generated from Google OAuth Playground
// Ensure the token has the scope: https://www.googleapis.com/auth/business.manage
const ACCESS_TOKEN = process.argv[2] || process.env.TEST_GMB_ACCESS_TOKEN || 'PASTE_YOUR_ACCESS_TOKEN_HERE';

async function checkGmbAccess() {
  console.log('--- Google Business Profile API Access Checker ---');

  if (ACCESS_TOKEN === 'PASTE_YOUR_ACCESS_TOKEN_HERE') {
    console.error('❌ Error: No access token provided.');
    console.log('Usage: node check-gmb-access.js <YOUR_ACCESS_TOKEN>');
    console.log('Or set TEST_GMB_ACCESS_TOKEN in your .env file.');
    process.exit(1);
  }

  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: ACCESS_TOKEN });

    const accountClient = google.mybusinessaccountmanagement({
      version: 'v1',
      auth,
    });

    console.log('Attempting to fetch accounts (Checking mybusinessaccountmanagement API)...');
    
    // Attempt to list accounts that the user has access to
    const response = await accountClient.accounts.list();
    
    console.log('✅ SUCCESS! The API is enabled and you have access.');
    console.log('Found Accounts:');
    
    if (response.data.accounts && response.data.accounts.length > 0) {
      response.data.accounts.forEach(account => {
        console.log(`- ${account.accountName} (Type: ${account.type})`);
      });
    } else {
      console.log('No accounts found for this user, but the API call was successful!');
    }

  } catch (error) {
    console.error('\n❌ FAILED: Could not access the GMB API.');
    
    if (error.response) {
      console.error(`Status Code: ${error.response.status}`);
      console.error(`Error Details:`, JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 403) {
        console.log('\n💡 DIAGNOSIS: 403 Forbidden.');
        console.log('This usually means one of two things:');
        console.log('1. The "Google My Business API" is NOT enabled in your Google Cloud Project.');
        console.log('2. Your Google Cloud Project has not been approved for GMB access by Google yet.');
      }
      if (error.response.status === 401) {
        console.log('\n💡 DIAGNOSIS: 401 Unauthorized.');
        console.log('Your access token is invalid or has expired. Generate a new one.');
      }
    } else {
      console.error(error.message);
    }
  }
}

checkGmbAccess();
