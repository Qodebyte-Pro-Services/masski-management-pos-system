
  let cart = [];
  let currentInput = 'cash';
//   const gasUnitPrice = 1300;

  let appliedCoupon = null;
const coupons = {
  "SAVE10": { type: "percent", value: 10 },
  "WELCOME500": { type: "fixed", value: 500 }
};

//function to add product to cart
function addToCart(name, price, image = 'pod.jpg', unit = null, product_id = null, variations_id = null) {
  const variation = allProducts.find(v =>
    (v.variation_id || v.variations_id) == variations_id
  );
  const cost_price = variation ? Number(variation.cost_price) : 0;

  const existing = cart.find(item => item.name === name && item.product_id === product_id && item.variations_id === variations_id);
  if (existing) {
    existing.qty += 1;
    showToast(`✅ Increased quantity of "${name}"`, "success");
  } else {
    cart.push({ name, price, qty: 1, image, unit, product_id, variations_id, cost_price });
    showToast(`✅ "${name}" added to cart`, "success");
  }
  renderCart();
}


  function updateQty(index, qty) {
    qty = parseFloat(qty);
    if (qty < 1) {
      cart.splice(index, 1);
    } else {
      cart[index].qty = qty;
    }
    renderCart();
  }

  function removeItem(index) {
    cart.splice(index, 1);
    renderCart();
  }

  function renderCart() {
    const container = document.getElementById("order-summary");
    const subtotalBox = document.getElementById("subtotal");
    const taxBox = document.getElementById("tax");
    const totalBox = document.getElementById("total");
    const discountBox = document.getElementById("discount");
    const discountInput = document.getElementById("discountInput");

    container.innerHTML = "";
    let subtotal = 0;

    [...cart].reverse().forEach((item, i) => {
      const index = cart.length - 1 - i; // get original index
      const lineTotal = item.qty * item.price;
      subtotal += lineTotal;

      container.innerHTML += `
        <div class="border rounded p-2 mb-2 bg-light">
          <div class="d-flex align-items-center justify-content-between">
            <div class="d-flex align-items-center gap-2">
                <img src="http://localhost:3000/uploads/${item.image}" width="50" height="50" class="rounded">
              <div>
                <strong>${item.name}</strong><br>
                <small>₦${item.price.toLocaleString()}${item.unit ? '/' + item.unit : ''}</small>
              </div>
            </div>
           <div class="d-flex align-items-center gap-2">
${item.unit && item.unit.toLowerCase() === 'kg' ? `<button type="button" class="btn btn-sm btn-outline-secondary" onclick="openCashToGasModal()"><i class="bi bi-three-dots"></i></button>` : ''}
  <button type="button" class="btn btn-sm btn-danger" onclick="removeItem(${index})"><i class="bi bi-trash"></i></button>
</div>
          </div>
          <div class="d-flex align-items-center gap-1 mt-2">
            <button type="button"  class="btn btn-sm btn-light border" onclick="updateQty(${index}, ${item.qty - 1})">–</button>
            <input type="number" class="form-control form-control-sm text-center" style="width: 60px;" value="${item.qty}" min="1" step="0.01" onchange="updateQty(${index}, this.value)">
            <button type="button"  class="btn btn-sm btn-light border" onclick="updateQty(${index}, ${item.qty + 1})">+</button>
            <span class="ms-auto fw-bold">₦${lineTotal.toLocaleString()}</span>
          </div>
        </div>`;
    });

    let discount = parseFloat(discountInput.value) || 0;
if (appliedCoupon) {
  if (appliedCoupon.type === 'percent') {
    discount += subtotal * (appliedCoupon.value / 100);
  } else if (appliedCoupon.type === 'fixed') {
    discount += appliedCoupon.value;
  }
}

    let totalExclusiveTax = 0;
let totalInclusiveTax = 0;

cart.forEach(item => {
  const taxInfo = variationTaxMap[item.variations_id];
  if (taxInfo) {
    const lineTotal = item.qty * item.price;
    if (taxInfo.tax_type === 'exclusive') {
      totalExclusiveTax += (lineTotal * taxInfo.tax_rate) / 100;
    } else if (taxInfo.tax_type === 'inclusive') {
      totalInclusiveTax += lineTotal - (lineTotal / (1 + taxInfo.tax_rate / 100));
    }
  }
});

let exclusiveTaxRates = new Set();
cart.forEach(item => {
  const taxInfo = variationTaxMap[item.variations_id];
  if (taxInfo && taxInfo.tax_type === 'exclusive') {
    exclusiveTaxRates.add(taxInfo.tax_rate);
  }
});

const taxRateLabel = document.getElementById("tax-rate");
if (taxRateLabel) {
  if (exclusiveTaxRates.size === 1) {
    taxRateLabel.innerText = `Tax (${[...exclusiveTaxRates][0]}%)`;
  } else if (exclusiveTaxRates.size > 1) {
    taxRateLabel.innerText = `Tax (${[...exclusiveTaxRates].join('% + ')}%)`;
  } else {
    taxRateLabel.innerText = "Tax (0%)";
  }
}

const vat = totalExclusiveTax;
const total = subtotal - discount + vat;

subtotalBox.innerText = subtotal.toLocaleString();
discountBox.innerText = discount.toLocaleString();
taxBox.innerText = vat.toLocaleString();
totalBox.innerText = total.toLocaleString();
  }

  function setInputMode(mode) {
    currentInput = mode;
    document.getElementById("cashInputGroup").style.display = mode === 'cash' ? 'block' : 'none';
    document.getElementById("kgInputGroup").style.display = mode === 'kg' ? 'block' : 'none';
    document.getElementById("cashToggle").classList.toggle("btn-success", mode === 'cash');
    document.getElementById("cashToggle").classList.toggle("btn-outline-secondary", mode !== 'cash');
    document.getElementById("kgToggle").classList.toggle("btn-success", mode === 'kg');
    document.getElementById("kgToggle").classList.toggle("btn-outline-secondary", mode !== 'kg');
  }

  function openCashToGasModal() {
    const modal = new bootstrap.Modal(document.getElementById('cashToGasModal'));
    document.getElementById("cashInput").value = "";
    document.getElementById("kgInput").value = "";
    setInputMode('cash');
    modal.show();
  }

  function keyInput(value) {
  const cashInput = document.getElementById("cashInput");
  const kgInput = document.getElementById("kgInput");
  const field = currentInput === 'kg' ? kgInput : cashInput;

  // Get the current value as a string
  let currentVal = field.value.toString();

  // Prevent multiple dots
  if (value === '.' && currentVal.includes('.')) return;

  // Append the new value
  field.value = currentVal + value;

  // Run the appropriate sync
  if (currentInput === 'cash') {
    syncFromCash();
  } else {
    syncFromKg();
  }
}

  function clearInputs() {
    document.getElementById("cashInput").value = "";
    document.getElementById("kgInput").value = "";
  }
  
