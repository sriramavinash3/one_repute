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
