export const MOCK_CUSTOMERS = [
  {
    id: 'CUST-1001',
    name: 'Burger King Enterprises',
    contactPerson: 'John Smith',
    email: 'john@bke.com',
    phone: '+1 (555) 123-4567',
    accountStatus: 'Active',
    plan: 'Enterprise',
    monthlyFee: 5000,
  },
  {
    id: 'CUST-1002',
    name: 'Taco Bell Franchisees',
    contactPerson: 'Sarah Jenkins',
    email: 'sjenkins@tacobell.com',
    phone: '+1 (555) 987-6543',
    accountStatus: 'Active',
    plan: 'Pro',
    monthlyFee: 2500,
  },
  {
    id: 'CUST-1003',
    name: 'Local Coffee Roasters',
    contactPerson: 'Mike Davis',
    email: 'mike@localcoffee.com',
    phone: '+1 (555) 456-7890',
    accountStatus: 'Inactive',
    plan: 'Trial',
    monthlyFee: 0,
  }
];

export const MOCK_OUTLETS = [
  {
    id: 'OUT-2001',
    customerId: 'CUST-1001',
    name: 'Burger King - Downtown',
    address: '123 Main St, NY',
    avgRating: 4.2,
    reviewCount: 1250,
    reviewsThisMonth: 120,
    pendingResponses: 5,
    negativeReviews: 12,
    reputationHealthScore: 85,
    automationEnabled: true,
    automationStatus: 'active',
    isActive: true,
    lastReviewFetchAt: { seconds: Date.now() / 1000 - 3600 },
  },
  {
    id: 'OUT-2002',
    customerId: 'CUST-1001',
    name: 'Burger King - Airport',
    address: 'Terminal 4, JFK',
    avgRating: 3.8,
    reviewCount: 3420,
    reviewsThisMonth: 210,
    pendingResponses: 45,
    negativeReviews: 80,
    reputationHealthScore: 62,
    automationEnabled: false,
    automationStatus: 'inactive',
    isActive: true,
    lastReviewFetchAt: { seconds: Date.now() / 1000 - 86400 * 2 },
  },
  {
    id: 'OUT-2003',
    customerId: 'CUST-1003',
    name: 'Local Coffee - Suburbs',
    address: '456 Oak Ave, NJ',
    avgRating: 4.5,
    reviewCount: 0,
    reviewsThisMonth: 0,
    pendingResponses: 0,
    negativeReviews: 0,
    reputationHealthScore: 92,
    automationEnabled: true,
    automationStatus: 'active',
    isActive: true,
    lastReviewFetchAt: { seconds: Date.now() / 1000 - 86400 * 15 },
  }
];

const generateMockReviews = (count) => {
  const reviews = [];
  const now = Date.now() / 1000;
  const dayInSeconds = 86400;
  
  const samples = [
    { text: 'Amazing service and hot food!', category: 'Food Quality' },
    { text: 'Waited 45 minutes for a simple order. Horrible experience.', category: 'Service Speed' },
    { text: 'Decent place, but could be cleaner.', category: 'Hygiene' },
    { text: 'Best coffee in town! Highly recommend.', category: 'Food Quality' },
    { text: 'Rude staff. Never coming back.', category: 'Staff Behavior' },
    { text: 'Standard fast food, no complaints.', category: 'General' },
    { text: 'Always consistent and quick.', category: 'Service Speed' },
    { text: 'The drive-thru line was insane.', category: 'Service Speed' },
    { text: 'Very friendly manager, helped us a lot.', category: 'Staff Behavior' },
    { text: 'Food was cold and stale.', category: 'Food Quality' },
    { text: 'Way too expensive for what you get.', category: 'Pricing' },
    { text: 'Lovely atmosphere and great music.', category: 'Ambience' }
  ];
  
  for (let i = 0; i < count; i++) {
    // Generate an upward trend by weighting recent reviews slightly more
    const isPositive = Math.random() > 0.3; // 70% positive
    const rating = isPositive ? (Math.random() > 0.4 ? 5 : 4) : (Math.random() > 0.5 ? 2 : 1);
    const sentiment = rating >= 4 ? 'Positive' : (rating <= 2 ? 'Negative' : 'Neutral');
    
    let status = 'responded';
    if (rating <= 2 && Math.random() > 0.3) status = 'escalated'; // 70% of negative escalate
    if (Math.random() > 0.8) status = 'suggested';
    
    // Spread evenly across last 30 days, slightly more grouped in recent days to show "growth"
    const randomWeight = Math.random();
    const daysAgo = Math.floor(Math.pow(randomWeight, 2) * 30);
    
    const sample = samples[i % samples.length];
    
    reviews.push({
      id: `REV-3000${i}`,
      outletId: i % 2 === 0 ? 'OUT-2001' : (i % 3 === 0 ? 'OUT-2002' : 'OUT-2003'),
      rating,
      text: sample.text,
      authorName: `User_${i}`,
      status,
      aiResponse: status === 'responded' ? 'Thank you for your review!' : '',
      createdAt: { seconds: now - (daysAgo * dayInSeconds) - (Math.random() * 3600) },
      sentiment,
      emotion: rating >= 4 ? 'Joy' : (rating <= 2 ? (sample.category === 'Staff Behavior' ? 'Anger' : 'Disappointment') : 'Neutral'),
      issueCategory: sample.category
    });
  }
  
  return reviews;
};