function getGasUnitPrice() {
  const gasItem = cart.find(item => item.unit && item.unit.toLowerCase() === 'kg');
  return gasItem ? parseFloat(gasItem.price) : 0;
}

function syncFromCash() {
  const val = parseFloat(document.getElementById("cashInput").value);
  const gasUnitPrice = getGasUnitPrice();
  if (!isNaN(val) && gasUnitPrice > 0) {
    const kg = Math.floor((val / gasUnitPrice) * 100) / 100;
    document.getElementById("kgInput").value = kg.toFixed(2);
  } else {
    document.getElementById("kgInput").value = "";
  }
}

function syncFromKg() {
  const val = parseFloat(document.getElementById("kgInput").value);
  const gasUnitPrice = getGasUnitPrice();
  if (!isNaN(val) && gasUnitPrice > 0) {
    document.getElementById("cashInput").value = (val * gasUnitPrice).toFixed(2);
  } else {
    document.getElementById("cashInput").value = "";
  }
}

function applyCashToGas() {
  console.log("applyCashToGas called");
  let qty = 0;
  const gasUnitPrice = getGasUnitPrice();
  if (currentInput === 'cash') {
        const cashRaw = document.getElementById("cashInput").value;
        const cash = parseFloat(cashRaw.replace(/[^0-9.]/g, ''));
    console.log("cash parsed:", cash);
    if (!isNaN(cash) && cash > 0 && gasUnitPrice > 0) {
      qty = Math.floor((cash / gasUnitPrice) * 100) / 100;
    }
  } else {
    const kg = parseFloat(document.getElementById("kgInput").value);
    if (!isNaN(kg) && kg > 0) {
      qty = kg;
    }
  }

  console.log("qty to apply:", qty);

  if (qty <= 0) return;


  const item = cart.find(item => item.unit && item.unit.toLowerCase() === 'kg');
  if (item) {
    item.qty = qty;
    renderCart();
    bootstrap.Modal.getInstance(document.getElementById('cashToGasModal')).hide();
  } else {
    showToast("No gas item found in cart.", "danger");
  }
}

  function applyCoupon() {
  const code = document.getElementById("couponCode").value.trim().toUpperCase();
  const messageBox = document.getElementById("couponMessage");

  if (coupons[code]) {
    appliedCoupon = coupons[code];
    messageBox.textContent = `✅ Coupon applied: ${code}`;
    messageBox.classList.remove("text-danger");
    messageBox.classList.add("text-success");
  } else {
    appliedCoupon = null;
    messageBox.textContent = "❌ Invalid coupon code";
    messageBox.classList.remove("text-success");
    messageBox.classList.add("text-danger");
  }
  renderCart();
}

function showInput(type) {
  const coupon = document.getElementById("couponSection");
  const manual = document.getElementById("manualDiscountSection");

  if (type === 'coupon') {
    coupon.style.display = 'block';
    manual.style.display = 'none';
  } else if (type === 'manual') {
    manual.style.display = 'block';
    coupon.style.display = 'none';
  }
}

let pendingPaymentMethod = null;
//for preview...
function payNow(method) {
  if (cart.length === 0) {
    showToast("⚠️ No products added to cart.");
    return;
  }

  pendingPaymentMethod = method;

  const subtotal = cart.reduce((sum, item) => sum + item.qty * item.price, 0);
  const discountInput = parseFloat(document.getElementById("discountInput").value) || 0;
  let discount = discountInput;

  // Optional: coupon discount
  if (appliedCoupon) {
    if (appliedCoupon.type === 'percent') {
      discount += subtotal * (appliedCoupon.value / 100);
    } else if (appliedCoupon.type === 'fixed') {
      discount += appliedCoupon.value;
    }
  }

let totalExclusiveTax = 0;
let totalInclusiveTax = 0;
cart.forEach(item => {
  const taxInfo = variationTaxMap[item.variations_id];
  if (taxInfo) {
    const lineTotal = item.qty * item.price;
    if (taxInfo.tax_type === 'exclusive') {
      totalExclusiveTax += (lineTotal * taxInfo.tax_rate) / 100;
    } else if (taxInfo.tax_type === 'inclusive') {
      totalInclusiveTax += lineTotal - (lineTotal / (1 + taxInfo.tax_rate / 100));
    }
  }
});
const vat = totalExclusiveTax;
const total = subtotal - discount + vat;

  // Invoice meta
  const now = new Date();
  const dateTime = now.toLocaleString();
  const invoiceNumber = "INV" + now.getTime();

  // Get additional dynamic values
  let customerName = 'Walk-in';
  const customerSelect = document.getElementById("customer");
  if (customerSelect) {
    const selectedOption = customerSelect.options[customerSelect.selectedIndex];
    if (selectedOption) {
      customerName = selectedOption.text.split(' (')[0] || 'Walk-in';
    }
  }
 
  if (!customerName || customerName.trim() === "") {
    customerName = "Walk-in";
  }
 const salesPointRaw = document.getElementById("salesPoint")?.value || "N/A";
const salesPoint = getSalesPointLabel(salesPointRaw);
    let cashierName = 'System';
try {
  const admin = JSON.parse(sessionStorage.getItem('admin'));
  if (admin && (admin.first_name || admin.last_name)) {
    cashierName = `${admin.first_name || ''} ${admin.last_name || ''}`.trim();
  }
} catch (e) {
  cashierName = 'System';
}

  // ==== Fill Offcanvas Receipt Preview ====
  document.getElementById("receiptMethod").innerText = method.toUpperCase();
  document.getElementById("receiptSubtotal").innerText = `₦${subtotal.toLocaleString()}`;
  document.getElementById("receiptDiscount").innerText = `₦${discount.toLocaleString()}`;
  document.getElementById("receiptVat").innerText = `₦${vat.toLocaleString()}`;
  document.getElementById("receiptTotal").innerText = `₦${total.toLocaleString()}`;
  document.getElementById("receiptNumber").innerText = invoiceNumber;
  document.getElementById("receiptDate").innerText = dateTime;

  // Fill offcanvas <pre> spans
  document.getElementById("offcanvasSalesPoint").innerText = salesPoint;
  document.getElementById("offcanvasCustomer").innerText = customerName;
  document.getElementById("offcanvasCashier").innerText = cashierName;

  // Fill offcanvas item table
  const itemBody = document.getElementById("receiptItemBody");
  itemBody.innerHTML = "";
  cart.forEach(item => {
    itemBody.innerHTML += `
      <tr>
        <td>${item.name}</td>
        <td>${item.qty}-${item.unit}</td>
        <td>₦${(item.qty * item.price).toLocaleString()}</td>
      </tr>`;
  });

  // ==== Fill Printable Invoice ====
  fillInvoice(method, subtotal, discount, vat, total, invoiceNumber, dateTime, customerName, salesPoint, cashierName);

  // Show offcanvas
  const offcanvas = new bootstrap.Offcanvas(document.getElementById('confirmOffcanvas'));
  offcanvas.show();
}


