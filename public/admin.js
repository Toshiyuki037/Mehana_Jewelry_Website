/*
  File: admin.js
  Author: Max Maehara
  Last Edited: 2026-06-15

  Description:
  Admin dashboard logic for login, viewing paid orders,
  editing products, adding/removing products, editing options,
  and increasing/decreasing stock.
*/

const loginBtn = document.getElementById("login-btn");
const ordersBox = document.getElementById("orders");
const productsBox = document.getElementById("products");
const loginBox = document.getElementById("login-box");
const adminContent = document.getElementById("admin-content");
const addProductBtn = document.getElementById("add-product-btn");

function formatMoney(cents) {
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

loginBtn.addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  if (response.ok) {
    loginBox.style.display = "none";
    adminContent.style.display = "block";
    await loadOrders();
    await loadProducts();
  } else {
    alert("Invalid login.");
  }
});

async function loadOrders() {
  const response = await fetch("/api/admin/orders");

  if (!response.ok) {
    ordersBox.innerHTML = "<p>Could not load orders.</p>";
    return;
  }

  const orders = await response.json();
  ordersBox.innerHTML = "";

  if (orders.length === 0) {
    ordersBox.innerHTML = "<p>No paid orders yet.</p>";
    return;
  }

  orders.forEach(order => {
    const items = order.items
      .map(item => `
        <li>
          ${item.option_value} x${item.quantity}
          — ${formatMoney(item.price_cents)}
        </li>
      `)
      .join("");

    ordersBox.innerHTML += `
      <div class="order-card">
        <h3>Order #${order.id}</h3>
        <p><strong>Status:</strong> ${order.payment_status} / ${order.fulfillment_status}</p>
        <p><strong>Customer:</strong> ${order.customer_name || "N/A"}</p>
        <p><strong>Email:</strong> ${order.customer_email || "N/A"}</p>
        <p><strong>Total:</strong> ${formatMoney(order.total_cents)}</p>

        <h4>Items</h4>
        <ul>${items}</ul>

        <h4>Shipping</h4>
        <pre>${JSON.stringify(order.shipping_address, null, 2)}</pre>

        ${
          order.fulfillment_status === "unfulfilled"
            ? `<button class="admin-btn fulfill-btn" data-id="${order.id}">Mark Fulfilled</button>`
            : `<p><strong>Fulfilled</strong></p>`
        }
      </div>
    `;
  });

  document.querySelectorAll(".fulfill-btn").forEach(button => {
    button.addEventListener("click", async () => {
      await fetch(`/api/admin/orders/${button.dataset.id}/fulfill`, {
        method: "PATCH"
      });

      await loadOrders();
    });
  });
}

async function loadProducts() {
  const response = await fetch("/api/admin/products");

  if (!response.ok) {
    productsBox.innerHTML = "<p>Could not load products. Check admin login/server.</p>";
    return;
  }

  const products = await response.json();
  productsBox.innerHTML = "";

  if (products.length === 0) {
    productsBox.innerHTML = "<p>No products found. Run seed.sql or add a product below.</p>";
    return;
  }

  products.forEach(product => {
    const optionsHtml = product.options
      .map(option => {
        const stockStatus =
          option.stock_quantity <= 0
            ? `<span class="stock-status out">Out of stock</span>`
            : `<span class="stock-status in">In stock</span>`;

        return `
          <div class="option-editor-card">
            <h4>${option.option_type}</h4>

            <label>Option Type</label>
            <input id="option-type-${option.id}" value="${option.option_type || "Option"}" />

            <label>Option Value</label>
            <input id="option-value-${option.id}" value="${option.option_value}" />

            <label>Price in cents</label>
            <input id="option-price-${option.id}" type="number" value="${option.price_cents}" />

            <label>Stock Quantity</label>

            <div class="stock-row">
              <button class="stock-btn stock-minus" data-id="${option.id}">−</button>
              <span id="stock-display-${option.id}">${option.stock_quantity}</span>
              <button class="stock-btn stock-plus" data-id="${option.id}">+</button>
              ${stockStatus}
            </div>

            <input id="option-stock-${option.id}" type="hidden" value="${option.stock_quantity}" />

            <label class="checkbox-row">
              <input id="option-active-${option.id}" type="checkbox" ${option.active ? "checked" : ""} />
              Active
            </label>

            <button class="admin-btn update-option-btn" data-id="${option.id}">
              Save Option
            </button>
          </div>
        `;
      })
      .join("");

    productsBox.innerHTML += `
      <div class="product-editor-card">
        <h3>Product #${product.id}</h3>

        <label>Name</label>
        <input id="product-name-${product.id}" value="${product.name}" />

        <label>Category</label>
        <input id="product-category-${product.id}" value="${product.category}" />

        <label>Description</label>
        <textarea id="product-description-${product.id}">${product.description || ""}</textarea>

        <label>Image URL</label>
        <input id="product-image-${product.id}" value="${product.image_url || ""}" />

        <label class="checkbox-row">
          <input id="product-active-${product.id}" type="checkbox" ${product.active ? "checked" : ""} />
          Active / visible on store
        </label>

        <button class="admin-btn update-product-btn" data-id="${product.id}">
          Save Product
        </button>

        <button class="admin-btn remove-product-btn" data-id="${product.id}">
          Remove Product
        </button>

        <h4>Add Option</h4>

        <input id="new-option-type-${product.id}" placeholder="Option type, ex: Chain, Size, Color" />
        <input id="new-option-value-${product.id}" placeholder="Example: 14k Figaro Chain" />
        <input id="new-option-price-${product.id}" type="number" placeholder="Price in cents, ex: 9400" />
        <input id="new-option-stock-${product.id}" type="number" placeholder="Stock quantity" />

        <button class="admin-btn add-option-btn" data-product-id="${product.id}">
          Add Option
        </button>

        <h4>Existing Options</h4>
        ${optionsHtml || "<p>No options yet.</p>"}
      </div>
    `;
  });

  attachProductEvents();
  attachOptionEvents();
}

