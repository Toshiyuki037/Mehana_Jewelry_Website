/*
  File: server.js
  Author: Max Maehara
  Last Edited: 2026-05-05

  Description:
  Express backend for Mehana Jewelry. Handles products, product options,
  Stripe checkout, Stripe webhooks, admin login, orders, and inventory.
*/

require("dotenv").config();

const express = require("express");
const session = require("express-session");
const cors = require("cors");
const Stripe = require("stripe");
const pool = require("./db");

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.static("public"));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "temporary_dev_secret",
    resave: false,
    saveUninitialized: false
  })
);

/*
  Stripe webhook must come before express.json().
*/
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const checkoutSession = event.data.object;
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const orderResult = await client.query(
          `
          UPDATE orders
          SET 
            payment_status = 'paid',
            customer_email = $1,
            customer_name = $2,
            shipping_address = $3
          WHERE stripe_session_id = $4
          RETURNING id
          `,
          [
            checkoutSession.customer_details?.email || null,
            checkoutSession.customer_details?.name || null,
            checkoutSession.customer_details?.address || null,
            checkoutSession.id
          ]
        );

        const order = orderResult.rows[0];

        if (order) {
          const itemsResult = await client.query(
            `
            SELECT product_option_id, quantity
            FROM order_items
            WHERE order_id = $1
            `,
            [order.id]
          );

          for (const item of itemsResult.rows) {
            await client.query(
              `
              UPDATE product_options
              SET stock_quantity = GREATEST(0, stock_quantity - $1)
              WHERE id = $2
              `,
              [item.quantity, item.product_option_id]
            );
          }
        }

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("Webhook database error:", err);
        return res.status(500).send("Webhook database error");
      } finally {
        client.release();
      }
    }

    res.json({ received: true });
  }
);

app.use(express.json());

function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

/*
  Customer product route.
  Returns base products plus their purchasable options.
*/
app.get("/api/products", async (req, res) => {
  const { category } = req.query;

  try {
    const result = await pool.query(
      `
      SELECT 
        p.id,
        p.name,
        p.category,
        p.description,
        p.image_url,
        p.active,

        (
          SELECT MIN(po.price_cents)
          FROM product_options po
          WHERE po.product_id = p.id
            AND po.active = true
            AND po.stock_quantity > 0
        ) AS starting_price_cents,

        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'id', po.id,
                'option_type', po.option_type,
                'option_value', po.option_value,
                'price_cents', po.price_cents,
                'stock_quantity', po.stock_quantity,
                'active', po.active
              )
              ORDER BY po.id ASC
            ),
            '[]'
          )
          FROM product_options po
          WHERE po.product_id = p.id
            AND po.active = true
            AND po.stock_quantity > 0
        ) AS options

      FROM products p
      WHERE p.active = true
        AND p.category = $1
        AND EXISTS (
          SELECT 1
          FROM product_options po
          WHERE po.product_id = p.id
            AND po.active = true
            AND po.stock_quantity > 0
        )
      ORDER BY p.id ASC
      `,
      [category]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Product fetch error:", err);
    res.status(500).json({ error: "Failed to load products" });
  }
});
/*
  Checkout route.
  Frontend sends productOptionId + quantity.
  Backend looks up real product, option, price, and stock.
*/
app.post("/api/create-checkout-session", async (req, res) => {
  const { cart } = req.body;

  if (!Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let totalCents = 0;
    const orderItems = [];
    const lineItems = [];

    for (const item of cart) {
      const productOptionId = Number(item.productOptionId);
      const quantity = Number(item.quantity);

      if (!productOptionId || !quantity || quantity < 1) {
        throw new Error("Invalid cart item");
      }

      const optionResult = await client.query(
        `
        SELECT
          po.id AS product_option_id,
          po.product_id,
          po.option_value,
          po.price_cents,
          po.stock_quantity,
          p.name AS product_name
        FROM product_options po
        JOIN products p ON p.id = po.product_id
        WHERE po.id = $1
          AND po.active = true
          AND p.active = true
        `,
        [productOptionId]
      );

      const option = optionResult.rows[0];

      if (!option) {
        throw new Error("Product option not found");
      }

      if (option.stock_quantity < quantity) {
        throw new Error(`${option.product_name} option is out of stock`);
      }

      totalCents += option.price_cents * quantity;

      orderItems.push({
        productId: option.product_id,
        productOptionId: option.product_option_id,
        quantity,
        priceCents: option.price_cents
      });

      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: `${option.product_name} - ${option.option_value}`
          },
          unit_amount: option.price_cents
        },
        quantity
      });
    }

    const orderResult = await client.query(
      `
      INSERT INTO orders (total_cents, payment_status, fulfillment_status)
      VALUES ($1, 'pending', 'unfulfilled')
      RETURNING id
      `,
      [totalCents]
    );

    const order = orderResult.rows[0];

    for (const item of orderItems) {
      await client.query(
        `
        INSERT INTO order_items
        (order_id, product_id, product_option_id, quantity, price_cents_at_purchase)
        VALUES ($1, $2, $3, $4, $5)
        `,
        [
          order.id,
          item.productId,
          item.productOptionId,
          item.quantity,
          item.priceCents
        ]
      );
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      client_reference_id: String(order.id),
      shipping_address_collection: {
        allowed_countries: ["US"]
      },
      success_url: `${process.env.CLIENT_URL}/success.html`,
      cancel_url: `${process.env.CLIENT_URL}/`,
      metadata: {
        order_id: String(order.id)
      }
    });

    await client.query(
      `
      UPDATE orders
      SET stripe_session_id = $1
      WHERE id = $2
      `,
      [checkoutSession.id, order.id]
    );

    await client.query("COMMIT");

    res.json({ url: checkoutSession.url });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Checkout error:", err);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body;

  if (
    email === process.env.ADMIN_EMAIL &&
    password === process.env.ADMIN_PASSWORD
  ) {
    req.session.admin = true;
    return res.json({ success: true });
  }

  res.status(401).json({ error: "Invalid login" });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT 
        o.id,
        o.customer_email,
        o.customer_name,
        o.shipping_address,
        o.total_cents,
        o.payment_status,
        o.fulfillment_status,
        o.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', po.id,
              'option_type', po.option_type,
              'option_value', po.option_value,
              'price_cents', po.price_cents,
              'stock_quantity', po.stock_quantity,
              'active', po.active
            )
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'
        ) AS items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      LEFT JOIN product_options po ON po.id = oi.product_option_id
      WHERE o.payment_status = 'paid'
        AND o.fulfillment_status = 'unfulfilled'
      GROUP BY o.id
      ORDER BY o.created_at DESC
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Admin orders error:", err);
    res.status(500).json({ error: "Failed to load orders" });
  }
});

