
						async function includeHTML(id, path) {
						  const res = await fetch(path);
						  const html = await res.text();
						  document.getElementById(id).innerHTML = html;
					  
   if (id === "Sidebar") {
        highlightActiveSidebarLink();
        attachLogoutHandler(); 
          checkAccess();
          LogoFetch();
          inactiveLogout()
         setTimeout(applyRolePermissions, 200);
    }
						  if (id === "header") {
                 updateAdminInfo();
                 loadNotifications();
                 limitAction();
                  hideBellPOS();
                 updateNotificationLabel();
                 populateCategorySelect();
                 attachSecondLogoutHandler();
                 const nextBtn = document.getElementById('notification-next');
    const prevBtn = document.getElementById('notification-prev');

    const closeBtn = document.getElementById('close-notification-dropdown');

     if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      const dropdown = bootstrap.Dropdown.getOrCreateInstance(document.querySelector('.header-action-icon[data-bs-toggle="dropdown"]'));
      dropdown.hide();
    });
  }

    if (nextBtn) {
      nextBtn.onclick = function () {
        notificationPage++;
        loadNotifications(notificationPage);
      };
    }
    
     if (prevBtn) {
      prevBtn.onclick = function () {
        if (notificationPage > 1) notificationPage--;
        loadNotifications(notificationPage);
      };
    }
              }; 

               if (id === "footer") {
                updateFooterCompanyName();
              }
						}

function attachLogoutHandler() {
    const logoutBtn = document.getElementById('log-outside');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function (e) {
            e.preventDefault();
            let admin_role = '';
            try {
                const adminStr = sessionStorage.getItem('admin');
                if (adminStr) {
                    const admin = JSON.parse(adminStr);
                    admin_role = admin?.admin_role || '';
                }
                await fetch('http://localhost:3000/logout', {
                    method: 'POST',
                    credentials: 'include'
                });
            } catch (err) {
                console.error('Logout failed:', err);
                showToast('Logout failed. Please try again.', 'danger');
            }
           
            if (admin_role === 'super_admin' || admin_role === 'dev') {
                window.location.href = '../account/login';
                 sessionStorage.removeItem('admin');
            } else {
                window.location.href = '../staff-login';
                 sessionStorage.removeItem('admin');
            }
        });
    }
}

function attachSecondLogoutHandler() {
    const secondLogoutBtn = document.getElementById('secondLogout');
    if (secondLogoutBtn) {
        secondLogoutBtn.addEventListener('click', async function (e) {
            e.preventDefault();
            let admin_role = '';
            try {
                const adminStr = sessionStorage.getItem('admin');
                if (adminStr) {
                    const admin = JSON.parse(adminStr);
                    admin_role = admin?.admin_role || '';
                }
                await fetch('http://localhost:3000/logout', {
                    method: 'POST',
                    credentials: 'include'
                });
            } catch (err) {
                console.error('Logout failed:', err);
                showToast('Logout failed. Please try again.', 'danger');
            }
          
            if (admin_role === 'super_admin' || admin_role === 'dev') {
                window.location.href = '../account/login';
                  sessionStorage.removeItem('admin');
            } else {
                window.location.href = '../staff-login';
                  sessionStorage.removeItem('admin');
            }
        });
    }
}
					  
						function highlightActiveSidebarLink() {
							// Normalize current path
							let currentPath = window.location.pathname
							  .replace(/\/index\.html$/, '')
							  .replace(/\/$/, '');
						  
							const navLinks = document.querySelectorAll('.sidebar-menu a');
						  
							navLinks.forEach(link => {
							  let href = link.getAttribute('href')
								.replace(/\/index\.html$/, '')
								.replace(/\/$/, '');
						  
							  // Resolve href to full path
							  const linkPath = new URL(href, window.location.origin).pathname
								.replace(/\/index\.html$/, '')
								.replace(/\/$/, '');
						  
							  // Check if current path starts with the link path
							  if (currentPath.startsWith(linkPath)) {
								navLinks.forEach(l => l.parentElement.classList.remove('active', 'current-page'));
								link.parentElement.classList.add('active', 'current-page');
							  }
							});
						  }
						  
					  
						includeHTML("footer", "../component/footer.html");
						includeHTML("Sidebar", "../component/sidebar.html");
                        includeHTML("header", "../component/header.html");
                        includeHTML("model", "../component/model.html");