function getSalesPointLabel(value) {
  if (!value) return "N/A";
  if (value === "at_station_order") return "In-Store";
  if (value === "online_order") return "Online Order";
  return value;
}

//for receipts
function fillInvoice(method, subtotal, discount, vat, total, invoiceNumber, dateTime) {
  // Helper to safely update text content
  const safeSet = (selector, value) => {
    const el = document.querySelector(selector);
    if (el) el.innerText = value;
  };

  // Get values from form
    let customerName = 'Walk-in';
  const customerSelect = document.getElementById("customer");
  if (customerSelect) {
    const selectedOption = customerSelect.options[customerSelect.selectedIndex];
    if (selectedOption) {
      customerName = selectedOption.text.split(' (')[0] || 'Walk-in';
    }
  }
 
  if (!customerName || customerName.trim() === "") {
    customerName = "Walk-in";
  }
 const salesPointRaw = document.getElementById("salesPoint")?.value || "N/A";
const salesPoint = getSalesPointLabel(salesPointRaw);
  let cashierName = 'System';
try {
  const admin = JSON.parse(sessionStorage.getItem('admin'));
  if (admin && (admin.first_name || admin.last_name)) {
    cashierName = `${admin.first_name || ''} ${admin.last_name || ''}`.trim();
  }
} catch (e) {
  cashierName = 'System';
} // Will be dynamic after login

  // Set header values
  safeSet("#invoice span.customer-name", customerName);
  safeSet("#invoice span.sales-point", salesPoint);
  safeSet("#invoice span.cashier-name", cashierName);
  safeSet("#invoice span.payment-method", method.toUpperCase());
  safeSet("#invoice span.invoice-no", invoiceNumber);
  safeSet("#invoice span.invoice-date", dateTime);


    let exclusiveTaxRates = new Set();
  cart.forEach(item => {
    const taxInfo = variationTaxMap[item.variations_id];
    if (taxInfo && taxInfo.tax_type === 'exclusive') {
      exclusiveTaxRates.add(taxInfo.tax_rate);
    }
  });

  let taxLabel = "VAT";
  if (exclusiveTaxRates.size === 1) {
    taxLabel = `Tax (${[...exclusiveTaxRates][0]}%)`;
  } else if (exclusiveTaxRates.size > 1) {
    taxLabel = `Tax (${[...exclusiveTaxRates].join('% + ')}%)`;
  } else {
    taxLabel = "Tax (0%)";
  }

  // Fill items table
  const itemTable = document.querySelector("#invoice tbody");
  if (itemTable) {
    itemTable.innerHTML = "";

    cart.forEach(item => {
      itemTable.innerHTML += `
        <tr>
          <td><h6>${item.name}</h6></td>
          <td><h6>${item.qty}-${item.unit}</h6></td>
          <td><h6>${(item.qty * item.price).toLocaleString()}</h6></td>
        </tr>`;
    });

    itemTable.innerHTML += `
      <tr>
        <td colspan="">&nbsp;</td>
        <td>
          <p>Subtotal</p>
          <p>Discount</p>
           <p>${taxLabel}</p>
          <h4 class="mt-4 text-blue">Total</h4>
        </td>
        <td>
          <p>${subtotal.toLocaleString()}</p>
          <p>${discount.toLocaleString()}</p>
          <p>${vat.toLocaleString()}</p>
          <h4 class="mt-4 text-blue">${total.toLocaleString()}</h4>
        </td>
      </tr>`;
  }
}





function showToast(message, type = 'danger') {
  const toastBox = document.getElementById('toastBox');
  const toastMessage = document.getElementById('toastMessage');

  // Set toast background color class
  toastBox.className = `toast align-items-center border-0 fade bg-${type}`;
  toastMessage.textContent = message;

  // Show toast
  const toast = new bootstrap.Toast(toastBox, { delay: 3000 });
  toast.show();
}