function attachProductEvents() {
  document.querySelectorAll(".update-product-btn").forEach(button => {
    button.addEventListener("click", async () => {
      const id = button.dataset.id;

      const updatedProduct = {
        name: document.getElementById(`product-name-${id}`).value,
        category: document.getElementById(`product-category-${id}`).value,
        description: document.getElementById(`product-description-${id}`).value,
        image_url: document.getElementById(`product-image-${id}`).value,
        active: document.getElementById(`product-active-${id}`).checked
      };

      const response = await fetch(`/api/admin/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedProduct)
      });

      if (response.ok) {
        alert("Product updated.");
        await loadProducts();
      } else {
        alert("Failed to update product.");
      }
    });
  });

  document.querySelectorAll(".remove-product-btn").forEach(button => {
    button.addEventListener("click", async () => {
      const id = button.dataset.id;

      const confirmRemove = confirm("Remove this product from the store?");
      if (!confirmRemove) return;

      const response = await fetch(`/api/admin/products/${id}`, {
        method: "DELETE"
      });

      if (response.ok) {
        alert("Product removed.");
        await loadProducts();
      } else {
        alert("Failed to remove product.");
      }
    });
  });

  document.querySelectorAll(".add-option-btn").forEach(button => {
    button.addEventListener("click", async () => {
      const productId = button.dataset.productId;

      const newOption = {
        product_id: Number(productId),
        option_type: document.getElementById(`new-option-type-${productId}`).value || "Option",
        option_value: document.getElementById(`new-option-value-${productId}`).value,
        price_cents: Number(document.getElementById(`new-option-price-${productId}`).value),
        stock_quantity: Number(document.getElementById(`new-option-stock-${productId}`).value),
        active: true
      };

      if (!newOption.option_value || !newOption.price_cents || newOption.stock_quantity < 0) {
        alert("Fill option value, price, and stock.");
        return;
      }

      const response = await fetch("/api/admin/product-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newOption)
      });

      if (response.ok) {
        alert("Option added.");
        await loadProducts();
      } else {
        alert("Failed to add option.");
      }
    });
  });
}

function attachOptionEvents() {
  document.querySelectorAll(".update-option-btn").forEach(button => {
    button.addEventListener("click", async () => {
      const id = button.dataset.id;

      const updatedOption = {
        option_type: document.getElementById(`option-type-${id}`).value || "Option",
        option_value: document.getElementById(`option-value-${id}`).value,
        price_cents: Number(document.getElementById(`option-price-${id}`).value),
        stock_quantity: Number(document.getElementById(`option-stock-${id}`).value),
        active: document.getElementById(`option-active-${id}`).checked
      };

      const response = await fetch(`/api/admin/product-options/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedOption)
      });

      if (response.ok) {
        alert("Option updated.");
        await loadProducts();
      } else {
        alert("Failed to update option.");
      }
    });
  });

  document.querySelectorAll(".stock-minus").forEach(button => {
    button.addEventListener("click", async () => {
      await changeStock(button.dataset.id, -1);
    });
  });

  document.querySelectorAll(".stock-plus").forEach(button => {
    button.addEventListener("click", async () => {
      await changeStock(button.dataset.id, 1);
    });
  });
}

async function changeStock(optionId, amount) {
  const stockInput = document.getElementById(`option-stock-${optionId}`);
  const stockDisplay = document.getElementById(`stock-display-${optionId}`);

  const currentStock = Number(stockInput.value);
  const newStock = Math.max(0, currentStock + amount);

  stockInput.value = newStock;
  stockDisplay.textContent = newStock;

  const updatedOption = {
    option_type: document.getElementById(`option-type-${optionId}`).value || "Option",
    option_value: document.getElementById(`option-value-${optionId}`).value,
    price_cents: Number(document.getElementById(`option-price-${optionId}`).value),
    stock_quantity: newStock,
    active: document.getElementById(`option-active-${optionId}`).checked
  };

  await fetch(`/api/admin/product-options/${optionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updatedOption)
  });

  await loadProducts();
}

addProductBtn.addEventListener("click", async () => {
  const newProduct = {
    name: document.getElementById("new-name").value,
    category: document.getElementById("new-category").value,
    description: document.getElementById("new-description").value,
    image_url: document.getElementById("new-image").value,
    active: document.getElementById("new-active").checked
  };

  if (!newProduct.name || !newProduct.category) {
    alert("Product name and category are required.");
    return;
  }

  const response = await fetch("/api/admin/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newProduct)
  });

  if (response.ok) {
    alert("Product added.");

    document.getElementById("new-name").value = "";
    document.getElementById("new-category").value = "";
    document.getElementById("new-description").value = "";
    document.getElementById("new-image").value = "";
    document.getElementById("new-active").checked = true;

    await loadProducts();
  } else {
    alert("Failed to add product.");
  }
});