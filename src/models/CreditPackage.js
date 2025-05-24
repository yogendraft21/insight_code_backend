// models/CreditPackage.js
const mongoose = require('mongoose');

const CreditPackageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  displayName: {
    type: String,
    required: true
  },
  credits: {
    type: Number,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  stripePriceId: {
    type: String,
    required: true
  },
  currency: {
    type: String,
    default: 'usd'
  },
  discount: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  description: String,
  isActive: {
    type: Boolean,
    default: true
  },
  popular: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

CreditPackageSchema.virtual('pricePerCredit').get(function() {
  return this.price / this.credits;
});

CreditPackageSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ credits: 1 });
};

CreditPackageSchema.statics.findByStripePriceId = function(priceId) {
  return this.findOne({ stripePriceId: priceId });
};

const CreditPackage = mongoose.model('CreditPackage', CreditPackageSchema);
module.exports = CreditPackage;