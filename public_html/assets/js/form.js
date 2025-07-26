
  // Store the currently active modal ID
  let currentModalId = null;

  // Function to open the offcanvas and track the modal that opened it
  function openOffcanvas(offcanvasId, modalIdToHide = null) {
    currentModalId = modalIdToHide;

    // Hide the modal if it exists
    if (modalIdToHide) {
      const modal = bootstrap.Modal.getInstance(document.getElementById(modalIdToHide));
      if (modal) modal.hide();
    }

    // Show the offcanvas
    const offcanvasEl = document.getElementById(offcanvasId);
    const offcanvas = new bootstrap.Offcanvas(offcanvasEl);
    offcanvas.show();
  }

  // Function to show success toast
  function showSuccessToast(message) {
    const toastElement = document.getElementById('successToast');
    const toastBody = toastElement.querySelector('.toast-body');
    toastBody.textContent = message;

    const toast = new bootstrap.Toast(toastElement);
    toast.show();
  }

  // Add Supplier - Reusable for any select dropdown
 function addSupplier() {
    const name = document.getElementById('supplierName').value.trim();
    const phone = document.getElementById('supplierPhone').value.trim();
    const email = document.getElementById('supplierEmail').value.trim();
    const address = document.getElementById('supplierAddress').value.trim();

 if (!name || !phone) {
    showToast("Please fill in all required fields.");
    return;
}

   
    const data = {
        supplier_name: name,
        contact_name: name,
        contact_phone_number: phone,
        email: email,
        address: address
    };

 
    fetch('http://localhost:3000/product_supplier', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(async response => {
        const resData = await response.json();
        if (!response.ok) {
            throw new Error(resData.error || "Failed to add supplier");
        }

        
        const supplierSelect = document.getElementById('supplier');
        if (supplierSelect) {
            const newOption = document.createElement('option');
            newOption.text = resData.supplier_name;
            newOption.value = resData.supplier_id;
            newOption.selected = true;
            supplierSelect.add(newOption);
        }

       
        const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('addSupplierModal'));
        if (offcanvas) offcanvas.hide();

       
        showSuccessToast("Supplier added successfully.");

        
        if (currentModalId) {
            const modal = new bootstrap.Modal(document.getElementById(currentModalId));
            modal.show();
            currentModalId = null; 
        }

        
        document.getElementById("addSupplierForm").reset();
    })
    .catch(err => {
        showToast(err.message || "Failed to add supplier.");
    });
}

  // Add Attribute
 function addAttributs() {
  const name = document.getElementById('attName').value.trim();


  if (!name) {
    showToast("Please fill in required fields.");
    return;
  }


  fetch('http://localhost:3000/attributes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attribute_name: name })
  })
  .then(async response => {
    const resData = await response.json();
    if (!response.ok) {
      throw new Error(resData.error || "Failed to add attribute");
    }

   
    const attrSelect = document.getElementById('attributs');
    if (attrSelect && !Array.from(attrSelect.options).some(opt => opt.value === name)) {
      const attrOption = document.createElement('option');
      attrOption.text = name;
      attrOption.value = name;
      attrSelect.add(attrOption);
      attrSelect.value = name;
    }



    const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('addattribute'));
    if (offcanvas) offcanvas.hide();

   
    showSuccessToast("Attribute added successfully.");

 
    if (currentModalId) {
      const modal = new bootstrap.Modal(document.getElementById(currentModalId));
      modal.show();
      currentModalId = null; // Reset
    }

    // Reset form
    document.getElementById("addAttributeForm")?.reset();
  })
  .catch(err => {
    showToast(err.message || "Failed to add attribute.");
  });
}


	function showToast(message, type = "success") {
    let toast = document.createElement("div");
    toast.className = `toast align-items-center text-bg-${type === "success" ? "success" : "danger"} border-0 show position-fixed top-0 end-0 m-3`;
    toast.style.zIndex = 9999;
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3500);
    toast.querySelector('.btn-close').onclick = () => toast.remove();
}





