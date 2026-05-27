/**
 * utils/logger.js
 *
 * Structured JSON logger built on winston.
 * All modules import this — no console.log allowed in production code.
 *
 * Log levels: error | warn | info | debug
 */

'use strict';

const { createLogger, format, transports } = require('winston');

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.json(),
    format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message} ${JSON.stringify(meta)}`;
    })
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' }),
  ],
});

module.exports = logger;
