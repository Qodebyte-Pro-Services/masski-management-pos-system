
/*
function loadDailySales() {
  const today = new Date().toDateString();
  const allSales = JSON.parse(localStorage.getItem("dailySales")) || [];

  // Filter today's sales only
  const todaysSales = allSales.filter(sale =>
    new Date(sale.dateTime).toDateString() === today
  );

  // Summary variables
  let totalGasKg = 0, totalGasAmount = 0;
  let accessoryCount = 0, accessoryTotal = 0;
  let totalDiscount = 0, discountCount = 0;
  let paymentBreakdown = {};
  let transactionCount = todaysSales.length;

  // Render transaction table
  const tbody = document.querySelector("#transactions tbody");
  tbody.innerHTML = "";

  todaysSales.forEach((sale, index) => {
    // Process products
    sale.cart.forEach(item => {
      if (item.name.toLowerCase().includes("gas")) {
        const qty = parseFloat(item.qty);
        totalGasKg += qty;
        totalGasAmount += qty * item.price;
      } else {
        const qty = parseFloat(item.qty);
        accessoryCount += qty;
        accessoryTotal += qty * item.price;
      }
    });

    // Discount
    if (sale.discount > 0) {
      discountCount++;
      totalDiscount += sale.discount;
    }

    // Payment Method
    paymentBreakdown[sale.method] = (paymentBreakdown[sale.method] || 0) + sale.total;

    // Add to table
    tbody.innerHTML += `
      <tr>
        <td>${sale.invoiceNumber}</td>
        <td>${new Date(sale.dateTime).toLocaleTimeString()}</td>
        <td>₦${sale.total.toLocaleString()}</td>
        <td>${sale.method}</td>
        <td>₦${sale.discount.toLocaleString()}</td>
        <td>₦${sale.vat.toLocaleString()}</td>
        <td>₦${sale.subtotal.toLocaleString()}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick='viewInvoice("${sale.invoiceNumber}")'>View</button>
        </td>
      </tr>
    `;
  });

  // Update summary cards
  document.getElementById("summaryGasKg").innerText = `${totalGasKg} kg`;
  document.getElementById("summaryGasTotal").innerText = `₦${totalGasAmount.toLocaleString()}`;

  document.getElementById("summaryAccessoryCount").innerText = `${accessoryCount} pcs`;
  document.getElementById("summaryAccessoryTotal").innerText = `₦${accessoryTotal.toLocaleString()}`;

  document.getElementById("summaryDiscountCount").innerText = discountCount;
  document.getElementById("summaryDiscount").innerText = `₦${totalDiscount.toLocaleString()}`;

  // Drafts Count
  const drafts = JSON.parse(localStorage.getItem("posDrafts")) || [];
  const now = Date.now();
  const validDrafts = drafts.filter(d => d.expiresAt > now);
  document.getElementById("summaryDraftsCount").innerText = validDrafts.length;

  // Payment Breakdown Table
  const paymentBody = document.querySelector("#payments tbody");
  paymentBody.innerHTML = "";
  for (const method in paymentBreakdown) {
    paymentBody.innerHTML += `
      <tr><td>${method}</td><td>₦${paymentBreakdown[method].toLocaleString()}</td></tr>
    `;
  }
}
*/

const salesStore = localforage.createInstance({
  name: 'POSApp',
  storeName: 'salesStore'
});

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

// Run on page load from localforage
window.addEventListener("DOMContentLoaded", async () => {
  try {
    const allSales = (await salesStore.getItem("sales")) || [];

   

        let cashier = "John Doe";
         let admin = null;

         
        try {
  const admin = JSON.parse(sessionStorage.getItem("admin"));
  if (admin && (admin.first_name || admin.last_name)) {
    cashier = `${admin.first_name || ""} ${admin.last_name || ""}`.trim() || "John Doe";
  }
} catch {
   showToast("Failed to load cashier info from session.", "success");
   showToast("Admin Data Not in Session", "success");
  console.error("❌ Error loading cashier info from sessionStorage");
}
  const admin_first_name = admin?.first_name || '';
  const admin_last_name = admin?.last_name || '';
  const admin_id = admin?.id || '';

    const dateFormatted = new Date().toLocaleDateString();

   const cashierEl = document.getElementById("reportCashier");

   
    const dateEl = document.getElementById("reportDate");
    const shiftEl = document.getElementById("reportShift");

    if (cashierEl) cashierEl.innerText = cashier;
    if (dateEl) dateEl.innerText = dateFormatted;
    if (shiftEl) shiftEl.innerText = "9:00 AM - 5:00 PM";


    const mySales = allSales.filter(sale => 
      sale.admin_id === admin_id &&  sale.admin_first_name === admin_first_name &&
      sale.admin_last_name === admin_last_name
    );

     const today = new Date().toLocaleDateString();
    const todaySales = mySales.filter(sale =>
      new Date(sale.dateTime).toLocaleDateString() === today
    );

    if (todaySales.length === 0) {
      document.getElementById("transactions").innerHTML =
        "<tr><td colspan='8' class='text-center'>No sales for today.</td></tr>";
      return;
    }

    // ✅ SET HEADER INFO




    // ✅ RENDER REPORT COMPONENTS
    renderTransactionTable(todaySales);
    renderSummaryCards(todaySales);
    renderPaymentBreakdown(todaySales);
    renderTopProducts(todaySales);
  } catch (error) {
    console.error("❌ Failed to load sales from localForage:", error);
  }
});