async function addUnit() {
  const unitName = document.getElementById('unit_name').value.trim();
  const categorySelect = document.getElementById('category');
  const selectedOption = categorySelect.options[categorySelect.selectedIndex];

 
  const category_id = selectedOption.value;
  const category_name = selectedOption.text;

  if (!unitName || !category_id || category_id === "Choose...") {
    showToast("Please fill in all required fields.");
    return;
  }

  const data = {
    category_id,
    category_name,
    unit_name: unitName
  };

  try {
    const response = await fetch('http://localhost:3000/product_unit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const resData = await response.json();
    if (!response.ok) {
      throw new Error(resData.error || "Failed to add unit");
    }

    const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('addUnitModal'));
    if (offcanvas) offcanvas.hide();

    showSuccessToast("Unit added successfully.");

  
    if (currentModalId) {
      const modal = new bootstrap.Modal(document.getElementById(currentModalId));
      modal.show();
      currentModalId = null;
    }


    document.getElementById("addUnitForm").reset();
  } catch (err) {
    showToast(err.message || "Failed to add unit.");
  }
}


async function populateCategoryDropdown() {
  const categorySelect = document.getElementById('category');
  if (!categorySelect) return;
  categorySelect.innerHTML = '<option selected disabled>Choose...</option>';
  try {
    const res = await fetch('http://localhost:3000/product_category');
    const categories = await res.json();
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.category_id;
      opt.text = cat.category_name;
      categorySelect.appendChild(opt);
    });
  } catch {
    console.error("Failed to fetch categories");
    const opt = document.createElement('option');
    opt.value = '';
    opt.text = 'No categories available';
    categorySelect.appendChild(opt);
  }
}

// Call populateCategoryDropdown() when the unit modal is opened
document.getElementById('addUnitModal')?.addEventListener('show.bs.offcanvas', populateCategoryDropdown);

    // Add Category
//      function addCategory() {
//     const input = document.getElementById('category_name');
//     const category_name = input.value.trim();
//     input.classList.remove('is-invalid');

//     if (!category_name) {
//         showToast("Category name is required", "danger");
//         input.classList.add('is-invalid');
//         return;
//     }

//     fetch('http://localhost:3000/product_category', {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ category_name })
//     })
//     .then(res => {
//         if (!res.ok) {
//             return res.json().then(data => {
//                 input.classList.add('is-invalid');
//                 if (res.status === 404) {
//                     showToast("Resource not found (404). Please try again later.", "danger");
//                 } else if (data.error === "Category name must be unique") {
//                     showToast("This category already exists. Please use a different name.", "danger");
//                 } else {
//                     showToast(data.error || "Failed to create category", "danger");
//                 }
//                 throw new Error(data.error || "Failed to create category");
//             });
//         }
//         return res.json();
//     })
//     .then(data => {
//         input.value = "";
//         input.classList.remove('is-invalid');
//         const offcanvas = bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('addCategory'));
//         if (offcanvas) offcanvas.hide();

//          showToast("Category created successfully", "success");

//         if (currentModalId) {
//         const modal = new bootstrap.Modal(document.getElementById(currentModalId));
//         modal.show();
//         currentModalId = null;     
//       }

//       document.getElementById("addCategoryForm").reset();

//     })
//     .catch(err => {
//         input.classList.add('is-invalid');
//         showToast("Network error. Please try again.", "danger");
//         console.error("Error:", err);
//     });



// }
//  function addCategory() {
//     const input = document.getElementById('category_name');
//     const category_name = input.value.trim();
//     input.classList.remove('is-invalid');

//     if (!category_name) {
//         showToast("Category name is required", "danger");
//         input.classList.add('is-invalid');
//         return;
//     }

//     const cateSelect = document.getElementById('categorydropdown');
//     if (cateSelect && !Array.from(cateSelect.options).some(opt => opt.value === category_name)) {
//         const cateOption = document.createElement('option');
//         cateOption.text = category_name;
//         cateOption.value = category_name;
//         cateSelect.add(cateOption); 
//         cateSelect.value = category_name; 
//     }

//     fetch('http://localhost:3000/product_category', {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ category_name })
//     })
//     .then(res => {
//         if (!res.ok) {
//             return res.json().then(data => {
//                 input.classList.add('is-invalid');
//                 if (res.status === 404) {
//                     showToast("Resource not found (404). Please try again later.", "danger");
//                 } else if (data.error === "Category name must be unique") {
//                     showToast("This category already exists. Please use a different name.", "danger");
//                 } else {
//                     showToast(data.error || "Failed to create category", "danger");
//                 }
//                 throw new Error(data.error || "Failed to create category");
//             });
//         }
//         return res.json();
//     })
//     .then(data => {
//         input.value = "";
//         input.classList.remove('is-invalid');
//         const offcanvas = bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('addCategory'));
//         if (offcanvas) offcanvas.hide();

//          showToast("Category created successfully", "success");