export const MOCK_REVIEWS = generateMockReviews(75);

export const MOCK_REPUTATION_INSIGHTS = {
  alerts: [
    { id: 'AL-1', type: 'spike', title: 'Service delay increasing', description: 'Mentions of slow service increased 45% this week across Burger King outlets.', severity: 'high' },
    { id: 'AL-2', type: 'pattern', title: 'Pricing complaints rising', description: 'Customers are repeatedly mentioning "expensive" for combo meals.', severity: 'medium' }
  ],
  adminCategories: [
    { id: 'CAT-1', name: 'Service Speed', mentions: 142, trend: '+15%', status: 'Active' },
    { id: 'CAT-2', name: 'Staff Behavior', mentions: 89, trend: '-5%', status: 'Active' },
    { id: 'CAT-3', name: 'Hygiene', mentions: 45, trend: '+2%', status: 'Operational Risk' },
    { id: 'CAT-4', name: 'Food Quality', mentions: 210, trend: '+8%', status: 'Active' },
    { id: 'CAT-5', name: 'Pricing', mentions: 76, trend: '+22%', status: 'Important' }
  ],
  outletRisks: [
    { outletId: 'OUT-2002', name: 'Burger King - Airport', riskScore: 88, primaryIssue: 'Service Speed' },
    { outletId: 'OUT-2001', name: 'Burger King - Downtown', riskScore: 45, primaryIssue: 'Pricing' }
  ],
  customerRisks: [
    { customerId: 'CUST-1001', name: 'Burger King Enterprises', riskScore: 72, churnProbability: 'Medium' }
  ],
  improvedOutlets: [
    { outletId: 'OUT-2003', name: 'Local Coffee - Suburbs', improvement: '+1.2★', period: '30 days' }
  ],
  decliningOutlets: [
    { outletId: 'OUT-2002', name: 'Burger King - Airport', improvement: '-0.8★', period: '30 days' }
  ]
};

export const MOCK_USAGE_INSIGHTS = {
  global: {
    aiResponsesGenerated: 41250,
    aiCostEstimate: 412.50, // $0.01 per response
    whatsappAlertsSent: 3400,
    whatsappCostEstimate: 170.00, // $0.05 per alert
    failedAiResponses: 15,
    failedWhatsappAlerts: 8,
    reviewSyncFailures: 42,
    automationSuccessRate: 99.8
  },
  highUsageCustomers: [
    { customerId: 'CUST-1001', name: 'Burger King Enterprises', aiResponses: 25000, cost: 250.00, status: 'Healthy' },
    { customerId: 'CUST-1002', name: 'Taco Bell Franchisees', aiResponses: 12000, cost: 120.00, status: 'Healthy' }
  ],
  lowUsageCustomers: [
    { customerId: 'CUST-1003', name: 'Local Coffee Roasters', aiResponses: 0, cost: 0.00, status: 'Dormant' }
  ],
  marginRiskAccounts: [
    { customerId: 'CUST-1004', name: 'Mega Bites Diner', aiResponses: 8500, cost: 85.00, monthlyFee: 49.00, margin: '-73%' }
  ],
  adminAccounts: [
    { id: 'ACC-1', customerName: 'Burger King Enterprises', outletName: 'Burger King - Downtown', aiCost: 85.00, limit: 100, status: 'Active', health: '99.9%' },
    { id: 'ACC-2', customerName: 'Burger King Enterprises', outletName: 'Burger King - Airport', aiCost: 165.00, limit: 150, status: 'Paused', health: '82.0%' },
    { id: 'ACC-3', customerName: 'Local Coffee Roasters', outletName: 'Local Coffee - Suburbs', aiCost: 0.00, limit: 20, status: 'Active', health: '100%' },
    { id: 'ACC-4', customerName: 'Mega Bites Diner', outletName: 'Mega Bites - Central', aiCost: 85.00, limit: 50, status: 'Active', health: '95.5%' }
  ]
};