function updateAdminInfo() {
	console.log('Updating admin info...');
    let admin = { first_name: '', last_name: '', admin_role: '' };
    try {
        const adminStr = sessionStorage.getItem('admin');
        if (adminStr) {
            const parsed = JSON.parse(adminStr);
            admin.first_name = parsed.first_name || '';
            admin.last_name = parsed.last_name || '';
            admin.admin_role = parsed.role || 'Admin';
        }
    } catch {}

    const fullNameElem = document.getElementById('full_name');
    if (fullNameElem) {
        fullNameElem.textContent = `${admin.first_name} ${admin.last_name}`.trim() || 'User';
    }

    const firstNameElem = document.getElementById('first-name');
    if (firstNameElem) {
        firstNameElem.textContent = admin.first_name || 'User';
    }

    const adminRoleElem = document.getElementById('admin-role');
    if (adminRoleElem) {
        adminRoleElem.textContent = admin.admin_role || 'Admin';
    }

    const greetingSpan = firstNameElem?.parentElement;
    if (greetingSpan) {
        const hour = new Date().getHours();
        let greeting = 'Good Morning, ';
        if (hour >= 12 && hour < 17) {
            greeting = 'Good Afternoon, ';
        } else if (hour >= 17 || hour < 5) {
            greeting = 'Good Evening, ';
        }
        greetingSpan.childNodes[0].nodeValue = greeting;
    }
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


let notificationPage = 1;
const notificationLimit = 5;

async function loadNotifications() {
    let admin_id = null;
     let admin_role = null;
    try {
        const admin = JSON.parse(sessionStorage.getItem('admin'));
        admin_id = admin?.id;
         admin_role = admin?.admin_role;
    } catch {}
    if (!admin_id) return;

    try {
        const res = await fetch(`http://localhost:3000/admin/notifications/${admin_id}?page=${notificationPage}&limit=${notificationLimit}`);
        const data = await res.json();
        const notifications = data.notifications || [];
        const list = document.getElementById('notification-list');
        if (!list) return;

         if (admin_role !== 'super_admin' && admin_role !== 'manager' && admin_role !== 'dev') {
            notifications = notifications.filter(n => n.type === 'low_stock');
            list.innerHTML = notifications.length === 0
                ? `<div class="dropdown-item text-center text-muted">No notifications</div>`
                : notifications.map(n => renderLowStockNotificationSimple(n)).join('');
        } else {
            list.innerHTML = notifications.length === 0
                ? `<div class="dropdown-item text-center text-muted">No notifications</div>`
                : notifications.map(n => renderNotification(n)).join('');
        }

        document.getElementById('notification-prev').style.display = notificationPage > 1 ? 'block' : 'none';
        document.getElementById('notification-next').style.display = notifications.length === notificationLimit ? 'block' : 'none';
    } catch (e) {
        const list = document.getElementById('notification-list');
        if (list) list.innerHTML = `<div class="dropdown-item text-center text-danger">Failed to load notifications</div>`;
    }
}


function timeAgo(date) {
    if (!date) return '';
    const now = new Date();
    const then = new Date(date);
    const diff = Math.floor((now - then) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff/60)} mins ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)} hours ago`;
    return `${Math.floor(diff/86400)} days ago`;
}

function renderNotification(n) {
    if (n.type === 'login_attempt') {
        if (n.status === 'pending_approval') {
            return `
            <div style="width: 100%; box-sizing:border-box" class="dropdown-item">
              <div class="d-flex py-2 border-bottom">
                <div class="icon-box md bg-danger rounded-circle me-3">
                  <i class="bi bi-exclamation-octagon text-white fs-4"></i>
                </div>
                <div class="m-0">
                  <h6 class="mb-1 fw-semibold">New Device Detected</h6>
                  <p class="mb-2">New Device Detected IP: ${n.ip_address || '--'}</p>
                  <div class="d-flex flex-wrap gap-2">
                    <p class="mb-2">Device: ${n.device_info || n.user_agent || '--'}</p>
                    <button type="button" class="btn btn-success btn-sm" onclick="approveDevice('${n.ref_id}', true)">Approve</button>
                    <button type="button" class="btn btn-danger btn-sm" onclick="approveDevice('${n.ref_id}', false)">Block</button>
                  </div>
                  <p class="small m-0 text-secondary">${timeAgo(n.login_time)}</p>
                </div>
              </div>
            </div>`;
        }
        if (n.status === 'pending_otp') {
            return `
            <div style="width: 100%; box-sizing:border-box" class="dropdown-item">
              <div class="d-flex py-2 border-bottom">
                <div class="icon-box md bg-danger rounded-circle me-3">
                  <i class="bi bi-exclamation-octagon text-white fs-4"></i>
                </div>
                <div class="m-0">
                  <h6 class="mb-1 fw-semibold">OTP Approval</h6>
                  <p class="mb-2">Staff ${n.email} is attempting to log in.</p>
                  <div class="d-flex flex-wrap gap-2">
                    <p class="mb-2">Send this OTP to the staff: <span class="fw-bold">${n.otp_code || '******'}</span></p>
                    <button type="button" class="btn btn-primary btn-sm" onclick="navigator.clipboard.writeText('${n.otp_code || ''}')">Copy OTP</button>
                  </div>
                  <p class="small m-0 text-secondary">${timeAgo(n.login_time)}</p>
                </div>
              </div>
            </div>`;
        }
        if (n.status === 'otp_verified') {
            return `
            <div style="width: 100%; box-sizing:border-box" class="dropdown-item">
              <div class="d-flex py-2 border-bottom">
                <div class="icon-box md bg-success rounded-circle me-3">
                  <i class="bi bi-exclamation-triangle text-white fs-4"></i>
                </div>
                <div class="m-0">
                  <h6 class="mb-1 fw-semibold">Staff Login Detected</h6>
                  <p class="mb-1 ">${n.email} just logged in from IP: ${n.ip_address || '--'}</p>
                  <p class="small m-0 text-secondary">${timeAgo(n.login_time)}</p>
                </div>
              </div>
            </div>`;
        }
    }
    if (n.type === 'low_stock') {
        return `
        <div style="width: 100%; box-sizing:border-box" class="dropdown-item">
          <div class="d-flex py-2 border-bottom">
            <div class="icon-box md bg-warning rounded-circle me-3">
              <i class="bi bi-exclamation-square text-white fs-4"></i>
            </div>
            <div class="m-0">
              <h6 class="mb-1 fw-semibold">Low Stock Alert</h6>
              <p class="mb-2">${n.product_name} has reached the minimum threshold.</p>
              <div class="d-flex flex-wrap gap-2">
                <p class="mb-2">Remaining: ${n.current_variations_stock_qty_number} units.</p>
                <button type="button" class="btn btn-success btn-sm">Reorder</button>
                <button type="button" class="btn btn-secondary btn-sm">View Inventory</button>
              </div>
              <p class="small m-0 text-secondary">${timeAgo(n.created_at || n.date)}</p>
            </div>
          </div>
        </div>`;
    }
    if (n.type === 'stock_modification') {
   return `
    <div class="dropdown-item w-100">
      <div class="d-flex py-2 border-bottom w-100">
        <div class="icon-box md bg-secondary rounded-circle me-3">
          <i class="bi bi-box-seam text-white fs-4"></i>
        </div>
        <div class="m-0 flex-grow-1">
          <h6 class="mb-1 fw-semibold">Stock ${n.adjustment_action === 'increase' ? 'Increase' : 'Decrease'}</h6>
          <p class="mb-2">${n.product_name} (${n.adjustment_type || ''})</p>
          <p class="mb-2">Qty: ${n.size} | By: ${n.performed_by || 'System'}</p>
          <p class="small m-0 text-secondary">${timeAgo(n.date)}</p>
        </div>
      </div>
    </div>
  `;
}
    if (n.type === 'expense_approval') {
        return `
        <div style="width: 100%; box-sizing:border-box" class="dropdown-item">
          <div class="d-flex py-2 border-bottom">
            <div class="icon-box md bg-info rounded-circle me-3">
              <i class="bi bi-cash-coin text-white fs-4"></i>
            </div>
            <div class="m-0">
              <h6 class="mb-1 fw-semibold">Expense Approval Needed</h6>
              <p class="mb-2">${n.expense_category_name}: ₦${n.amount} - ${n.description}</p>
              <div class="d-flex flex-wrap gap-2">
              <button type="button" class="btn btn-success btn-sm" onclick="approveExpense('${n.ref_id}')">Approve</button>
              <button type="button" class="btn btn-danger btn-sm" onclick="rejectExpense('${n.ref_id}')">Reject</button>
              </div>
              <p class="small m-0 text-secondary">${timeAgo(n.date)}</p>
            </div>
          </div>
        </div>`;
    }
    if (n.type === 'staff_surcharge') {
    return `
      <div style="width: 100%; box-sizing:border-box" class="dropdown-item">
        <div class="d-flex py-2 border-bottom">
          <div class="icon-box md bg-warning rounded-circle me-3">
            <i class="bi bi-cash-stack text-white fs-4"></i>
          </div>
          <div class="m-0">
            <h6 class="mb-1 fw-semibold">Surcharge Added</h6>
            <p class="mb-2">₦${n.amount} surcharge for ${n.full_name} $: ${n.reason}</p>
            <p class="small m-0 text-secondary">${timeAgo(n.date)}</p>
          </div>
        </div>
      </div>`;
}
if (n.type === 'staff_added') {
    return `
      <div style="width: 100%; box-sizing:border-box" class="dropdown-item">
        <div class="d-flex py-2 border-bottom">
          <div class="icon-box md bg-success rounded-circle me-3">
            <i class="bi bi-person-plus text-white fs-4"></i>
          </div>
          <div class="m-0">
            <h6 class="mb-1 fw-semibold">New Staff Added</h6>
            <p class="mb-2">${n.full_name} (${n.email})</p>
            <p class="small m-0 text-secondary">${timeAgo(n.date)}</p>
          </div>
        </div>
      </div>`;
}
if (n.type === 'shift_change') {
    return `
      <div style="width: 100%; box-sizing:border-box" class="dropdown-item">
        <div class="d-flex py-2 border-bottom">
          <div class="icon-box md bg-info rounded-circle me-3">
            <i class="bi bi-arrow-repeat text-white fs-4"></i>
          </div>
          <div class="m-0">
            <h6 class="mb-1 fw-semibold">Staff Shift Changed</h6>
            <p class="mb-2"> ${n.type} for ${n.fullname} Work days: ${n.work_days
} will work for ${n.working_hours}</p>
            <p class="small m-0 text-secondary">${timeAgo(n.date)}</p>
          </div>
        </div>
      </div>`;
}
    if (n.type === 'activity_log') {
        return `
        <div style="width: 100%; box-sizing:border-box" class="dropdown-item">
          <div class="d-flex py-2 border-bottom">
            <div class="icon-box md bg-primary rounded-circle me-3">
              <i class="bi bi-info-circle text-white fs-4"></i>
            </div>
            <div class="m-0">
              <h6 class="mb-1 fw-semibold">${n.activity_type}</h6>
              <p class="mb-2">${n.description}</p>
              <p class="small m-0 text-secondary">${timeAgo(n.created_at)}</p>
            </div>
          </div>
        </div>`;
    }
    
    return '';
}


function renderLowStockNotificationSimple(n) {
    return `
    <div style="width: 100%; box-sizing:border-box" class="dropdown-item">
      <div class="d-flex py-2 border-bottom">
        <div class="icon-box md bg-warning rounded-circle me-3">
          <i class="bi bi-exclamation-square text-white fs-4"></i>
        </div>
        <div class="m-0">
          <h6 class="mb-1 fw-semibold">Low Stock Alert</h6>
          <p class="mb-2">${n.product_name} has reached the minimum threshold.</p>
          <p class="mb-2">Remaining: ${n.current_variations_stock_qty_number} units.</p>
          <p class="small m-0 text-secondary">${timeAgo(n.created_at || n.date)}</p>
        </div>
      </div>
    </div>`;
}


window.approveDevice = async function (login_attempt_id, approve) {
    try {
        const admin = JSON.parse(sessionStorage.getItem('admin'));
        const admin_id = admin?.id;
        if (!admin_id) {
            showToast('No admin in session', 'danger');
            return;
        }
        const res = await fetch(`http://localhost:3000/approve-device/${admin_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ login_attempt_id, approve })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to update device approval');
        showToast(data.message, 'success');
        setTimeout(() => {
            window.location.reload();
          }, 2000);
    } catch (err) {
        showToast('Error: ' + err.message, 'danger');
    }
};

