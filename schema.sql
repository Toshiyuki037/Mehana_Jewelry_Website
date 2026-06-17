/*
File: schema.sql
Author: Max Maehara
Last Edited: 2026-05-15

Description:
Database structure for Mehana Jewelry.

Tables:

* products
* product_options
* orders
* order_items
  */

DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS product_options;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;

CREATE TABLE products (
id SERIAL PRIMARY KEY,

name TEXT NOT NULL,
category TEXT NOT NULL,

description TEXT,

image_url TEXT,

active BOOLEAN DEFAULT TRUE,

created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE product_options (
id SERIAL PRIMARY KEY,

product_id INTEGER
REFERENCES products(id)
ON DELETE CASCADE,

option_type TEXT NOT NULL,
option_value TEXT NOT NULL,

price_cents INTEGER NOT NULL,

stock_quantity INTEGER NOT NULL DEFAULT 0,

active BOOLEAN DEFAULT TRUE
);

CREATE TABLE orders (
id SERIAL PRIMARY KEY,

customer_email TEXT,
customer_name TEXT,

shipping_address JSONB,

total_cents INTEGER NOT NULL DEFAULT 0,

payment_status TEXT NOT NULL DEFAULT 'pending',

fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled',

stripe_session_id TEXT UNIQUE,

created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE order_items (
id SERIAL PRIMARY KEY,

order_id INTEGER
REFERENCES orders(id)
ON DELETE CASCADE,

product_id INTEGER
REFERENCES products(id),

product_option_id INTEGER
REFERENCES product_options(id),

quantity INTEGER NOT NULL,

price_cents_at_purchase INTEGER NOT NULL
);