app.patch("/api/admin/orders/:id/fulfill", requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
      UPDATE orders
      SET fulfillment_status = 'fulfilled'
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Fulfill order error:", err);
    res.status(500).json({ error: "Failed to fulfill order" });
  }
});

/*
  Admin product route.
  Returns products and all options, including inactive/out-of-stock.
*/
app.get("/api/admin/products", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT 
        p.id,
        p.name,
        p.category,
        p.description,
        p.image_url,
        p.active,
        p.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', po.id,
              'option_type', po.option_type,
              'option_value', po.option_value,
              'price_cents', po.price_cents,
              'stock_quantity', po.stock_quantity,
              'active', po.active
            )
            ORDER BY po.id ASC
          ) FILTER (WHERE po.id IS NOT NULL),
          '[]'
        ) AS options
      FROM products p
      LEFT JOIN product_options po ON po.product_id = p.id
      GROUP BY p.id
      ORDER BY p.id ASC
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Admin products error:", err);
    res.status(500).json({ error: "Failed to load products" });
  }
});

app.patch("/api/admin/products/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, category, description, image_url, active } = req.body;

  try {
    const result = await pool.query(
      `
      UPDATE products
      SET
        name = $1,
        category = $2,
        description = $3,
        image_url = $4,
        active = $5
      WHERE id = $6
      RETURNING *
      `,
      [name, category, description, image_url, Boolean(active), id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Product update error:", err);
    res.status(500).json({ error: "Failed to update product" });
  }
});

app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      `
      UPDATE products
      SET active = false
      WHERE id = $1
      `,
      [id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Product delete error:", err);
    res.status(500).json({ error: "Failed to remove product" });
  }
});

app.post("/api/admin/products", requireAdmin, async (req, res) => {
  const { name, category, description, image_url, active } = req.body;

  try {
    const result = await pool.query(
      `
      INSERT INTO products
      (name, category, description, image_url, active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [name, category, description, image_url, Boolean(active)]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Product create error:", err);
    res.status(500).json({ error: "Failed to create product" });
  }
});

app.post("/api/admin/product-options", requireAdmin, async (req, res) => {
  const {
    product_id,
    option_type,
    option_value,
    price_cents,
    stock_quantity,
    active
  } = req.body;

  try {
    const result = await pool.query(
      `
      INSERT INTO product_options
      (product_id, option_type, option_value, price_cents, stock_quantity, active)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        Number(product_id),
        option_type,
        option_value,
        Number(price_cents),
        Number(stock_quantity),
        Boolean(active)
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Option create error:", err);
    res.status(500).json({ error: "Failed to create product option" });
  }
});

app.patch("/api/admin/product-options/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    option_type,
    option_value,
    price_cents,
    stock_quantity,
    active
  } = req.body;

  try {
    const result = await pool.query(
      `
      UPDATE product_options
      SET
        option_type = $1,
        option_value = $2,
        price_cents = $3,
        stock_quantity = $4,
        active = $5
      WHERE id = $6
      RETURNING *
      `,
      [
        option_type,
        option_value,
        Number(price_cents),
        Number(stock_quantity),
        Boolean(active),
        id
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Option update error:", err);
    res.status(500).json({ error: "Failed to update product option" });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});