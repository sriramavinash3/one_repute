/**
 * routes/customerRoutes.js
 */

'use strict';

const express = require('express');
const router = express.Router();
const customerRepo = require('../repositories/customerRepo');

// Get all customers
router.get('/', async (req, res, next) => {
  try {
    const customers = await customerRepo.getAllCustomers();
    res.status(200).json(customers);
  } catch (err) {
    next(err);
  }
});

// Get customer by ID
router.get('/:id', async (req, res, next) => {
  try {
    const customer = await customerRepo.getCustomerById(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.status(200).json(customer);
  } catch (err) {
    next(err);
  }
});

// Create customer
router.post('/', async (req, res, next) => {
  try {
    const id = await customerRepo.createCustomer(req.body);
    res.status(201).json({ message: 'Customer created', id });
  } catch (err) {
    next(err);
  }
});

// Update customer
router.put('/:id', async (req, res, next) => {
  try {
    await customerRepo.updateCustomer(req.params.id, req.body);
    res.status(200).json({ message: 'Customer updated' });
  } catch (err) {
    next(err);
  }
});

// Delete customer
router.delete('/:id', async (req, res, next) => {
  try {
    await customerRepo.deleteCustomer(req.params.id);
    res.status(200).json({ message: 'Customer deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
