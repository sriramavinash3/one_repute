/**
 * routes/discountRoutes.js
 */

'use strict';

const express = require('express');
const router = express.Router();
const discountRepo = require('../repositories/discountRepo');

// Get all discounts
router.get('/', async (req, res, next) => {
  try {
    const discounts = await discountRepo.getAllDiscounts();
    res.status(200).json(discounts);
  } catch (err) {
    next(err);
  }
});

// Validate a discount code
router.post('/validate', async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code is required' });
    
    const discount = await discountRepo.getDiscountByCode(code.trim().toUpperCase());
    if (!discount) return res.status(404).json({ error: 'Invalid discount code' });
    
    // Check if it's active and not expired
    if (discount.status === 'Inactive') return res.status(400).json({ error: 'Discount code is inactive' });
    
    res.status(200).json({ valid: true, discount });
  } catch (err) {
    next(err);
  }
});

// Create discount
router.post('/', async (req, res, next) => {
  try {
    const id = await discountRepo.createDiscount(req.body);
    res.status(201).json({ message: 'Discount created', id });
  } catch (err) {
    next(err);
  }
});

// Update discount
router.put('/:id', async (req, res, next) => {
  try {
    await discountRepo.updateDiscount(req.params.id, req.body);
    res.status(200).json({ message: 'Discount updated' });
  } catch (err) {
    next(err);
  }
});

// Delete discount
router.delete('/:id', async (req, res, next) => {
  try {
    await discountRepo.deleteDiscount(req.params.id);
    res.status(200).json({ message: 'Discount deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