// First: Confirm and Save
document.getElementById("confirmBtn").addEventListener("click", async () => {
  const now = new Date();
  const invoiceNumber = "TX-" + now.getTime();
  const dateTime = now.toLocaleString();

const customerSelect = document.getElementById("customer");
const customer_id = customerSelect.value || null;
let customer_fullname = "Walk-in";
let customer_contact_no = "";

if (customer_id && customer_id !== "Walk-in") {
 
  const selectedOption = customerSelect.options[customerSelect.selectedIndex];
  const match = selectedOption.text.match(/^(.+?) \((.+?)\)$/);
  if (match) {
    customer_fullname = match[1];
    customer_contact_no = match[2];
  } else {
    customer_fullname = selectedOption.text;
    customer_contact_no = "";
  }
} else {
  customer_fullname = "Walk-in";
  customer_contact_no = "";
}

  const salesPoint = document.getElementById("salesPoint").value || "In-person";

  let cashierName = 'System';
  try{
    const admin = JSON.parse(sessionStorage.getItem('admin'));
    if (admin && (admin.first_name || admin.last_name)) {
      cashierName = `${admin.first_name || ''} ${admin.last_name || ''}`.trim();
    }
  }catch (e) {
    cashierName = 'System';
  }
 

  const discount = parseFloat(document.getElementById("discountInput").value) || 0;
  const subtotal = cart.reduce((sum, item) => sum + item.qty * item.price, 0);

 let totalExclusiveTax = 0;
  let totalInclusiveTax = 0;
  cart.forEach(item => {
    const taxInfo = variationTaxMap[item.variations_id];
    if (taxInfo) {
      const lineTotal = item.qty * item.price;
      if (taxInfo.tax_type === 'exclusive') {
        totalExclusiveTax += (lineTotal * taxInfo.tax_rate) / 100;
      } else if (taxInfo.tax_type === 'inclusive') {
        totalInclusiveTax += lineTotal - (lineTotal / (1 + taxInfo.tax_rate / 100));
      }
    }
  });

  let exclusiveTaxRates = new Set();
  cart.forEach(item => {
    const taxInfo = variationTaxMap[item.variations_id];
    if (taxInfo && taxInfo.tax_type === 'exclusive') {
        exclusiveTaxRates.add(taxInfo.tax_rate);
    }
  });

    const taxRateLabel = document.getElementById("tax-rate2");
    if (taxRateLabel) {
    if (exclusiveTaxRates.size === 1) {
        taxRateLabel.innerText = `Tax (${[...exclusiveTaxRates][0]}%)`;
    } else if (exclusiveTaxRates.size > 1) {
        taxRateLabel.innerText = `Tax (${[...exclusiveTaxRates].join('% + ')}%)`;
    } else {
        taxRateLabel.innerText = "Tax (0%)";
    }
    }

  const vat = totalExclusiveTax;
  const total = subtotal - discount + vat;

  const paymentMethod = pendingPaymentMethod || "Unknown";
  const isSplit = paymentMethod.includes('/');
let payment_method = paymentMethod;
let split_details = null;

if (isSplit) {
  const amt1 = parseFloat(document.getElementById("splitAmount1").value) || 0;
  const amt2 = parseFloat(document.getElementById("splitAmount2").value) || 0;
  const method1 = document.getElementById("splitMethod1").value;
  const method2 = document.getElementById("splitMethod2").value;

  
  payment_method = "split";
  split_details = [
    { method: method1, amount: amt1 },
    { method: method2, amount: amt2 }
  ];
}

  const transactionData = {
    invoiceNumber,
    dateTime,
      customer_id,
  customerName: customer_fullname,
  customerPhone: customer_contact_no,
    salesPoint,
    cashierName,
    payment_method,
    split_details,
    subtotal,
    discount,
    vat,
    total,
    total_inclusive_tax: totalInclusiveTax,
    cart: [...cart],
    synced: false // for syncing later
  };

  try {
      const confirmSaleBtn = document.getElementById("confirmBtn");
    confirmSaleBtn.disabled = true; 
    confirmSaleBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...';

   await saveTransactionToLocal(transactionData);

    // Show success toast
    showToast("✅ Sale saved successfully", "success");

// const customerSelect = document.getElementById("customer");
// const customer_id = customerSelect.value || null;
// const customer_fullname = customerSelect.options[customerSelect.selectedIndex]?.text.split(' (')[0] || "";
// const customerPhone = document.getElementById("customerPhone")?.value || "N/A";

// let cashier_name = 'System';
// try {
//   const admin = JSON.parse(sessionStorage.getItem('admin'));
//   if (admin && admin.first_name && admin.last_name) {
//     cashier_name = `${admin.first_name} ${admin.last_name}`;
//   }
// } catch (e) {
//   cashier_name = 'System';
// }

//       const payload = {
//     customer_id: customer_id,
//   customer_fullname: customer_fullname,
//   customer_contact_no: customerPhone,
//     order_method: salesPoint,
//     order_details: cart.map(item => ({
//       product_id: item.product_id || null,
//       product_name: item.name,
//       variations_id: item.variations_id || null,
//       cost_price: item.cost_price || 0,
//       selling_price: item.price,
//       variation_image: item.image || null,
//       quantity: item.qty
//     })),
//     total_order_amount: total,
//     tax: vat,
//     payment_method: paymentMethod,
//     status: "order_made",
//     discount,
//     cashier_name
//   };
  

//    try {
//     const response = await fetch('http://localhost:3000/order', {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json'
//       },
//       body: JSON.stringify(payload)
//     });

//     if (response.ok) {
//       showToast("✅ Sale synced to server", "success");
//     } else {
//       const errMsg = await response.text();
//       showToast("❌ Failed to sync sale: " + errMsg, "danger");
//       console.error("❌ Failed to sync sale:", errMsg);
//     }
//   } catch (err) {
//     showToast("❌ Network error syncing sale", "danger");
//     console.error("❌ Network error syncing sale:", err);
//   }

    // Show the print button
    document.getElementById("confirmBtn").classList.add("d-none");
    document.getElementById("printReceiptBtn").classList.remove("d-none");

    // Store invoice in memory for printing
    window.latestInvoiceHTML = document.getElementById('invoice').innerHTML;
  } catch (err) {
    console.error("❌ Failed to save:", err);
    showToast("❌ Failed to save sale", "error");
  }finally {
  
    const confirmSaleBtn = document.getElementById("confirmBtn");
    confirmSaleBtn.disabled = false; 
    confirmSaleBtn.innerHTML = 'Confirm Sale';
  }
});