window.approveExpense = async function(id) {
    if (!id) {
        showToast('Invalid expense ID', 'danger');
        return;
    }
    if (!confirm("Approve this expense?")) return;
    try {
        const res = await fetch(`http://localhost:3000/expense/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                expense_status: 'approved',
                approved_by: getApprovedBy()
            })
        });
        const data = await res.json();
        if (data.message === 'Expense updated') {
            showToast('Expense approved successfully', 'success');
             setTimeout(() => {
            window.location.reload();
        }, 2000);
        } else {
            throw new Error(data.error || 'Approval failed');
        }
    } catch (error) {
        showToast('Failed to approve expense', 'danger');
    }
};

window.rejectExpense = async function(id) {
    if (!id) {
        showToast('Invalid expense ID', 'danger');
        return;
    }
    if (!confirm("Reject this expense?")) return;
    try {
        const res = await fetch(`http://localhost:3000/expense/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                expense_status: 'rejected',
                approved_by: getApprovedBy()
            })
        });
        const data = await res.json();
        if (data.message === 'Expense updated') {
            showToast('Expense rejected successfully', 'success');
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } else {
            throw new Error(data.error || 'Rejection failed');
        }
    } catch (error) {
        showToast('Failed to reject expense', 'danger');
    }
};


function getApprovedBy() {
    try {
        const admin = JSON.parse(sessionStorage.getItem('admin'));
        return admin?.first_name + ' ' + admin?.last_name || admin?.id || 'Admin';
    } catch {
        return 'Admin';
    }
}


