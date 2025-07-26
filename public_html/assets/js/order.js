
	document.addEventListener("DOMContentLoaded", function () {
	  let productCount = 0;
	  const productTableBody = document.getElementById('productTableBody');
	  const productCountSpan = document.getElementById('productCount');
	  const totalAmountSpan = document.getElementById('totalAmount');
  
	  const productSelect = document.getElementById('productSelect');
	  const variationSelect = document.getElementById('variationSelect');
  
	  document.getElementById('addProductBtn').addEventListener('click', () => {
		const product = productSelect.value;
		const variation = variationSelect.value;
  
		if (!product || !variation) {
		  alert('Please select both product and variation.');
		  return;
		}
  
		// 1. Prevent duplicate entries
		const rows = productTableBody.querySelectorAll('tr');
		for (const row of rows) {
		  const rowProduct = row.cells[0].textContent;
		  const rowVariation = row.cells[1].textContent;
		  if (rowProduct === product && rowVariation === variation) {
			alert('This product and variation combination is already added.');
			return;
		  }
		}
  
		const row = document.createElement('tr');
		row.innerHTML = `
		  <td>${product}</td>
		  <td>${variation}</td>
		  <td><input type="number" class="form-control qty" min="1" value="1"></td>
		  <td><input type="text" class="form-control price" min="0" value="0"></td>
		  <td class="subtotal">0.00</td>
		  <td><button type="button" class="btn btn-danger btn-sm remove">Remove</button></td>
		`;
		productTableBody.appendChild(row);
  
		productCount++;
		productCountSpan.textContent = productCount;
  
		// Calculate and update subtotal for the initial values
		updateRowSubtotal(row);
  
		// Auto-focus quantity field (feature #2)
		const qtyInput = row.querySelector('.qty');
		qtyInput.focus();
  
		// Attach listeners for qty and price changes
		row.querySelectorAll('.qty, .price').forEach(input => {
		  input.addEventListener('input', () => updateRowSubtotal(row));
		});
  
		// Attach listener for remove button with confirmation (feature #3)
		row.querySelector('.remove').addEventListener('click', () => {
		  if (confirm('Are you sure you want to remove this product?')) {
			row.remove();
			productCount--;
			productCountSpan.textContent = productCount;
			updateTotals();
		  }
		});
  
		// Clear dropdowns after adding (feature #4)
		productSelect.value = '';
		variationSelect.value = '';
	  });
  
	  function updateRowSubtotal(row) {
		const qty = parseFloat(row.querySelector('.qty').value) || 0;
		const price = parseFloat(row.querySelector('.price').value) || 0;
		const subtotal = qty * price;
		row.querySelector('.subtotal').textContent = subtotal.toFixed(2);
		updateTotals();
	  }
  
	  function updateTotals() {
		let total = 0;
		document.querySelectorAll('.subtotal').forEach(cell => {
		  total += parseFloat(cell.textContent) || 0;
		});
		totalAmountSpan.textContent = total.toFixed(2);
	  }
	});
  