document.getElementById("printReceiptBtn").addEventListener("click", function () {
  const invoiceContent = document.getElementById("invoice").innerHTML;

  // ✅ Open a new popup window
  const printWindow = window.open('', '_blank', 'width=600');


  // ✅ Inject your styles
  printWindow.document.write(`
    <html>
      <head>
        <title>Print Receipt</title>
       <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">

  <style>
  @media print {
    body, html {
       font-size: 16px !important;
   font-family: 'Courier New', Courier, monospace !important;
    margin: 0 !important;
    padding: 0 !important;
    color: #000 !important;
    background: #fff !important;
    }
    @page {
      size: 58mm auto;
      margin: 1mm;
    }
    #invoice {
      width: 56mm;
      margin: 0 !important;
      padding: 0 !important;
    }
    h4, h6, p, th, td, small {
      font-size: 14px !important;
      margin: 0 0 2px !important;
      padding: 2px 2px !important;
      color: #111 !important;
      font-weight: 800 !important;
      letter-spacing: 0.01em;
    }
    h4, h6 {
      font-weight: 800 !important;
    }
    table {
      width: 100%;
      border-collapse: collapse !important;
      margin-top: 2px !important;
    }
    th, td {
      border: 1px solid #111 !important;
    text-align: left;
    }
    img.logo {
         max-height: 25px !important;
            opacity: 1 !important;
            filter: brightness(0) contrast(2) !important;
            display: block;
            margin: 0 auto 1px auto !important;
    }
    .card, .card-header, .card-body, .table-responsive {
      border: none !important;
      padding: 0 !important;
      margin: 0 !important;
      box-shadow: none !important;
      background: none !important;
       min-height: 0 !important;
    }
  }
  #invoice {
    width: 58mm;
    margin: 0 !important;
  }
</style>
      </head>
      <body>${invoiceContent}</body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();

  printWindow.onload = () => {
    printWindow.print();
    printWindow.close();

    // ✅ Reset inputs, cart, and UI
    resetPOSAfterPrint();
  };
});



function resetPOSAfterPrint() {
  // ✅ Close the offcanvas
  const offcanvasEl = document.getElementById('confirmOffcanvas');
  const offcanvasInstance = bootstrap.Offcanvas.getInstance(offcanvasEl);
  if (offcanvasInstance) offcanvasInstance.hide();

  // ✅ Reset buttons
  document.getElementById("printReceiptBtn").classList.add("d-none");
  document.getElementById("confirmBtn").classList.remove("d-none");

  // ✅ Clear cart
  cart = [];
  renderCart();

  // ✅ Reset input fields
  document.getElementById("customer").value = "Walk-in";
  document.getElementById("salesPoint").selectedIndex = 0;
  document.getElementById("discountInput").value = "";
  document.getElementById("couponCode").value = "";
  document.getElementById("splitAmount1").value = "";
  document.getElementById("splitAmount2").value = "";
  document.getElementById("splitMethod1").selectedIndex = 0;
  document.getElementById("splitMethod2").selectedIndex = 1;
  pendingPaymentMethod = null;

  showToast("🧾 Receipt printed and cart cleared!", "success");

  // ✅ Optional: Reload if online
  if (navigator.onLine) {
    setTimeout(() => location.reload(), 1500);
  } else {
    console.log("📴 Offline mode – skipped reload");
  }
}

















/*scrirpt to check if save on local
console.log("Transactions:", JSON.parse(localStorage.getItem("dailySales")));
*/

  //Add to draft 
  function addDraft() {
    if (cart.length === 0) {
      showToast("⚠️ Cart is empty. Cannot save draft.", "warning");
      return;
    }
  
    const now = new Date();
    const dateTime = now.toLocaleString();
    const invoiceNumber = "DRAFT" + now.getTime();
  
    const customerName = document.getElementById("customer").value || "Walk-in";
   const salesPointRaw = document.getElementById("salesPoint")?.value || "N/A";
const salesPoint = getSalesPointLabel(salesPointRaw);
    const discount = parseFloat(document.getElementById("discountInput").value) || 0;
  
    const subtotal = cart.reduce((sum, item) => sum + item.qty * item.price, 0);
    const vat = subtotal * 0.1;
    const total = subtotal - discount + vat;
  
    const draft = {
      invoiceNumber,
      dateTime,
      customerName,
      salesPoint,
      cart: [...cart],
      discount,
      subtotal,
      vat,
      total,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    };
  
    let drafts = JSON.parse(localStorage.getItem("posDrafts")) || [];
    drafts.unshift(draft);
    localStorage.setItem("posDrafts", JSON.stringify(drafts));
  
    // ✅ Reset cart and form
    cart = [];
    renderCart(); // Redraw the cart UI
  
    document.getElementById("discountInput").value = "";
    document.getElementById("customer").value = "Walk-in";
    document.getElementById("salesPoint").value = "";
  
    showToast("✅ Draft saved successfully and cart cleared!", "success");
    renderDraftList(); // 🔁 refresh draft UI after saving
    updateDraftCountBadge(); 

  }
  
  
  function showDrafts() {
    let drafts = JSON.parse(localStorage.getItem("posDrafts")) || [];
  
    // Clean expired ones
    const now = Date.now();
    drafts = drafts.filter(d => d.expiresAt > now);
    localStorage.setItem("posDrafts", JSON.stringify(drafts));
  
    const body = document.getElementById("draftListBody");
    body.innerHTML = "";
  
    if (drafts.length === 0) {
      body.innerHTML = `<p class="text-center text-muted">📭 No saved drafts available.</p>`;
    } else {
      drafts.forEach((d, i) => {
        const item = document.createElement("div");
        item.className = "border rounded p-2 mb-2 d-flex justify-content-between align-items-center";
        item.innerHTML = `
          <div>
            <div><strong>${d.invoiceNumber}</strong></div>
            <div class="small text-muted">${d.customerName} | ${d.dateTime}</div>
          </div>
          <button class="btn btn-sm btn-outline-success" onclick="loadDraft(${i})">Load</button>
        `;
        body.appendChild(item);
      });
    }
  
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('draftModal'));
    modal.show();
  }
  


  function loadDraft(index) {
    let drafts = JSON.parse(localStorage.getItem("posDrafts")) || [];
    const draft = drafts[index];
    if (!draft) return showToast("⚠️ Draft not found", "warning");
  
    // Restore
    cart = draft.cart || [];
      let customerName = 'Walk-in';
  const customerSelect = document.getElementById("customer");
  if (customerSelect) {
    const selectedOption = customerSelect.options[customerSelect.selectedIndex];
    if (selectedOption) {
      customerName = selectedOption.text.split(' (')[0] || 'Walk-in';
    }
  }
 
  if (!customerName || customerName.trim() === "") {
    customerName = "Walk-in";
  }
    document.getElementById("salesPoint").value = draft.salesPoint;
    document.getElementById("discountInput").value = draft.discount || 0;
  
    renderCart();
  
    // Remove it from storage
    drafts.splice(index, 1);
    localStorage.setItem("posDrafts", JSON.stringify(drafts));
  
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('draftModal'));
    modal.hide();
  
    showToast(`✅ Draft ${draft.invoiceNumber} loaded`, "success");
    updateDraftCountBadge(); 
  }
  

  //clear draft
  function clearAllDrafts() {
    localStorage.removeItem("posDrafts");
    renderDraftList();
    showToast("🗑️ All drafts cleared", "success");
    updateDraftCountBadge(); 
    // Close the modal after a short delay
    const modal = bootstrap.Modal.getInstance(document.getElementById('draftModal'));
    if (modal) {
      modal.hide();
    }
  }
  

  
  function renderDraftList() {
    const drafts = JSON.parse(localStorage.getItem("posDrafts")) || [];
    const draftContainer = document.getElementById("draftListBody");
  
    draftContainer.innerHTML = "";
  
    if (drafts.length === 0) {
      draftContainer.innerHTML = `<p class="text-center text-muted">No drafts available.</p>`;
      return;
    }
  
    drafts.forEach((d, i) => {
      draftContainer.innerHTML += `
        <div class="card mb-2 p-2 shadow-sm">
          <div><strong>#${d.invoiceNumber}</strong></div>
          <div><small>Customer: ${d.customerName}</small></div>
          <div><small>Sales Point: ${d.salesPoint}</small></div>
          <div><small>Time: ${d.dateTime}</small></div>
          <button class="btn btn-primary btn-sm mt-1" onclick="resumeDraft(${i})">Resume</button>
        </div>
      `;
    });
  }
  function updateDraftCountBadge() {
    const drafts = JSON.parse(localStorage.getItem("posDrafts")) || [];
  
    // Only count non-expired drafts
    const validDrafts = drafts.filter(d => d.expiresAt > Date.now());
    const badge = document.getElementById("draftCountBadge");
  
    if (badge) {
      badge.innerText = validDrafts.length;
      badge.style.display = validDrafts.length > 0 ? "inline-block" : "none";
    }
  }
  
  function openSplitPaymentModal() {
    if (cart.length === 0) {
      showToast("⚠️ Cart is empty. Cannot proceed with split payment.", "warning");
      return;
    }
  
    const subtotal = cart.reduce((sum, item) => sum + item.qty * item.price, 0);
    const discount = parseFloat(document.getElementById("discountInput").value) || 0;

   let totalExclusiveTax = 0;
  cart.forEach(item => {
    const taxInfo = variationTaxMap[item.variations_id];
    if (taxInfo && taxInfo.tax_type === 'exclusive') {
      const lineTotal = item.qty * item.price;
      totalExclusiveTax += (lineTotal * taxInfo.tax_rate) / 100;
    }
  });
  const vat = totalExclusiveTax;
  const total = subtotal - discount + vat;
  
    document.getElementById("splitTotalAmount").innerText = total.toLocaleString();
  
    // Reset inputs
    document.getElementById("splitAmount1").value = '';
    document.getElementById("splitAmount2").value = '';
    document.getElementById("splitMethod1").value = 'cash';
    document.getElementById("splitMethod2").value = 'bank_transfer';
    document.getElementById("splitErrorMsg").textContent = '';
  
    const modal = new bootstrap.Modal(document.getElementById("splitPaymentModal"));
    modal.show();
  }
  
  //confirm Sales .....
  function confirmSplitPayment() {
    const amt1 = parseFloat(document.getElementById("splitAmount1").value) || 0;
    const amt2 = parseFloat(document.getElementById("splitAmount2").value) || 0;
    const method1 = document.getElementById("splitMethod1").value;
    const method2 = document.getElementById("splitMethod2").value;
  
    const subtotal = cart.reduce((sum, item) => sum + item.qty * item.price, 0);
    const discount = parseFloat(document.getElementById("discountInput").value) || 0;

   let totalExclusiveTax = 0;
  cart.forEach(item => {
    const taxInfo = variationTaxMap[item.variations_id];
    if (taxInfo && taxInfo.tax_type === 'exclusive') {
      const lineTotal = item.qty * item.price;
      totalExclusiveTax += (lineTotal * taxInfo.tax_rate) / 100;
    }
  });
  const vat = totalExclusiveTax;
  const total = subtotal - discount + vat;
  
    const paid = amt1 + amt2;
  
    
    if (paid.toFixed(2) != total.toFixed(2)) {
      document.getElementById("splitErrorMsg").innerText = `⚠️ Total split (₦${paid.toLocaleString()}) does not match required amount (₦${total.toLocaleString()})`;
      return;
    }
  
    
    const combinedMethod = `${method1}/${method2}`;
  
    
    const modal = bootstrap.Modal.getInstance(document.getElementById("splitPaymentModal"));
    modal.hide();
  
    // Proceed with existing payNow function
    payNow(combinedMethod);
  }
  
// Save to localForage (salesStore)
const salesStore = localforage.createInstance({
  name: 'POSApp',
  storeName: 'salesStore'
});

async function saveTransactionToLocal(data) {

   let admin = null;
  try {
    admin = JSON.parse(sessionStorage.getItem('admin'));
  } catch {
    console.error("❌ Failed to parse admin data from sessionStorage");
    showToast("❌ Failed to save sale: Invalid admin data", "error");
    return;
  }
  const admin_first_name = admin?.first_name || '';
  const admin_last_name = admin?.last_name || '';
  const admin_id = admin?.id || '';

 
  data.admin_first_name = admin_first_name;
  data.admin_last_name = admin_last_name;
  data.admin_id = admin_id;



  const existingSales = (await salesStore.getItem("sales")) || [];
  existingSales.push(data);
  await salesStore.setItem("sales", existingSales);
  showToast("✅ Sale saved successfully", "success");
  
  console.log("✅ Sale saved to localForage (salesStore).");
}








  function clearSale() {
    // Clear the cart
    cart = [];
  
    // Reset form fields
    document.getElementById("customer").value = "Walk-in";
    document.getElementById("salesPoint").value = "Choose sales method";
    document.getElementById("discountInput").value = "";
    document.getElementById("couponCode").value = "";
  
    // Clear coupon data
    appliedCoupon = null;
    document.getElementById("couponMessage").textContent = "";
    document.getElementById("couponSection").style.display = "none";
    document.getElementById("manualDiscountSection").style.display = "none";
  
    // Clear order summary content
    const orderSummary = document.getElementById("order-summary");
    if (orderSummary) orderSummary.innerHTML = "";
  
    // Reset totals
    document.getElementById("subtotal").innerText = "0.00";
    document.getElementById("discount").innerText = "0.00";
    document.getElementById("tax").innerText = "0.00";
    document.getElementById("total").innerText = "0.00";
  
    // Force re-render cart summary (optional depending on your setup)
    if (typeof renderCart === 'function') renderCart();
  
    // Show confirmation toast
    showToast("🗑️ Sale cleared successfully.", "warning");
  }


  let variationTaxMap = {};

async function loadVariationTaxes() {
  if (!navigator.onLine) {
    const cached = await localforage.getItem('taxes') || [];
    processTaxes(cached);
    return;
  }
  const res = await fetch('http://localhost:3000/tax');
  const taxes = await res.json();
  processTaxes(taxes);
  localforage.setItem('taxes', taxes);
}

function processTaxes(taxes) {
  const productTaxMap = {};
  taxes.forEach(tax => {
    productTaxMap[tax.product_id] = {
      tax_rate: Number(tax.tax_rate),
      tax_type: tax.tax_type,
      tax_name: tax.tax_name
    };
  });
  variationTaxMap = {};
  allProducts.forEach(variation => {
    const taxInfo = productTaxMap[variation.product_id];
    if (taxInfo) {
      variationTaxMap[variation.variation_id || variation.variations_id] = taxInfo;
    }
  });
}
  
   let allProducts = [];
 
  let allCategories = [];
  let allBrands = [];
  

async function loadProducts() {
   if (!navigator.onLine) {
    const productsWithAttributes = await localforage.getItem('productsWithAttributes') || [];
    allProducts = productsWithAttributes;
    renderProducts(allProducts);
    return;
  }

  const res = await fetch('http://localhost:3000/product_variations_with_attributes');
  const productsWithAttributes = await res.json();
  allProducts = productsWithAttributes;
  renderProducts(allProducts);
   localforage.setItem('productsWithAttributes', productsWithAttributes);
}





    function renderProducts(products) {
  const container = document.querySelector('#products_grid .row.gx-3');
  const noResultsMessage = document.getElementById('noResultsMessage');
  container.innerHTML = '';

  let count = 0;

  products.forEach(variation => {

    const attrString = (variation.attributes && variation.attributes.length)
      ? variation.attributes.map(a => a.value).join(' - ')
      : '';
    const fullTitle = `${attrString ?  attrString + '  '  : ''}-${variation.product_name}`;
     const qty = Number(variation.current_variations_stock_qty_number);

   
    const qtyDisplay = qty === 0
      ? `<span class="text-danger fw-bold">Out of Stock</span>`
      : `<strong>Qty:${qty.toLocaleString()}${variation.unit_name ? variation.unit_name.replace(/'/g, "\\'") : ''}</strong>`;

 
    const addBtn = qty === 0
      ? `<button type="button" class="btn btn-outline-secondary btn-sm w-100 mt-2" disabled>Out of Stock</button>`
      : `<button type="button" class="btn btn-outline-success btn-sm w-100 mt-2"
          onclick="addToCart(
            '${fullTitle.replace(/'/g, "\\'")}',
            ${variation.selling_price},
            '${variation.variation_image ? encodeURIComponent(variation.variation_image) : ''}',
            '${variation.unit_name ? variation.unit_name.replace(/'/g, "\\'") : ''}',
            '${variation.product_id}',
            '${variation.variation_id || variation.variations_id || ''}'
          )">
          <i class="bi bi-plus-lg m-0"></i> Add to Cart
        </button>`;


    const card = document.createElement('div');
    card.className = 'col-sm-3 col-12 mb-3';
    card.innerHTML = `
     <div class="card">
  <div class="imghold d-flex justify-content-center align-items-center" style="height: 100px; background: #dedfe0;">
    <img 
      src="${variation.variation_image ? 'http://localhost:3000/uploads/' + encodeURIComponent(variation.variation_image) : 'https://via.placeholder.com/100x100?text=No+Image'}" 
      class="img-fluid product-img" 
      alt="${fullTitle.replace(/"/g, '&quot;')}"
      style="max-height: 100px; object-fit: contain;"
    >
  </div>
  <div class="text-holder p-2">
    <p class="text-secondary mb-2" style="line-height:1.2;">${fullTitle}</p>
    <p class="mb-2" style="font-size: 16px;"><strong>₦${Number(variation.selling_price).toLocaleString()}</strong></p>
         <p class="mb-2" style="font-size: 16px;">${qtyDisplay}</p>
    ${addBtn}
  </div>
</div>
    `;

    container.appendChild(card);
    count++;
  });

  // Show or hide the "No results" message
  if (count === 0) {
    noResultsMessage.style.display = 'block';
  } else {
    noResultsMessage.style.display = 'none';
  }
}


 
async function loadCategories() {
  if (!navigator.onLine) {
    const cached = await localforage.getItem('categories') || [];
    allCategories = cached;
    renderCategories(allCategories);
    return;
  }
  const res = await fetch('http://localhost:3000/product_category');
  const categories = await res.json();
  allCategories = categories;
  renderCategories(categories);
  localforage.setItem('categories', categories);
}

function renderCategories(categories) {
  const categorySelect = document.getElementById('productCategory');
  categorySelect.innerHTML = `<option value="">All Categories</option>`;
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat.category_id;
    option.textContent = cat.category_name;
    categorySelect.appendChild(option);
  });
}
  