async function updateNotificationLabel() {
    let admin_id = null;
    try {
        const admin = JSON.parse(sessionStorage.getItem('admin'));
        admin_id = admin?.id;
    } catch {}
    if (!admin_id) return;

    try {
        const res = await fetch(`http://localhost:3000/admin/notifications-count/${admin_id}`);
        const data = await res.json();
        const label = document.getElementById('notification-label');
        if (label) label.textContent = data.count > 0 ? data.count : '';
    } catch (e) {
        console.error('Failed to update notification label:', e);
        const label = document.getElementById('notification-label');
        if (label) label.textContent = '';
        showToast('Failed to update notification count', 'danger');
    }
}


async function applyRolePermissions() {
  
    let admin = null;
    try {
        admin = JSON.parse(sessionStorage.getItem('admin'));
    } catch {}
    if (!admin || !admin.admin_role) return;

   
    if (admin.admin_role === 'super_admin' || admin.admin_role === 'dev') return;

    
    let roles = [];
    try {
        const res = await fetch('http://localhost:3000/roles');
        roles = await res.json();
    } catch {
        showToast('Failed to load roles', 'danger');
        return;
    }

   
    const adminRole = roles.find(r => r.role_name === admin.admin_role);
    if (!adminRole) return;

    const permissions = adminRole.permissions || {};

    
    const sidebarMap = {
        Dashboard: { selector: 'a[href*="../dashboard/"]', perm: 'Dashboard_index' },
        Inventory: { selector: 'a[href*="../inventory/"]', perm: 'Inventory_index' },
        Sales: { selector: 'a[href*="../sales/"]', perm: 'Sales_index' },
        Finances: { selector: 'a[href*="../finance/"]', perm: 'Finance_index' },
        Customers: { selector: 'a[href*="../customer/"]', perm: 'Customer_index' },
        Staff: { selector: 'a[href*="../staffs/"]', perm: 'Staff_index' },
        Suppliers: { selector: 'a[href*="../supplier/"]', perm: 'Supplier_index' },
        Settings: { selector: 'a[href*="../setting/"]', perm: 'Setting_index' }
    };

    Object.values(sidebarMap).forEach(item => {
        const link = document.querySelector(item.selector);
        if (link && !permissions[item.perm]) {
            link.closest('li').style.display = 'none';
        }
    });

    
    const pagePermMap = [
       

       
        { folder: 'customer', pages: ['detail.html','index.html','invoice.html'] },
       
        { folder: 'dashboard', pages: ['index.html'] },
       
        { folder: 'finance', pages: ['budget.html','exp-detail.html','expenses.html','index.html','tax.html'] },
        
        { folder: 'inventory', pages: ['detail.html','index.html','po.html'] },
      
        { folder: 'sales', pages: ['index.html','invoice.html','pos.html','reports-details.html','reports.html','sales-reports.html'] },
      
        { folder: 'setting', pages: ['index.html'] },
      
        { folder: 'staffs', pages: ['detail.html','index.html'] },
       
        { folder: 'supplier', pages: ['detail.html','index.html','invoice.html'] }
    ];

    
    const pathParts = window.location.pathname.split('/');
    const folder = pathParts[pathParts.length - 2] || '';
    const page = pathParts[pathParts.length - 1] || '';

    
    let permKey = null;
    for (const group of pagePermMap) {
        if (group.pages.includes(page)) {
            permKey = `${group.folder}_${page.replace('.html','')}`;
            break;
        }
    }

    
    if (permKey && permissions[permKey] === false) {
        document.body.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;height:100vh;">
                <div class="text-center">
                    <h2>Access Denied</h2>
                    <p>You do not have permission to view this page.</p>
                </div>
            </div>
        `;
        return;
    }
}

function checkAccess() {
  const adminStr = sessionStorage.getItem('admin');
  if (!adminStr) {
    showToast('You must be logged in to access this page.', 'danger');
    window.location.href = '../account/login';
    return;
  }

  try {
    const admin = JSON.parse(adminStr);
    if (!admin.id || !admin.admin_role) {
      showToast('You must be logged in to access this page.', 'danger');
      window.location.href = '../account/login';
    }
  } catch (err) {
    console.error('Invalid admin session data');
    window.location.href = '../account/login';
  }
}

function inactiveLogout() {
    let timeout;
    const logoutAfter = 30 * 60 * 1000; 
    function doLogout() {
        try {
            const adminStr = sessionStorage.getItem('admin');
            let admin_role = '';
            if (adminStr) {
                const admin = JSON.parse(adminStr);
                admin_role = admin?.admin_role || '';
            }
            sessionStorage.clear();
            fetch('http://localhost:3000/logout', {
                method: 'POST',
                credentials: 'include'
            }).finally(() => {

                if (admin_role === 'super_admin' || admin_role === 'dev') {
                   sessionStorage.removeItem('admin');
                    window.location.href = '../account/login';
                } else {
                   sessionStorage.removeItem('admin');
                    window.location.href = '../staff-login';
                }
            });
        } catch {
           sessionStorage.removeItem('admin');
            window.location.href = '../staff-login';
        }
       
    }

    function resetTimer() {
        clearTimeout(timeout);
        timeout = setTimeout(doLogout, logoutAfter);
    }

   
    ['click', 'mousemove', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, resetTimer, true);
    });

    resetTimer();
}


async function LogoFetch() {
    try {
       
        const adminStr = sessionStorage.getItem('admin');
        let admin_id = '1'; 
        if (adminStr) {
            try {
                const admin = JSON.parse(adminStr);
                if (admin?.id) admin_id = admin.id;
            } catch {}
        }
        const res = await fetch(`http://localhost:3000/owner_info/${admin_id}`);
        if (!res.ok) throw new Error('No owner info');
        const data = await res.json();
        const logoElem = document.getElementById('company-logo');
        if (!logoElem) return;
        if (data.company_logo) {
            logoElem.src = `http://localhost:3000/uploads/company_logo/${data.company_logo}`;
        } else {
            logoElem.src = '../assets/images/IMG_4703.PNG';
        }
    } catch {
        const logoElem = document.getElementById('company-logo');
        if (logoElem) logoElem.src = '../assets/images/IMG_4703.PNG';
    }
}