//         if (currentModalId) {
//         const modal = new bootstrap.Modal(document.getElementById(currentModalId));
//         modal.show();
//         currentModalId = null;     
//       }

//       document.getElementById("addCategoryForm").reset();

//     })
//     .catch(err => {
//         input.classList.add('is-invalid');
//         showToast("Network error. Please try again.", "danger");
//         console.error("Error:", err);
//     });



// }
 function addCategory() {
    const input = document.getElementById('category_name');
    const category_name = input.value.trim();
    input.classList.remove('is-invalid');

    if (!category_name) {
        showToast("Category name is required", "danger");
        input.classList.add('is-invalid');
        return;
    }

    // const cateSelect = document.getElementById('categorydropdown');
    // if (cateSelect && !Array.from(cateSelect.options).some(opt => opt.value === category_name)) {
    //     const cateOption = document.createElement('option');
    //     cateOption.text = category_name;
    //     cateOption.value = category_name;
    //     cateSelect.add(cateOption); 
    //     cateSelect.value = category_name; 
    // }

    fetch('http://localhost:3000/product_category', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_name })
    })
    .then(res => {
        if (!res.ok) {
            return res.json().then(data => {
                input.classList.add('is-invalid');
                if (res.status === 404) {
                    showToast("Resource not found (404). Please try again later.", "danger");
                } else if (data.error === "Category name must be unique") {
                    showToast("This category already exists. Please use a different name.", "danger");
                } else {
                    showToast(data.error || "Failed to create category", "danger");
                }
                throw new Error(data.error || "Failed to create category");
            });
        }
        return res.json();
    })
    .then(data => {
        input.value = "";
        input.classList.remove('is-invalid');
        const offcanvas = bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('addCategory'));
        if (offcanvas) offcanvas.hide();

         showToast("Category created successfully", "success");

        if (currentModalId) {
        const modal = new bootstrap.Modal(document.getElementById(currentModalId));
        modal.show();
        currentModalId = null;     
      } else {
         setTimeout(() => {
          window.location.reload();
       }, 1200);
      }
        loadCategories();
       document.getElementById("addCategoryForm").reset();

    })
    .catch(err => {
        input.classList.add('is-invalid');
        showToast("Network error. Please try again.", "danger");
        console.error("Error:", err);
    });



}

// document.getElementById('category_name').addEventListener('input', function() {
//     this.classList.remove('is-invalid');
// });
  
  
  // Add customer
  function addCustomer() {
    const name = document.getElementById('customerName').value.trim();
    const phone = document.getElementById('customephone').value.trim();
       const email = document.getElementById('customerEmail')?.value.trim() || "noemail@unknown.com";
      const gender = document.getElementById('customerGender')?.value || "unspecified";
       const status = "new";


    if (!name || !phone) {
      showToast("Please fill in required fields.");
      return;
    }

      fetch('http://localhost:3000/customer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer_fullname: name,
      customer_email: email,
      customer_contact_no: phone,
      customer_gender: gender,
      customer_status: status
    })
  })
  .then(async response => {
    const resData = await response.json();
    if (!response.ok) {
      throw new Error(resData.error || "Failed to add customer");
    }

   
    const custSelect = document.getElementById('customer');
    if (custSelect && !Array.from(custSelect.options).some(opt => opt.value === resData.customer_id)) {
      const custOption = document.createElement('option');
      custOption.text = name;
      custOption.value = resData.customer_id;
      custSelect.add(custOption);
      custSelect.value = resData.customer_id;
    }

    
    const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('addcustomer'));
    if (offcanvas) offcanvas.hide();

   
    showSuccessToast("New Customer added successfully.");

    
    if (currentModalId) {
      const modal = new bootstrap.Modal(document.getElementById(currentModalId));
      modal.show();
      currentModalId = null;
    }

    loadCustomers();
    document.getElementById("addCustomerForm").reset();

   
     
  })
  .catch(err => {
    console.error("Error adding customer:", err);
    
    showToast(err.message || "Failed to add customer.", "danger");
  });
}
  
  
  //add expenses scripts
   function addExpCategory() {
      const name = document.getElementById('ExpCate').value.trim();
     
  
      if (!name) {
        alert("Please fill in required fields.");
        return;
      }
  
      // Add attribute name to dropdown if not already present
      const expcateSelect = document.getElementById('expcategory');
      if (expcateSelect && !Array.from(expcateSelect.options).some(opt => opt.value === name)) {
        const expcateOption = document.createElement('option');
        expcateOption.text = name;
        expcateOption.value = name;
        expcateSelect.add(expcateOption);
        expcateSelect.value = name;
      }
  
      
  
      // Close offcanvas
      const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('expCatModal'));
      if (offcanvas) offcanvas.hide();
  
      // Show success toast
      showSuccessToast("Expenses Category added successfully.");
  
      // Reopen the modal that triggered the offcanvas if any
      if (currentModalId) {
        const modal = new bootstrap.Modal(document.getElementById(currentModalId));
        modal.show();
        currentModalId = null; // Reset
      }
  
      // Reset form
      document.getElementById("addExpForm").reset();
    }
  
  
  // Reusable triggers to open forms from any modal context
  function openAddSupplierModal(fromModalId = null) {
    openOffcanvas('addSupplierModal', fromModalId);
  }


    function openAddUnitModal(fromModalId = null) {
    openOffcanvas('addUnitModal', fromModalId);
  }


  function openAddAttribute(fromModalId = null) {
    openOffcanvas('addattribute', fromModalId);
  }

  function openAddAttributeValue(fromModalId = null) {
    openOffcanvas('addAttributeValue', fromModalId);
  }


  function openAddCategoryModal(fromModalId = null) {
    openOffcanvas('addCategory', fromModalId);
  }

