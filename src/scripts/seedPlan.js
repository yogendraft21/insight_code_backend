// scripts/seedPlans.js
const mongoose = require('mongoose');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const CreditPackage = require('../models/CreditPackage');
require('dotenv').config();

async function seedPlans() {
  try {
    await mongoose.connect('mongodb+srv://yogendra:yogendra@cluster0.r2gbftx.mongodb.net/github-pr-reviewer');
    console.log('Connected to MongoDB');

    // Clear existing data
    await SubscriptionPlan.deleteMany({});
    await CreditPackage.deleteMany({});

    // Seed subscription plans
    const plans = [
      {
        name: 'starter',
        displayName: 'Starter',
        stripeProductId: 'prod_SI6iM5D44J97nf', 
        stripePriceId: 'price_1RNWVBSAdrzkIDrsrc2kbMKN', 
        price: 29,
        credits: 100,
        features: [
          '100 review credits per month',
          'Basic AI code reviews',
          '2 repositories',
          'Email support'
        ],
        limits: {
          repositories: 2,
          apiRequests: 1000,
          teamMembers: 1
        },
        recommended: false
      },
      {
        name: 'pro',
        displayName: 'Pro',
        stripeProductId: 'prod_SI6klU0kHgoKoR', 
        stripePriceId: 'price_1RNWWaSAdrzkIDrstjHH89Wa', 
        price: 99,
        credits: 500,
        features: [
          '500 review credits per month',
          'Advanced AI code reviews',
          '10 repositories',
          'Custom AI configuration',
          'Priority support',
          'API access'
        ],
        limits: {
          repositories: 10,
          apiRequests: 10000,
          teamMembers: 5
        },
        recommended: true
      },
      {
        name: 'enterprise',
        displayName: 'Enterprise',
        stripeProductId: 'prod_SI6ksSLShkDRcE', 
        stripePriceId: 'price_1RNWXDSAdrzkIDrsHpX274ij', 
        price: 499,
        credits: 2000,
        features: [
          '2,000 review credits per month',
          'Premium AI models',
          'Unlimited repositories',
          'Full API access',
          'Custom integrations',
          'Dedicated support',
          'SLA guarantee'
        ],
        limits: {
          repositories: -1, 
          apiRequests: -1, 
          teamMembers: -1 
        },
        recommended: false
      }
    ];

    await SubscriptionPlan.insertMany(plans);
    console.log('Subscription plans seeded');

    // Seed credit packages
    const creditPackages = [
      {
        name: 'small',
        displayName: '100 Credits',
        credits: 100,
        price: 49,
        stripePriceId: 'price_1RNWXySAdrzkIDrsAf6lm2Yt', 
        discount: 18,
        description: 'Best for small teams or occasional use',
        popular: false
      },
      {
        name: 'medium',
        displayName: '500 Credits',
        credits: 500,
        price: 199,
        stripePriceId: 'price_1RNWYZSAdrzkIDrs7O4aDI9q',
        discount: 20,
        description: 'Perfect for active development teams',
        popular: true
      },
      {
        name: 'large',
        displayName: '1000 Credits',
        credits: 1000,
        price: 349,
        stripePriceId: 'price_1RNWYzSAdrzkIDrsvYksSImR',
        discount: 22,
        description: 'Best value for larger teams',
        popular: false
      }
    ];

    await CreditPackage.insertMany(creditPackages);
    console.log('Credit packages seeded');

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
}

seedPlans();