export const MOCK_ESCALATIONS = [
  {
    id: 'ESC-4001',
    reviewId: 'REV-3002',
    outletId: 'OUT-2002',
    customerName: 'Burger King Enterprises',
    outletName: 'Burger King - Airport',
    rating: 1,
    text: 'Waited 45 minutes for a simple order. Horrible experience.',
    status: 'Open',
    issueCategory: 'Service Speed',
    aiSuggestion: 'Apologize for the extreme delay and offer a complimentary meal voucher.',
    whatsappSent: true,
    managerContacted: '+15550001111',
    escalation1Date: { seconds: Date.now() / 1000 - 80000 },
    respondedBefore1: false
  }
];

export const MOCK_TICKETS = [
  {
    id: 'TKT-5001',
    outletId: 'OUT-2001',
    customerId: 'CUST-1001',
    subject: 'Google API Sync Issue',
    description: 'Reviews are not syncing since yesterday.',
    status: 'Open',
    priority: 'High',
    createdAt: { seconds: Date.now() / 1000 - 3600 }
  },
  {
    id: 'TKT-5002',
    outletId: 'OUT-2003',
    customerId: 'CUST-1002',
    subject: 'Need help setting up automation',
    description: 'How do I turn on full auto responses?',
    status: 'Resolved',
    priority: 'Low',
    createdAt: { seconds: Date.now() / 1000 - 86400 * 3 }
  }
];

export const MOCK_DISCOUNTS = [
  {
    id: 'DISC-6001',
    code: 'WELCOME20',
    type: 'percentage',
    value: 20,
    status: 'Active',
    usageLimit: 100,
    timesUsed: 45,
    createdAt: { seconds: Date.now() / 1000 - 86400 * 30 }
  }
];

export const MOCK_REPORTS = [
  {
    id: 'REP-7001',
    customerId: 'CUST-1001',
    customerName: 'Burger King Enterprises',
    period: 'monthly',
    startDate: { seconds: Date.now() / 1000 - 86400 * 30 },
    endDate: { seconds: Date.now() / 1000 },
    status: 'Generated',
    url: 'https://example.com/mock-report.pdf',
    createdAt: { seconds: Date.now() / 1000 }
  }
];

export const MOCK_SYSTEM_LOGS = [
  {
    id: 'LOG-8001',
    level: 'error',
    message: 'Failed to connect to Google API',
    service: 'SyncWorker',
    timestamp: { seconds: Date.now() / 1000 - 120 }
  },
  {
    id: 'LOG-8002',
    level: 'info',
    message: 'Successfully generated 12 weekly reports',
    service: 'ReportCron',
    timestamp: { seconds: Date.now() / 1000 - 3600 }
  }
];

// Reusable mock stats for Dashboards/Analytics
export const MOCK_DASHBOARD_STATS = {
  totalOutlets: 145,
  activeOutlets: 120,
  trialOutlets: 15,
  paidOutlets: 130,
  churnRiskOutlets: 8,
  churnedOutlets: 2,
  totalReviews: 45210,
  aiResponsesGenerated: 41000,
  escalationsTriggered: 152,
  monthlyRevenue: 12500,
  estimatedBurn: 850,
  creditsAvailable: 50000,
  openTickets: 12
};
