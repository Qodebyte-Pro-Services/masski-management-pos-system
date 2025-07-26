
    

	// Select all filter buttons active 
	const filterButtons = document.querySelectorAll('.btn-filter');

filterButtons.forEach(button => {
  button.addEventListener('click', () => {
	// Remove 'active' from all buttons
	filterButtons.forEach(btn => btn.classList.remove('active'));

	// Add 'active' to the clicked button
	button.classList.add('active');

	// Optional: Handle filtering logic here
	const selectedCategory = button.textContent.trim();
	console.log('Filter selected:', selectedCategory);

	// You can now show/hide products based on selectedCategory
  });
});


//for popover and triger modal from table

document.addEventListener('DOMContentLoaded', function () {
  const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
  const popoverInstances = [];

  popoverTriggerList.forEach(function (triggerEl) {
    const popover = new bootstrap.Popover(triggerEl, {
      html: true,
      trigger: 'manual'
    });

    popoverInstances.push({ triggerEl, popover });

    triggerEl.addEventListener('click', function (e) {
      e.stopPropagation();

      // Close all other popovers
      popoverInstances.forEach(({ triggerEl: el, popover: p }) => {
        if (el !== triggerEl) p.hide();
      });

      // Toggle current popover
      popover.toggle();
    });
  });

  // Close popover when clicking outside
  document.body.addEventListener('click', function () {
    popoverInstances.forEach(({ popover }) => popover.hide());
  });

  // Handle modal link clicks inside popovers
  document.body.addEventListener('click', function (e) {
    const target = e.target;

    // Handle Edit Variation modal
    if (target.classList.contains('open-edit-modal')) {
      e.preventDefault();
      closeAllPopovers(popoverInstances);
      const modal = new bootstrap.Modal(document.getElementById('EditvariationModel'));
      modal.show();
    }

    // Handle Edit supplier modal
    if (target.classList.contains('open-edit-supplier')) {
      e.preventDefault();
      closeAllPopovers(popoverInstances);
      const modal = new bootstrap.Modal(document.getElementById('EditsupplierModel'));
      modal.show();
    }

    // Handle Edit Attributes modal (add more if needed)
    if (target.classList.contains('open-edit-attributes')) {
      e.preventDefault();
      closeAllPopovers(popoverInstances);
      const modal = new bootstrap.Modal(document.getElementById('EditattributsModel')); // replace with correct ID
      modal.show();
    }
  });

  function closeAllPopovers(instances) {
    instances.forEach(({ popover }) => popover.hide());
  }
});

  
// Get references to elements
const customBtn = document.getElementById('customRangeBtn');
const rangeContainer = document.getElementById('customRangeContainer');
const btnFilter = document.getElementById('btnfilter');

// Toggle custom range input when clicking on Custom Range button
customBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // prevent bubbling if needed
    if (rangeContainer.style.display === 'none' || rangeContainer.style.display === '') {
        rangeContainer.style.display = 'block';
        btnFilter.style.display = 'none';
    } else {
        rangeContainer.style.display = 'none';
        btnFilter.style.display = 'flex';
    }
});

// Hide custom range when other filter buttons are clicked
const filterdButtons = btnFilter.querySelectorAll('.btn-range');
filterdButtons.forEach(button => {
    if (button !== customBtn) {
        button.addEventListener('click', () => {
            rangeContainer.style.display = 'none';
            btnFilter.style.display = 'flex';
        });
    }
});

 	