async function loadBrands() {
  if (!navigator.onLine) {
    const cached = await localforage.getItem('brands') || [];
    renderBrands(cached);
    return;
  }
  const res = await fetch('http://localhost:3000/product');
  const products = await res.json();
  const brandMap = {};
  products.forEach(product => {
    if (product.brand && !brandMap[product.brand]) {
      brandMap[product.brand] = product.product_id;
    }
  });
  const brands = Object.entries(brandMap);
  renderBrands(brands);
  localforage.setItem('brands', brands);
}

function renderBrands(brands) {
  const brandSelect = document.getElementById('productBrand');
  brandSelect.innerHTML = `<option value="">All Brands</option>`;
  brands.forEach(([brand, productId]) => {
    const option = document.createElement('option');
    option.value = productId;
    option.textContent = brand;
    brandSelect.appendChild(option);
  });
}


async function loadCustomers() {
  if (!navigator.onLine) {
    const cached = await localforage.getItem('customers') || [];
    renderCustomers(cached);
    return;
  }
  try {
    const res = await fetch('http://localhost:3000/customer');
    const customers = await res.json();
    renderCustomers(customers);
    localforage.setItem('customers', customers);
  } catch (err) {
    showToast("❌ Failed to load customers", "danger");
    console.error("Failed to fetch customers:", err);
  }
}

