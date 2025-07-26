function updateDate() {
  const dateElement = document.getElementById("currentDate");
  const today = new Date();
  const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
  dateElement.textContent = today.toLocaleDateString(undefined, options);
}

async function ClockOut() {
  const clockInTime = sessionStorage.getItem("clockInTime");
  const clockOutTime = new Date();
  let totalWorked = "00:00:00";
  if (clockInTime) {
    const start = new Date(clockInTime);
    const elapsed = new Date(clockOutTime - start);
    const hours = String(elapsed.getUTCHours()).padStart(2, '0');
    const minutes = String(elapsed.getUTCMinutes()).padStart(2, '0');
    const seconds = String(elapsed.getUTCSeconds()).padStart(2, '0');
    totalWorked = `${hours}:${minutes}:${seconds}`;
  }

  sessionStorage.removeItem("admin");
  sessionStorage.removeItem("clockInTime");

  const salesStore = localforage.createInstance({
    name: 'POSApp',
    storeName: 'salesStore'
  });
  await salesStore.clear();

  alert(`Clocked out!\nTotal hours worked: ${totalWorked}`);

  location.reload('https://maskiadmin-management.com/staff-login');
}

let startTime;
if (sessionStorage.getItem("clockInTime")) {
  startTime = new Date(sessionStorage.getItem("clockInTime"));
} else {
  startTime = new Date();
  sessionStorage.setItem("clockInTime", startTime.toISOString());
}

let clockedOutAutomatically = false;

function updateSessionTimer() {
  const now = new Date();
  const elapsedMs = now - startTime;
  const elapsed = new Date(elapsedMs);

  const hours = String(elapsed.getUTCHours()).padStart(2, '0');
  const minutes = String(elapsed.getUTCMinutes()).padStart(2, '0');
  const seconds = String(elapsed.getUTCSeconds()).padStart(2, '0');

  document.getElementById("sessionTimer").textContent = `${hours}:${minutes}:${seconds}`;


  if (elapsedMs >= 24 * 60 * 60 * 1000 && !clockedOutAutomatically) {
    clockedOutAutomatically = true;
    ClockOut();
  }
}

updateDate();
setInterval(updateSessionTimer, 1000);