async function updateFooterCompanyName() {
   
    let admin_id = '1';
    const adminStr = sessionStorage.getItem('admin');
    if (adminStr) {
        try {
            const admin = JSON.parse(adminStr);
            if (admin?.id) admin_id = admin.id;
        } catch {}
    }

    const companyNameElem = document.getElementById('company-name');
    const yearElem = document.getElementById('year');
    const defaultName = 'Maski cooking Gas';

 
    if (yearElem) {
        yearElem.textContent = new Date().getFullYear();
    }

    try {
        const res = await fetch(`http://localhost:3000/owner_info/${admin_id}`);
        if (!res.ok) throw new Error('No owner info');
        const data = await res.json();
        if (companyNameElem) {
            companyNameElem.innerHTML = `© ${data.company_name || defaultName} <span id="year">${new Date().getFullYear()}</span>`;
        }
    } catch {
        if (companyNameElem) {
            companyNameElem.innerHTML = `© ${defaultName} <span id="year">${new Date().getFullYear()}</span>`;
        }
    }
}


if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('../sales/salesjs/service-worker.js')
    .then(reg => console.log('Service Worker registered:', reg.scope))
    .catch(err => console.error('Service Worker registration failed:', err));
}


 const supplierSelect = document.querySelector('#orderForm #supplier');
    const productSelect = document.getElementById('productSelect');
    const variationSelect = document.getElementById('variationSelect');
    const productTableBody = document.getElementById('productTableBody');
    const totalAmountSpan = document.getElementById('totalAmount');
    const orderForm = document.getElementById('orderForm');

    let orderItems = [];

  
    async function loadSuppliers() {
        supplierSelect.innerHTML = '<option selected disabled>Loading...</option>';
        try {
            const res = await fetch('http://localhost:3000/product_supplier');
            const data = await res.json();
            supplierSelect.innerHTML = '';
            if (Array.isArray(data) && data.length > 0) {
                supplierSelect.innerHTML = '<option selected disabled>Choose...</option>';
                data.forEach(sup => {
                    const opt = document.createElement('option');
                    opt.value = sup.supplier_id;
                    opt.textContent = sup.supplier_name;
                    supplierSelect.appendChild(opt);
                });
            } else {
                supplierSelect.innerHTML = '<option selected disabled>No data yet</option>';
            }
        } catch {
            supplierSelect.innerHTML = '<option selected disabled>Failed to load</option>';
        }
    }


    async function loadProducts() {
        productSelect.innerHTML = '<option value="">Loading...</option>';
        try {
            const res = await fetch('http://localhost:3000/product');
            const data = await res.json();
            productSelect.innerHTML = '<option value="">Select Product</option>';
            if (Array.isArray(data) && data.length > 0) {
                data.forEach(prod => {
                    const opt = document.createElement('option');
                    opt.value = prod.product_id;
                    opt.textContent = prod.product_name;
                    opt.dataset.productName = prod.product_name;
                    productSelect.appendChild(opt);
                });
            } else {
                productSelect.innerHTML = '<option value="">No data yet</option>';
            }
        } catch {
            productSelect.innerHTML = '<option value="">Failed to load</option>';
        }
    }

     async function getVariationName(variations_id) {
        try {
            const res = await fetch(`http://localhost:3000/product_variations/${variations_id}/with_attributes`);
            if (!res.ok) return '';
            const data = await res.json();
            if (Array.isArray(data.attributes) && data.attributes.length > 0) {
                return data.attributes.map(a => a.value).join('-');
            }
            return '';
        } catch {
            return '';
        }
    }

   
    async function loadVariations(product_id) {
        variationSelect.innerHTML = '<option value="">Loading...</option>';
        if (!product_id) {
            variationSelect.innerHTML = '<option value="">Select Variation</option>';
            return;
        }
        try {
            const res = await fetch(`http://localhost:3000/product_variations/product/${product_id}`);
            const data = await res.json();
            variationSelect.innerHTML = '<option value="">Select Variation</option>';
            if (Array.isArray(data) && data.length > 0) {
for (const variation of data) {
                   
                    const variationName = await getVariationName(variation.variations_id);
                    const opt = document.createElement('option');
                    opt.value = variation.variations_id;
                    opt.textContent = variationName ? variationName : (variation.sku || variation.variations_id);
                    opt.dataset.variationName = variationName;
                    opt.dataset.costPrice = variation.cost_price;
                    variationSelect.appendChild(opt);
                }
            } else {
                variationSelect.innerHTML = '<option value="">No data yet</option>';
            }
        } catch {
            variationSelect.innerHTML = '<option value="">Failed to load</option>';
        }
    }

    
    function addProductToOrderTable() {
        const product_id = productSelect.value;
        const product_name = productSelect.options[productSelect.selectedIndex]?.text || '';
        const variations_id = variationSelect.value;
        const variation_name = variationSelect.options[variationSelect.selectedIndex]?.text || '';
        const unit_price = parseFloat(variationSelect.options[variationSelect.selectedIndex]?.dataset.costPrice) || 0;

        if (!product_id || !variations_id) {
            showToast('Select product and variation', 'danger');
            return;
        }

      
        let quantity = prompt('Enter quantity:', '1');
        quantity = parseInt(quantity, 10);
        if (isNaN(quantity) || quantity <= 0) {
            showToast('Invalid quantity', 'danger');
            return;
        }

       
       if (orderItems.some(item => item.product_id === product_id && item.variations_id === variations_id)) {
            showToast('This product/variation is already added', 'danger');
            return;
        }

        const subtotal = unit_price * quantity;

        orderItems.push({
            product_id,
            product_name,
            variations_id,
            variation_name,
            quantity,
            unit_price,
            subtotal
        });

        renderOrderTable();
    }

  
    function renderOrderTable() {
        productTableBody.innerHTML = '';
        let total = 0;
        if (orderItems.length === 0) {
            productTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No products added</td></tr>`;
        } else {
            orderItems.forEach((item, idx) => {
                total += item.subtotal;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${item.product_name}</td>
                    <td>${item.variation_name}</td>
                     <td>
                        <input type="number" min="1" class="form-control form-control-sm order-qty-input" data-idx="${idx}" value="${item.quantity}">
                    </td>
                    <td>
                        <input type="number" min="0" step="0.01" class="form-control form-control-sm order-unit-price-input" data-idx="${idx}" value="${item.unit_price}">
                    </td>
                    <td>${item.subtotal.toLocaleString()}</td>
                    <td><button type="button" class="btn btn-danger btn-sm" data-idx="${idx}">Remove</button></td>
                `;
                productTableBody.appendChild(tr);
            });
        }
        totalAmountSpan.textContent = total.toLocaleString(undefined, {minimumFractionDigits: 2});
   
    productTableBody.querySelectorAll('button[data-idx]').forEach(btn => {
            btn.onclick = function() {
                const idx = parseInt(this.dataset.idx, 10);
                orderItems.splice(idx, 1);
                renderOrderTable();
            };
        });

       
        productTableBody.querySelectorAll('.order-qty-input').forEach(input => {
            input.onchange = function() {
                const idx = parseInt(this.dataset.idx, 10);
                let qty = parseInt(this.value, 10);
                if (isNaN(qty) || qty <= 0) qty = 1;
                orderItems[idx].quantity = qty;
                orderItems[idx].subtotal = orderItems[idx].unit_price * qty;
                renderOrderTable();
            };
        });

       
        productTableBody.querySelectorAll('.order-unit-price-input').forEach(input => {
            input.onchange = function() {
                const idx = parseInt(this.dataset.idx, 10);
                let price = parseFloat(this.value);
                if (isNaN(price) || price < 0) price = 0;
                orderItems[idx].unit_price = price;
                orderItems[idx].subtotal = price * orderItems[idx].quantity;
                renderOrderTable();
            };
        });
    }

    
    variationSelect.addEventListener('change', addProductToOrderTable);
    productSelect.addEventListener('change', function () {
        loadVariations(this.value);
    });
   
    document.getElementById('quickOrderModel').addEventListener('show.bs.modal', function () {
        loadSuppliers();
        loadProducts();
        variationSelect.innerHTML = '<option value="">Select Variation</option>';
        orderItems = [];
        renderOrderTable();
        totalAmountSpan.textContent = '0.00';
    });

    
    orderForm.addEventListener('submit', async function (e) {

 
    
        e.preventDefault();
         const orderSavebtn = document.getElementById('saveOrderBtn');
          setButtonLoading(orderSavebtn, true, "Saving...");
        if (orderItems.length === 0) {
            showToast('Add at least one product to the order', 'danger');
            return;
        }
        const supplier_id = supplierSelect.value;
        const supplier_name = supplierSelect.options[supplierSelect.selectedIndex]?.text || '';
        const order_date = document.getElementById('orderDate').value;
        const expected_delivery_date = document.getElementById('deliveryDate').value;

           let created_by = "System";
    try {
        const adminStr = sessionStorage.getItem('admin');
        if (adminStr) {
            const admin = JSON.parse(adminStr);
            if (admin.first_name || admin.last_name) {
                created_by = `${admin.first_name || ''} ${admin.last_name || ''}`.trim();
            }
        }
    } catch {
        created_by = "System";
    }

        if (!supplier_id || !order_date) {
            showToast('Supplier and order date are required', 'danger');
            return;
        }

       
        try {
             for (const item of orderItems) {
            await fetch(`http://localhost:3000/product_variations/${item.variations_id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cost_price: item.unit_price })
            });
        }

                  const payload = {
            supplier_id,
            supplier_name,
            order_date,
            expected_delivery_date,
            created_by,
            items: orderItems.map(item => ({
                product_id: item.product_id,
                product_name: item.product_name,
                variations_id: item.variations_id,
                variation_name: item.variation_name,
                order_quantity: item.quantity,
                order_amount: item.subtotal,
                unit_price: item.unit_price
            }))
        };
        const res = await fetch('http://localhost:3000/product_order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create order');

        showToast('Order(s) created successfully', 'success');
         setTimeout(() => window.location.reload(), 1200);
        orderForm.reset();
        orderItems = [];
        renderOrderTable();
        totalAmountSpan.textContent = '0.00';
        bootstrap.Modal.getInstance(document.getElementById('orderModel')).hide();
    } catch (err) {
        showToast(err.message || 'Failed to create order', 'danger');
    }finally {
        setButtonLoading(orderSavebtn, false);
    }
});

document.getElementById('expBtn').addEventListener('click', async function (e) {
  e.preventDefault();
  const btn = this;
  btn.disabled = true;
  btn.textContent = "Saving...";

  const form = document.getElementById('addExpForm');
  const formData = new FormData(form);


  const catSelect = document.getElementById('expcategory');
  const selectedOption = catSelect.options[catSelect.selectedIndex];
  const expense_category_id = selectedOption.value;
  const expense_category_name = selectedOption.getAttribute('data-name');


  let payment_method = document.getElementById('expMethod').value.toLowerCase();
  if (payment_method === 'transfer') payment_method = 'bank_transfer';
  if (payment_method === 'card') payment_method = 'mobile_money';

  formData.append('expense_category_id', expense_category_id);
  formData.append('expense_category_name', expense_category_name);
  formData.append('description', document.getElementById('expDes').value);
  formData.append('date', document.getElementById('expDate').value);
  formData.append('amount', document.getElementById('expAmt').value);
  formData.append('payment_method', payment_method);



  try {
    const res = await fetch('http://localhost:3000/expense', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Expense recorded successfully');
      form.reset();
     setTimeout(() => {
            window.location.reload();
        }, 1000);
    } else {
      showToast(data.error || 'Failed to record expense', 'danger');
    }
  } catch (err) {
    showToast('Network error', 'danger');
  }
  btn.disabled = false;
  btn.textContent = "Save Expens";
});


 function loadCategories() {
    const select = document.getElementById('categorydropdown');
    if (!select) {
        console.error('No element with id categorydropdown found!');
        showToast('No category dropdown found', 'danger');
        return;
    }
    select.innerHTML = '<option selected disabled>Loading...</option>';
    fetch('http://localhost:3000/product_category')
        .then(res => {
            if (!res.ok) throw new Error('Failed to fetch categories');
            return res.json();
            
        })
        .then(data => {
            select.innerHTML = '<option selected disabled>Choose...</option>';
            if (Array.isArray(data) && data.length > 0) {
                data.forEach(cat => {
                    const opt = document.createElement('option');
                    opt.value = cat.category_id;
                    opt.textContent = cat.category_name;
                    select.appendChild(opt);
                });
                console.log('Categories loaded successfully');
            } else {
                select.innerHTML = '<option selected disabled>No categories found</option>';
                console.log('No categories found');
            }
        })
        .catch(err => {
            select.innerHTML = '<option selected disabled>Failed to load categories</option>';
            showToast('Failed to load categories', 'danger');
            console.error(err);
        });
}

function addProduct() {
    const form = document.getElementById('addProductForm');
     const saveBtn = document.getElementById('saveProductBtn');
    const formData = new FormData(form);

        setButtonLoading(saveBtn, true, "Saving...");

    if (!form.product_name.value.trim()) {
        showToast('Product name is required', 'danger');
        return;
    }
    if (form.category_id.selectedIndex <= 0) {
        showToast('Please select a category', 'danger');
        return;
    }
    if (!form.brand.value.trim()) {
        showToast('Brand is required', 'danger');
        return;
    }
    if (!form.unit_name.value.trim()) {
        showToast('Unit is required', 'danger');
        return;
    }
    if (!form.product_alert_limit.value.trim()) {
        showToast('Alert limit is required', 'danger');
        return;
    }
    if (!form.product_description.value.trim()) {
        showToast('Description is required', 'danger');
        return;
    }
    if (!form.product_featured_image.value) {
        showToast('Product image is required', 'danger');
        return;
    }

    const catSelect = form.category_id;
    formData.append('category_name', catSelect.options[catSelect.selectedIndex].text);

    fetch('http://localhost:3000/product', {
        method: 'POST',
        body: formData
    })
    .then(res => res.json().then(data => ({ ok: res.ok, data })))
    .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'Failed to create product');
        showToast('Product created successfully', 'success');
        form.reset();
        setTimeout(() => window.location.reload(), 1200);
    })
    .catch(err => {
        showToast(err.message || 'Network error. Please try again.', 'danger');
    })
     .finally(() => {
        setButtonLoading(saveBtn, false);
    });
    
}

loadCategories();


    function setButtonLoading(btn, isLoading, loadingText = "Processing...") {
    if (!btn) return;
    if (isLoading) {
        btn.disabled = true;
        btn.dataset.originalText = btn.textContent;
        btn.textContent = loadingText;
    } else {
        btn.disabled = false;
        btn.textContent = btn.dataset.originalText || "Submit";
    }
}

async function fetchCategories() {
  const res = await fetch('http://localhost:3000/expense_category');
  if (!res.ok) return [];
  return await res.json();
}

async function populateCategorySelect() {
  const select = document.getElementById('expcategory');
  select.innerHTML = `<option selected disabled>Choose...</option>`;
  const categories = await fetchCategories();
  categories.forEach(cat => {
    select.innerHTML += `<option value="${cat.expense_category_id}" data-name="${cat.expense_category_name}">${cat.expense_category_name}</option>`;
  });
}

function limitAction() {
     let admin_role = '';
    try {
        const adminStr = sessionStorage.getItem('admin');
        if (adminStr) {
            const admin = JSON.parse(adminStr);
            admin_role = admin?.admin_role || '';
        }
    } catch {}

   
    if (admin_role !== 'super_admin' && admin_role !== 'dev') {
      
        const addProductLink = document.querySelector('[data-bs-target="#quickProductModal"]');
        if (addProductLink) addProductLink.style.display = 'none';

        
        const createOrderLink = document.querySelector('[data-bs-target="#quickOrderModel"]');
        if (createOrderLink) createOrderLink.style.display = 'none';
    }
}

function hideBellPOS() {
  const path = window.location.pathname;
  const page = path.substring(path.lastIndexOf('/') + 1).toLowerCase();

  const hideOnPages = ['pos.html', 'reports.html'];
  

  if (hideOnPages.includes(page)) {
    const dropdowns = document.querySelectorAll('.dropdown');
    dropdowns.forEach(dropdown => {
      const bellIcon = dropdown.querySelector('.bi-bell');
      if (bellIcon) {
        console.log('Hiding bell dropdown:', dropdown);
        dropdown.style.display = 'none';
      }
    });
  }
}