function renderCustomers(customers) {
  const customerSelect = document.getElementById('customer');
  customerSelect.innerHTML = `<option value="0915e21ec043">Walk-in (N/A)</option>`;
  const filteredCustomers = customers.filter(cust => cust.customer_id !== '0915e21ec043');
  filteredCustomers.forEach(cust => {
    customerSelect.innerHTML += `<option value="${cust.customer_id}">${cust.customer_fullname} (${cust.customer_contact_no})</option>`;
  });
}



function filterProducts() {
  const selectedCategoryId = document.getElementById('productCategory').value;
  const selectedBrandProductId = document.getElementById('productBrand').value;
  const searchInput = document.querySelector('input[placeholder*="Search"]').value.toLowerCase();

  const filtered = allProducts.filter(variation => {
   
    const categoryMatch = !selectedCategoryId || variation.category_id === selectedCategoryId;

   
    const brandMatch = !selectedBrandProductId || variation.product_id === selectedBrandProductId;

   
    const attrString = (variation.attributes && variation.attributes.length)
      ? variation.attributes.map(a => a.value).join(' / ')
      : '';
    const fullTitle = `${variation.product_name}${attrString ? ' - ' + attrString : ''}`.toLowerCase();
    const category = allCategories.find(cat => cat.category_id === variation.category_id)?.category_name?.toLowerCase() || '';
    const brand = (variation.brand || '').toLowerCase();

    const searchMatch =
      !searchInput ||
      fullTitle.includes(searchInput) ||
      category.includes(searchInput) ||
      brand.includes(searchInput);

    return categoryMatch && brandMatch && searchMatch;
  });

  renderProducts(filtered);
}


