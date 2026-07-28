/**
 * routes/ticketRoutes.js
 */

'use strict';

const express = require('express');
const router = express.Router();
const ticketRepo = require('../repositories/ticketRepo');

// Get all tickets (or tickets for specific customer if not admin)
router.get('/', async (req, res, next) => {
  try {
    // Note: req.user is populated by verifyToken middleware in app.js
    let tickets = [];
    if (req.user && req.user.role === 'SUPER_ADMIN') {
      tickets = await ticketRepo.getAllTickets();
    } else if (req.user && req.user.customerId) {
      tickets = await ticketRepo.getTicketsByEntity('customer', req.user.customerId);
    }
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
