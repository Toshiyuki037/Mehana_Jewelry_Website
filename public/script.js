/*
  File: script.js
  Author: Max Maehara
  Last Edited: 2026-06-14

  Description:
  Storefront logic for loading products, showing visible option info,
  only using dropdowns when multiple choices exist, cart dropdown,
  quantity controls, and Stripe checkout.
*/

const grid = document.getElementById("product-grid");
const title = document.getElementById("category-title");
const navItems = document.querySelectorAll(".nav-links li");

const checkoutBtn = document.getElementById("checkout-btn");
const cartToggle = document.getElementById("cart-toggle");
const cartDropdown = document.getElementById("cart-dropdown");
const cartItems = document.getElementById("cart-items");

let cart = JSON.parse(localStorage.getItem("cart")) || [];

function saveCart() {
  localStorage.setItem("cart", JSON.stringify(cart));
  updateCartButton();
  renderCartDropdown();
}

function updateCartButton() {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartCount = document.getElementById("cart-count");

  if (cartCount) {
    cartCount.textContent = count;
  }
}

function formatMoney(cents) {
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

function formatTitle(category) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

async function loadProducts(category) {
  title.textContent = formatTitle(category);

  const response = await fetch(`/api/products?category=${category}`);
  const products = await response.json();

  grid.innerHTML = "";

  products.forEach(product => {
    const optionType =
      product.options && product.options.length > 0
        ? product.options[0].option_type
        : "Option";

    const optionsHtml = product.options
      .map(option => {
        return `
          <option
            value="${option.id}"
            data-product-name="${product.name}"
            data-option-value="${option.option_value}"
            data-price-cents="${option.price_cents}"
          >
            ${option.option_value} — ${formatMoney(option.price_cents)}
          </option>
        `;
      })
      .join("");

    const optionInputHtml =
      product.options.length > 1
        ? `
          <label class="option-label">${optionType}</label>

          <select class="option-select" id="option-${product.id}">
            ${optionsHtml}
          </select>
        `
        : `
          <p class="single-option">
            ${optionType}: ${product.options[0].option_value}
          </p>

          <input
            type="hidden"
            id="option-${product.id}"
            value="${product.options[0].id}"
            data-product-name="${product.name}"
            data-option-value="${product.options[0].option_value}"
            data-price-cents="${product.options[0].price_cents}"
          >
        `;

    grid.innerHTML += `
      <div class="product-card">
        <div class="image-box">
          <img src="${product.image_url}" alt="${product.name}">
        </div>

        <p class="tag">New</p>
        <h2>${product.name}</h2>
        <p class="price">From ${formatMoney(product.starting_price_cents)}</p>
        <p class="description">${product.description || ""}</p>

        ${optionInputHtml}

        <button class="add-btn" data-product-id="${product.id}">
          Add to Cart
        </button>
      </div>
    `;
  });

  document.querySelectorAll(".add-btn").forEach(button => {
    button.addEventListener("click", () => {
      const productId = button.dataset.productId;
      const input = document.getElementById(`option-${productId}`);

      if (!input || !input.value) {
        alert("Please select an option.");
        return;
      }

      let productName;
      let optionValue;
      let priceCents;

      if (input.tagName === "SELECT") {
        const selectedOption = input.options[input.selectedIndex];

        productName = selectedOption.dataset.productName;
        optionValue = selectedOption.dataset.optionValue;
        priceCents = Number(selectedOption.dataset.priceCents);
      } else {
        productName = input.dataset.productName;
        optionValue = input.dataset.optionValue;
        priceCents = Number(input.dataset.priceCents);
      }

      addToCart({
        productOptionId: Number(input.value),
        productName,
        optionValue,
        priceCents
      });
    });
  });

  navItems.forEach(item => {
    item.classList.toggle("active", item.dataset.category === category);
  });
}

function addToCart(newItem) {
  const existing = cart.find(
    item => item.productOptionId === newItem.productOptionId
  );

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      productOptionId: newItem.productOptionId,
      productName: newItem.productName,
      optionValue: newItem.optionValue,
      priceCents: newItem.priceCents,
      quantity: 1
    });
  }

  saveCart();

  if (cartDropdown) {
    cartDropdown.classList.add("show");
  }
}

function changeCartQuantity(productOptionId, amount) {
  const item = cart.find(item => item.productOptionId === productOptionId);

  if (!item) return;

  item.quantity += amount;

  if (item.quantity <= 0) {
    cart = cart.filter(item => item.productOptionId !== productOptionId);
  }

  saveCart();
}

function removeFromCart(productOptionId) {
  cart = cart.filter(item => item.productOptionId !== productOptionId);
  saveCart();
}

function renderCartDropdown() {
  if (!cartItems) return;

  if (cart.length === 0) {
    cartItems.innerHTML = `<p class="empty-cart">Your cart is empty.</p>`;
    return;
  }

  const subtotal = cart.reduce((sum, item) => {
    return sum + item.priceCents * item.quantity;
  }, 0);

  cartItems.innerHTML = `
    ${cart
      .map(item => {
        return `
          <div class="cart-item">
            <div class="cart-item-info">
              <p>${item.productName}</p>
              <span>${item.optionValue}</span>
              <span>${formatMoney(item.priceCents)} × ${item.quantity}</span>
            </div>

            <div class="cart-controls">
              <button onclick="changeCartQuantity(${item.productOptionId}, -1)">−</button>
              <button onclick="changeCartQuantity(${item.productOptionId}, 1)">+</button>
              <button onclick="removeFromCart(${item.productOptionId})">Remove</button>
            </div>
          </div>
        `;
      })
      .join("")}

    <div class="cart-subtotal">
      <span>Subtotal</span>
      <strong>${formatMoney(subtotal)}</strong>
    </div>
  `;
}

if (cartToggle && cartDropdown) {
  cartToggle.addEventListener("click", event => {
    event.stopPropagation();
    cartDropdown.classList.toggle("show");
    renderCartDropdown();
  });
}

document.addEventListener("click", event => {
  if (
    cartDropdown &&
    cartToggle &&
    !cartDropdown.contains(event.target) &&
    !cartToggle.contains(event.target)
  ) {
    cartDropdown.classList.remove("show");
  }
});

if (cartDropdown) {
  cartDropdown.addEventListener("click", event => {
    event.stopPropagation();
  });
}

checkoutBtn.addEventListener("click", async () => {
  if (cart.length === 0) {
    alert("Your cart is empty.");
    return;
  }

  const checkoutCart = cart.map(item => ({
    productOptionId: item.productOptionId,
    quantity: item.quantity
  }));

  const response = await fetch("/api/create-checkout-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ cart: checkoutCart })
  });

  const data = await response.json();

  if (data.url) {
    localStorage.removeItem("cart");
    cart = [];
    updateCartButton();
    renderCartDropdown();
    window.location.href = data.url;
  } else {
    alert(data.error || "Checkout failed.");
  }
});

navItems.forEach(item => {
  item.addEventListener("click", () => {
    loadProducts(item.dataset.category);
  });
});

updateCartButton();
renderCartDropdown();
loadProducts("necklaces");