function openAddCustomer(fromModalId = null) {
    openOffcanvas('addcustomer', fromModalId);
  }
  function openExpCat(fromModalId = null) {
    openOffcanvas('expCatModal', fromModalId);
  }

  //function to tax inputes 
  function toggleTaxFields() {
    const isChecked = document.getElementById('isTaxable').checked;
    document.getElementById('taxFields').style.display = isChecked ? 'block' : 'none';
  }
  
//   function loadCategories() {
//     const select = document.getElementById('categorydropdown');
//     if (!select) {
//         console.error('No element with id categorydropdown found!');
//         showToast('No category dropdown found', 'danger');
//         return;
//     }
//     select.innerHTML = '<option selected disabled>Loading...</option>';
//     fetch('http://localhost:3000/product_category')
//         .then(res => {
//             if (!res.ok) throw new Error('Failed to fetch categories');
//             return res.json();
//         })
//         .then(data => {
//             select.innerHTML = '<option selected disabled>Choose...</option>';
//             if (Array.isArray(data) && data.length > 0) {
//                 data.forEach(cat => {
//                     const opt = document.createElement('option');
//                     opt.value = cat.category_id;
//                     opt.textContent = cat.category_name;
//                     select.appendChild(opt);
//                 });
//             } else {
//                 select.innerHTML = '<option selected disabled>No categories found</option>';
//             }
//         })
//         .catch(err => {
//             select.innerHTML = '<option selected disabled>Failed to load categories</option>';
//             showToast('Failed to load categories', 'danger');
//             console.error(err);
//         });
// }

// function addProduct() {
//     const form = document.getElementById('addProductForm');
//     const formData = new FormData(form);

//     if (!form.product_name.value.trim()) {
//         showToast('Product name is required', 'danger');
//         return;
//     }
//     if (form.category_id.selectedIndex <= 0) {
//         showToast('Please select a category', 'danger');
//         return;
//     }
//     if (!form.brand.value.trim()) {
//         showToast('Brand is required', 'danger');
//         return;
//     }
//     if (!form.unit_name.value.trim()) {
//         showToast('Unit is required', 'danger');
//         return;
//     }
//     if (!form.product_alert_limit.value.trim()) {
//         showToast('Alert limit is required', 'danger');
//         return;
//     }
//     if (!form.product_description.value.trim()) {
//         showToast('Description is required', 'danger');
//         return;
//     }
//     if (!form.product_featured_image.value) {
//         showToast('Product image is required', 'danger');
//         return;
//     }

//     const catSelect = form.category_id;
//     formData.append('category_name', catSelect.options[catSelect.selectedIndex].text);

//     fetch('http://localhost:3000/product', {
//         method: 'POST',
//         body: formData
//     })
//     .then(res => res.json().then(data => ({ ok: res.ok, data })))
//     .then(({ ok, data }) => {
//         if (!ok) throw new Error(data.error || 'Failed to create product');
//         showToast('Product created successfully', 'success');
//         form.reset();
//         setTimeout(() => window.location.reload(), 1200);
//     })
//     .catch(err => {
//         showToast(err.message || 'Network error. Please try again.', 'danger');
//     });
// }

// loadCategories();


//