document.getElementById('productCategory').addEventListener('change', filterProducts);
document.getElementById('productBrand').addEventListener('change', filterProducts);

async function syncUnsyncedSales() {
  const allSales = (await salesStore.getItem("sales")) || [];
  const unsynced = allSales.filter(s => !s.synced);

  if (unsynced.length === 0) return;

  for (let sale of unsynced) {
    const payload = {
      customer_id: sale.customer_id || null,
  customer_fullname: sale.customerName || "Walk-in",
  customer_contact_no: sale.customerPhone || "",
      order_method: sale.salesPoint || "at_station_order-store",
      order_details: (sale.cart || []).map(item => ({
        product_id: item.product_id || null,
        product_name: item.name,
        variations_id: item.variations_id || null,
        cost_price: item.cost_price || 0,
        selling_price: item.price,
        variation_image: item.image || null,
        quantity: item.qty
      })),
      total_order_amount: sale.total,
    tax: (sale.vat || 0) + (sale.total_inclusive_tax || 0),
       payment_method: sale.payment_method || sale.paymentMethod || "Unknown",
      split_details: sale.split_details || null,
      status: "order_made",
      discount: sale.discount || 0,
      cashier_name: sale.cashierName || "System"
    };

    try {
      const response = await fetch('http://localhost:3000/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        sale.synced = true;
      }
    } catch (err) {
     
      break;
    }
  }

  await salesStore.setItem("sales", allSales);
}



function updateOfflineIndicator() {
  const indicator = document.getElementById('offlineIndicator');
  if (!indicator) return;
  if (navigator.onLine) {
    indicator.classList.add('d-none');
  } else {
    indicator.classList.remove('d-none');
  }
}

async function fillCompanyInfo() {

  let admin = null;
  try {
    admin = JSON.parse(sessionStorage.getItem('admin'));
  } catch {}
  if (!admin || admin.admin_role !== 'super_admin') {
      showToast("⚠️ You do not have permission to view this information", "success");
    return;
  }


  try {
    const res = await fetch(`http://localhost:3000/owner_info/${admin.id}`);
    if (res.ok) {
      const owner = await res.json();
    
      if (owner.company_logo) {
        document.getElementById('company-logo').src = owner.company_logo;
      }
      if (owner.company_name) {
        document.getElementById('company-name').innerText = owner.company_name;
      }
      if (owner.address) {
        document.getElementById('address').innerText = owner.address;
      }
      if (owner.company_email) {
        document.getElementById('email').innerText = owner.company_email;
      }
      if (owner.phone_number) {
        document.getElementById('phone').innerHTML = `Tel: ${owner.phone_number} | Email: <span id="email">${owner.company_email || ''}</span>`;
      }
      return;
    }
  } catch {
      showToast("Error loading company info", "success");
      console.error("Error loading company info");
  }


  document.getElementById('phone').innerHTML = `Tel: ${admin.phone_number || ''} | Email: <span id="email">${admin.email || ''}</span>`;

}

async function fillSalesCompanyInfo() {

  let admin = null;
  try {
    admin = JSON.parse(sessionStorage.getItem('admin'));
  } catch {}
  if (!admin || admin.admin_role !== 'super_admin') {
   showToast("⚠️ You do not have permission to view this information", "success");
    return;
  }


  try {
    const res = await fetch(`http://localhost:3000/owner_info/${admin.id}`);
    if (res.ok) {
      const owner = await res.json();
    
   
      if (owner.company_name) {
        document.getElementById('company-name2').innerText = owner.company_name;
      }
      if (owner.address) {
        document.getElementById('address2').innerText = owner.address;
      }
      if (owner.company_email) {
        document.getElementById('email2').innerText = owner.company_email;
      }
      if (owner.phone_number) {
        document.getElementById('phone2').innerHTML = `Tel: ${owner.phone_number} | Email: <span id="email2">${owner.company_email || ''}</span>`;
      }
      return;
    }
  } catch {
    showToast("Error loading company info", "success");
  }


  document.getElementById('phone2').innerHTML = `Tel: ${admin.phone_number || ''} | Email: <span id="email2">${admin.email || ''}</span>`;

}


document.addEventListener("DOMContentLoaded", function () {
  loadCategories();
  loadBrands();
  loadProducts();
   loadVariationTaxes();
loadCustomers();
fillCompanyInfo();
  fillSalesCompanyInfo();
   updateOfflineIndicator();
  document.querySelector('input[placeholder*="Search"]').addEventListener('input', filterProducts);
  setInterval(refreshAllData, 600000);
  syncUnsyncedSales();




});

  function refreshAllData() {
  if (navigator.onLine) {
    loadProducts();
    loadCategories();
    loadBrands();
    loadCustomers();
    loadVariationTaxes();
    showToast("🔄 Data refreshed from server", "success");
  }
}

  window.addEventListener("online", syncUnsyncedSales);
  window.addEventListener('online', updateOfflineIndicator);
window.addEventListener('offline', updateOfflineIndicator);