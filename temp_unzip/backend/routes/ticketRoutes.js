/**
 * routes/ticketRoutes.js
 */

'use strict';

const express = require('express');
const router = express.Router();
const ticketRepo = require('../repositories/ticketRepo');

// Get all tickets
router.get('/', async (req, res, next) => {
  try {
    const tickets = await ticketRepo.getAllTickets();
    res.status(200).json(tickets);
  } catch (err) {
    next(err);
  }
});

// Create ticket
router.post('/', async (req, res, next) => {
  try {
    const id = await ticketRepo.createTicket(req.body);
    res.status(201).json({ message: 'Ticket created', id });
  } catch (err) {
    next(err);
  }
});

// Update ticket
router.put('/:id', async (req, res, next) => {
  try {
    await ticketRepo.updateTicket(req.params.id, req.body);
    res.status(200).json({ message: 'Ticket updated' });
  } catch (err) {
    next(err);
  }
});

// Delete ticket
router.delete('/:id', async (req, res, next) => {
  try {
    await ticketRepo.deleteTicket(req.params.id);
    res.status(200).json({ message: 'Ticket deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
