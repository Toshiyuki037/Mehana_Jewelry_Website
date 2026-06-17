/*
  File: db.js
  Author: Max Maehara
  Last Edited: 2026-05-05

  Description:
  Creates the PostgreSQL database connection pool.

  How it works:
  - Reads DATABASE_URL from .env
  - Creates a reusable database pool
  - Exports the pool so server.js can query the database
*/

const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

module.exports = pool;