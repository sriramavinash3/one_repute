require('dotenv').config({ path: '../.env' })
const { getDb } = require('../config/firebase')
const logger = {
  info: (...args) => console.log(...args),
  error: (...args) => console.error(...args),
  warn: (...args) => console.warn(...args)
}

async function migrateTenantsToCustomers() {
  try {
    const db = getDb()
    logger.info('[Migration] Starting tenant to customer migration...')

    // 1. Fetch all tenants
    const tenantsSnap = await db.collection('tenants').get()
    
    if (tenantsSnap.empty) {
      logger.info('[Migration] No tenants found to migrate.')
      return
    }

    let count = 0
    const batch = db.batch()

    tenantsSnap.forEach(doc => {
      const data = doc.data()
      // Create new customer with same ID
      const customerRef = db.collection('customers').doc(doc.id)
      
      // Default new fields from requirements
      batch.set(customerRef, {
        ...data,
        name: data.name || data.businessName || 'Unknown Customer',
        plan: data.plan || 'Trial',
        status: data.status || 'Active',
        accountStatus: data.status || 'Active',
        billingCycle: data.billingCycle || 'Monthly',
        monthlyFee: data.monthlyFee || 0,
        migratedAt: new Date()
      }, { merge: true })

      count++
    })

    // 2. Update outlets referencing tenantId to customerId
    const outletsSnap = await db.collection('outlets').get()
    
    outletsSnap.forEach(doc => {
      const data = doc.data()
      if (data.tenantId) {
        const outletRef = db.collection('outlets').doc(doc.id)
        batch.update(outletRef, {
          customerId: data.tenantId,
        })
      }
    })

    await batch.commit()
    logger.info(`[Migration] Successfully migrated ${count} tenants to customers.`)

    process.exit(0)
  } catch (err) {
    logger.error('[Migration] Failed to migrate tenants', { error: err.message })
    process.exit(1)
  }
}

migrateTenantsToCustomers()