function formatPaymentMethod(method) {
  switch ((method || '').toLowerCase()) {
    case 'cash': return 'Cash';
    case 'credit_card': return 'Credit Card';
    case 'bank_transfer': return 'Bank Transfer';
    case 'split': return 'Split Payment';
    default: return 'Unknown';
  }
}
  
  
  
  function renderTransactionTable(sales) {
    const tableBody = document.querySelector("#transactions tbody");
    tableBody.innerHTML = ""; // Clear existing rows
  
    sales.forEach((sale, index) => {
      const row = document.createElement("tr");
  
      row.innerHTML = `
        <td>${sale.invoiceNumber}</td>
        <td>${new Date(sale.dateTime).toLocaleTimeString()}</td>
        <td>₦${sale.subtotal?.toLocaleString() || 0}</td>
        <td>${formatPaymentMethod(sale.paymentMethod || sale.payment_method)}</td>
        <td>₦${sale.discount?.toLocaleString() || 0}</td>
        <td>₦${sale.vat?.toLocaleString() || 0}</td>
        <td>₦${sale.total.toLocaleString()}</td>
        
        <td><button class="btn btn-sm btn-outline-primary" onclick="viewInvoice('${sale.invoiceNumber}')">View</button></td>
      `;
  
      tableBody.appendChild(row);
    });
  }

  async function viewInvoice(invoiceId) {
    try {
      const allSales = (await salesStore.getItem("sales")) || [];
      const sale = allSales.find(s => s.invoiceNumber === invoiceId);
  
      if (sale) {
        showInvoicePreview(sale); // Make sure this function is defined
      } else {
        alert("❌ Invoice not found.");
      }
    } catch (err) {
      console.error("❌ Error fetching invoice:", err);
      alert("An error occurred while fetching the invoice.");
    }
  }
  
  
  

  //this render for summary card daily sales 
  function renderSummaryCards(sales) {
    console.log("📊 Sales received:", sales);
  
    let gasKg = 0;
    let gasTotal = 0;
    let accessoryCount = 0;
    let accessoryTotal = 0;
    let discountCount = 0;
    let totalDiscount = 0;
  
    sales.forEach((sale, saleIndex) => {
      if (!sale.cart || !Array.isArray(sale.cart)) {
        console.warn(`🚫 Skipping sale at index ${saleIndex} – missing cart`, sale);
        return;
      }
  
      sale.cart.forEach(item => {
        if ( item.unit.toLowerCase() === "kg") {
          gasKg += parseFloat(item.qty);
          gasTotal += item.qty * item.price;
        } else {
          accessoryCount += item.qty;
          accessoryTotal += item.qty * item.price;
        }
      });
  
      if (sale.discount && sale.discount > 0) {
        discountCount += 1;
        totalDiscount += sale.discount;
      }
    });
  
    // Check today's drafts
    const drafts = JSON.parse(localStorage.getItem("posDrafts")) || [];
    const today = new Date().toLocaleDateString();
    const draftsToday = drafts.filter(d =>
      new Date(d.dateTime).toLocaleDateString() === today
    ).length;
  
    /*console.log("✅ Summary values:", {
      gasKg, gasTotal, accessoryCount, accessoryTotal, discountCount, totalDiscount, draftsToday
    });*/
  
    // Update UI
    document.getElementById("summaryGasKg").textContent = `${gasKg}kg`;
    document.getElementById("summaryGasTotal").textContent = `₦${gasTotal.toLocaleString()}`;
    document.getElementById("summaryAccessoryCount").textContent = `${accessoryCount} pcs`;
    document.getElementById("summaryAccessoryTotal").textContent = `₦${accessoryTotal.toLocaleString()}`;
    document.getElementById("summaryDiscountCount").textContent = discountCount;
    document.getElementById("summaryDiscount").textContent = `₦${totalDiscount.toLocaleString()}`;
    document.getElementById("summaryDraftsCount").textContent = draftsToday;
  }
  

  function renderPaymentBreakdown(sales) {
    const methodTotals = {};
  
    sales.forEach(sale => {
      const method = sale.paymentMethod || sale.payment_method ||  "Unknown";
      const amount = sale.total || 0;
  
      if (!methodTotals[method]) {
        methodTotals[method] = 0;
      }
  
      methodTotals[method] += amount;
    });
  
    const tbody = document.querySelector("#payments tbody");
    tbody.innerHTML = "";
  
    Object.entries(methodTotals).forEach(([method, amount]) => {
      tbody.innerHTML += `
        <tr>
          <td>${method.toUpperCase()}</td>
          <td>₦${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        </tr>
      `;
    });
  }
  
  function renderTopProducts(sales) {
    const productMap = {};
  
    sales.forEach(sale => {
      if (!sale.cart || !Array.isArray(sale.cart)) return;
  
      sale.cart.forEach(item => {
        const key = item.name;
  
        if (!productMap[key]) {
          productMap[key] = {
            name: item.name,
            qty: 0,
            total: 0
          };
        }
  
        productMap[key].qty += item.qty;
        productMap[key].total += item.qty * item.price;
      });
    });
  
    const sortedProducts = Object.values(productMap).sort((a, b) => b.qty - a.qty);
  
    const tbody = document.querySelector("#products tbody");
    tbody.innerHTML = "";
  
    if (sortedProducts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" class="text-center">No product sales recorded today.</td></tr>`;
      return;
    }
  
    sortedProducts.forEach(product => {
      tbody.innerHTML += `
        <tr>
          <td>${product.name}</td>
          <td>${product.qty}</td>
          <td>₦${product.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        </tr>
      `;
    });
  }

  
  function showInvoicePreview(sale) {
    if (!sale) return;
  
    // === OFFCANVAS PREVIEW ===
    document.getElementById("offcanvasSalesPoint").innerText = sale.salesPoint || "--";
    document.getElementById("offcanvasCustomer").innerText = sale.customerName || "--";
    document.getElementById("offcanvasCashier").innerText = sale.cashierName || "--";
    document.getElementById("receiptNumber").innerText = sale.invoiceNumber || "--";
    document.getElementById("receiptDate").innerText = sale.dateTime || "--";
    document.getElementById("receiptMethod").innerText = sale.paymentMethod || sale.payment_method || "--";
    document.getElementById("receiptSubtotal").innerText = `₦${(sale.subtotal || 0).toLocaleString()}`;
    document.getElementById("receiptDiscount").innerText = `₦${(sale.discount || 0).toLocaleString()}`;
    document.getElementById("receiptVat").innerText = `₦${(sale.vat || 0).toLocaleString()}`;
    document.getElementById("receiptTotal").innerText = `₦${(sale.total || 0).toLocaleString()}`;
  
    const offcanvasTable = document.getElementById("receiptItemBody");
    offcanvasTable.innerHTML = "";
    (sale.cart || sale.items || []).forEach(item => {
      offcanvasTable.innerHTML += `
        <tr>
          <td>${item.name}</td>
          <td>${item.qty}-${item.unit}</td>
          <td>₦${(item.qty * item.price).toLocaleString()}</td>
        </tr>`;
    });
  
    // === HIDDEN PRINTABLE RECEIPT SECTION ===
    document.querySelector(".sales-point").innerText = sale.salesPoint || "--";
    document.querySelector(".customer-name").innerText = sale.customerName || "--";
    document.querySelector(".cashier-name").innerText = sale.cashierName || "--";
    document.querySelector(".invoice-no").innerText = sale.invoiceNumber || "--";
    document.querySelector(".invoice-date").innerText = sale.dateTime || "--";
    document.querySelector(".payment-method").innerText = sale.paymentMethod || sale.payment_method || "--";
  
    // Fill printable table
    const printTable = document.querySelector("#invoice table tbody");
    printTable.innerHTML = "";
    (sale.cart || sale.items || []).forEach(item => {
      printTable.innerHTML += `
        <tr>
          <td>${item.name}</td>
          <td>${item.qty}-${item.unit}</td>
          <td>₦${(item.qty * item.price).toLocaleString()}</td>
        </tr>`;
    });
  
    // Show the preview offcanvas
    const preview = new bootstrap.Offcanvas(document.getElementById('confirmOffcanvas'));
    preview.show();
  }
  function printReceipt() {
    const invoiceSection = document.getElementById("invoice").innerHTML;
    const originalPage = document.body.innerHTML;
  
    document.body.innerHTML = invoiceSection;
    window.print();
  
    // Restore after print
    document.body.innerHTML = originalPage;
    location.reload(); // Optional to re-initialize scripts/UI
  }

  

async function syncUnsyncedSales() {
  console.log("syncUnsyncedSales called");
  try {
    const allSales = (await salesStore.getItem("sales")) || [];
    const unsynced = allSales.filter(s => !s.synced);
    console.log("Unsynced sales:", unsynced);

    if (unsynced.length === 0) {
      console.log("✅ No unsynced sales found.");
      return;
    }

    
    unsynced.forEach(sale => sale.synced = true);

    await salesStore.setItem("sales", allSales);
    console.log("✅ All unsynced sales have been marked as synced.");
  } catch (error) {
    console.error("❌ Sync failed:", error);
  }
}
  
  
console.log("Script loaded!");
window.addEventListener("online", syncUnsyncedSales);
window.addEventListener("DOMContentLoaded", () => {
  syncUnsyncedSales(); 
});