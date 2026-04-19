// Admin Dashboard Logic
const state = {
  auth: null,
  stats: null,
  users: [],
  aiProviders: [],
  chart: null,
};

// Initialize Firebase
async function initFirebase() {
  try {
    const response = await fetch("/firebase-config");
    const firebaseConfig = await response.json();
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();

    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = "/login";
        return;
      }

      // Show admin app if user is available
      document.getElementById("auth-guard").classList.add("hidden");
      document.getElementById("admin-app").classList.remove("hidden");

      state.auth = auth;
      loadDashboard();
    });
  } catch (error) {
    console.error("Firebase init error:", error);
    window.location.href = "/login";
  }
}

async function loadDashboard() {
  await Promise.all([fetchStats(), fetchUsers(), fetchAIProviders()]);
}

// AI Provider Management Functions

async function fetchAIProviders() {
  try {
    const token = await state.auth.currentUser.getIdToken();
    const response = await fetch("/admin/ai-providers", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) throw new Error(await response.text());

    const providers = await response.json();
    state.aiProviders = providers;
    renderAIProvidersTable(providers);
  } catch (error) {
    console.error("Failed to fetch AI providers:", error);
    document.getElementById("ai-providers-table-body").innerHTML =
      `<tr><td colspan="5" class="loading">Error: ${error.message}</td></tr>`;
  }
}

function renderAIProvidersTable(providers) {
  const tbody = document.getElementById("ai-providers-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (providers.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="loading">No providers configured</td></tr>';
    return;
  }

  providers.forEach((provider) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>
                <div style="display: flex; flex-direction: column">
                    <strong>${escapeHtml(provider.name)}</strong>
                    <span style="font-size: 0.7rem; color: var(--color-text-secondary)">ID: ${provider.id}</span>
                </div>
            </td>
            <td><code>${escapeHtml(provider.model)}</code></td>
            <td style="font-size: 0.8rem; color: var(--color-text-secondary)">${escapeHtml(provider.base_url)}</td>
            <td>
                <span class="status-badge ${provider.is_active ? "status-active" : "status-blocked"}">
                    ${provider.is_active ? "Active" : "Inactive"}
                </span>
            </td>
            <td>
                <div style="display: flex; gap: 8px">
                    ${!provider.is_active ? `<button class="btn btn-success btn-sm" onclick="activateProvider(${provider.id})">Activate</button>` : ""}
                    <button class="btn btn-secondary btn-sm" onclick="editProvider(${provider.id})">Edit</button>
                    <button class="btn btn-secondary btn-sm" onclick="testProvider(${provider.id})">Test</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteProvider(${provider.id})">Delete</button>
                </div>
            </td>
        `;
    tbody.appendChild(tr);
  });
}

function editProvider(id) {
  const provider = state.aiProviders.find((p) => p.id === id);
  if (!provider) return;

  const modal = document.getElementById("provider-modal");
  const form = document.getElementById("provider-form");
  const title = document.getElementById("modal-title");

  title.textContent = "Edit AI Provider";
  form.dataset.mode = "edit";
  form.dataset.id = id;

  document.getElementById("provider-name").value = provider.name;
  document.getElementById("provider-base-url").value = provider.base_url;
  document.getElementById("provider-api-key").value = ""; // Don't show existing key for security
  document.getElementById("provider-api-key").placeholder = provider.api_key ? `Current: ${provider.api_key} (Leave blank to keep)` : "sk-...";
  document.getElementById("provider-model").value = provider.model;
  document.getElementById("provider-type").value = "custom";

  // Reset select input visibility
  document.getElementById("provider-model-select").style.display = "none";
  document.getElementById("provider-model").style.display = "block";

  modal.classList.remove("hidden");
}

async function activateProvider(id) {
  try {
    const token = await state.auth.currentUser.getIdToken();
    const response = await fetch(`/admin/ai-providers/${id}/activate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      fetchAIProviders();
    } else {
      alert("Failed to activate provider");
    }
  } catch (error) {
    console.error("Activate provider error:", error);
  }
}

async function deleteProvider(id) {
  if (!confirm("Are you sure you want to delete this provider?")) return;

  try {
    const token = await state.auth.currentUser.getIdToken();
    const response = await fetch(`/admin/ai-providers/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      fetchAIProviders();
    } else {
      alert("Failed to delete provider");
    }
  } catch (error) {
    console.error("Delete provider error:", error);
  }
}

async function testProvider(id) {
  try {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "...";

    const token = await state.auth.currentUser.getIdToken();
    const response = await fetch(`/admin/ai-providers/${id}/test`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const result = await response.json();
    if (result.status === "success") {
      alert("✅ Success: " + result.message);
    } else {
      alert("❌ Failed: " + result.message);
    }

    btn.disabled = false;
    btn.textContent = originalText;
  } catch (error) {
    console.error("Test provider error:", error);
    alert("An error occurred during testing");
  }
}

// Modal Logic
function initModals() {
  const providerModal = document.getElementById("provider-modal");
  const addProviderBtn = document.getElementById("add-provider-btn");
  const closeBtns = document.querySelectorAll(".close-modal-btn");
  const providerForm = document.getElementById("provider-form");
  const fetchModelsBtn = document.getElementById("fetch-models-btn");
  const providerTypeSelect = document.getElementById("provider-type");

  if (providerTypeSelect) {
    providerTypeSelect.onchange = () => {
      const type = providerTypeSelect.value;
      const nameInput = document.getElementById("provider-name");
      const urlInput = document.getElementById("provider-base-url");

      const presets = {
        openrouter: { name: "OpenRouter", url: "https://openrouter.ai/api/v1" },
        opencode: { name: "OpenCode", url: "https://opencode.ai/api/v1" },
        kilocode: { name: "Kilo Code", url: "https://api.kilo.ai/v1" },
        openai: { name: "OpenAI", url: "https://api.openai.com/v1" },
      };

      if (presets[type]) {
        nameInput.value = presets[type].name;
        urlInput.value = presets[type].url;
      } else if (type === "custom") {
        nameInput.value = "";
        urlInput.value = "";
      }
    };
  }

  if (fetchModelsBtn) {
    fetchModelsBtn.onclick = async () => {
      const baseUrl = document.getElementById("provider-base-url").value;
      const apiKey = document.getElementById("provider-api-key").value;
      const providerForm = document.getElementById("provider-form");
      const mode = providerForm.dataset.mode || "add";
      const id = providerForm.dataset.id;

      if (!baseUrl) {
        alert("Please enter Base URL first");
        return;
      }
      if (!apiKey && mode === "add") {
        alert("Please enter API Key first");
        return;
      }

      fetchModelsBtn.disabled = true;
      fetchModelsBtn.textContent = "...";

      try {
        const token = await state.auth.currentUser.getIdToken();
        let fetchUrl = `/admin/ai-providers/fetch-models?base_url=${encodeURIComponent(baseUrl)}&api_key=${encodeURIComponent(apiKey)}`;
        if (mode === "edit" && id) {
            fetchUrl += `&provider_id=${id}`;
        }
        
        const response = await fetch(
          fetchUrl,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (response.ok) {
          const data = await response.json();
          const models = data.data || data;

          if (Array.isArray(models)) {
            console.log("Available models:", models);
            const modelSelect = document.getElementById("provider-model-select");
            const modelInput = document.getElementById("provider-model");
            if (modelSelect) {
                modelSelect.innerHTML = "";
                
                // Add an "Other (Custom)" option at the end if they want to type manually
                models.forEach(m => {
                    const option = document.createElement("option");
                    option.value = m.id || m.name;
                    option.textContent = m.id || m.name;
                    modelSelect.appendChild(option);
                });
                
                const customOption = document.createElement("option");
                customOption.value = "_custom_";
                customOption.textContent = "Other (Type manually)...";
                modelSelect.appendChild(customOption);
                
                modelInput.style.display = "none";
                modelSelect.style.display = "block";
                
                if (models.length > 0 && !modelInput.value) {
                    modelSelect.value = models[0].id || models[0].name;
                    modelInput.value = modelSelect.value;
                } else if (modelInput.value) {
                    // Try to find if current value is in the models
                    const exists = models.find(m => (m.id || m.name) === modelInput.value);
                    if (exists) {
                        modelSelect.value = modelInput.value;
                    } else {
                        modelSelect.value = "_custom_";
                        modelInput.style.display = "block";
                    }
                }
                
                modelSelect.onchange = (e) => {
                    if (e.target.value === "_custom_") {
                        modelInput.style.display = "block";
                        modelInput.value = "";
                        modelInput.focus();
                    } else {
                        modelInput.style.display = "none";
                        modelInput.value = e.target.value;
                    }
                };
                
                alert(`Successfully fetched ${models.length} models. You can now select them from the dropdown.`);
            }
          } else {
            alert("Could not parse models list. Check console.");
          }
        } else {
          const err = await response.text();
          alert("Failed to fetch models: " + err);
        }
      } catch (error) {
        console.error("Fetch models error:", error);
        alert("Error fetching models");
      } finally {
        fetchModelsBtn.disabled = false;
        fetchModelsBtn.textContent = "Fetch";
      }
    };
  }

  if (addProviderBtn) {
    addProviderBtn.onclick = () => {
      document.getElementById("modal-title").textContent = "Add AI Provider";
      providerForm.dataset.mode = "add";
      providerForm.reset();
      document.getElementById("provider-api-key").placeholder = "sk-...";

      // Reset select input visibility
      document.getElementById("provider-model-select").style.display = "none";
      document.getElementById("provider-model").style.display = "block";

      providerModal.classList.remove("hidden");
    };
  }

  closeBtns.forEach((btn) => {
    btn.onclick = () => providerModal.classList.add("hidden");
  });

  window.onclick = (event) => {
    if (event.target == providerModal) {
      providerModal.classList.add("hidden");
    }
  };

  if (providerForm) {
    providerForm.onsubmit = async (e) => {
      e.preventDefault();

      const mode = providerForm.dataset.mode || "add";
      const id = providerForm.dataset.id;

      const formData = {
        name: document.getElementById("provider-name").value,
        base_url: document.getElementById("provider-base-url").value,
        api_key: document.getElementById("provider-api-key").value,
        model: document.getElementById("provider-model").value,
      };

      try {
        const token = await state.auth.currentUser.getIdToken();
        const url = mode === "edit" ? `/admin/ai-providers/${id}` : "/admin/ai-providers";
        const method = mode === "edit" ? "PUT" : "POST";

        const response = await fetch(url, {
          method: method,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
        });

        if (response.ok) {
          providerModal.classList.add("hidden");
          fetchAIProviders();
        } else {
          const err = await response.text();
          alert("Failed to save provider: " + err);
        }
      } catch (error) {
        console.error("Save provider error:", error);
        alert("An error occurred while saving the provider");
      }
    };
  }
}

// Initialize modals after DOM content loaded
document.addEventListener("DOMContentLoaded", initModals);

async function fetchStats() {
  try {
    const token = await state.auth.currentUser.getIdToken();
    const response = await fetch("/admin/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) throw new Error(await response.text());

    const stats = await response.json();
    state.stats = stats;

    document.getElementById("total-users").textContent = stats.total_users || 0;
    document.getElementById("today-logins").textContent =
      stats.today_logins || 0;
    document.getElementById("total-messages").textContent =
      stats.total_messages || 0;

    renderChart(stats.daily_activity);
  } catch (error) {
    console.error("Failed to fetch stats:", error);
  }
}

async function fetchUsers() {
  try {
    const token = await state.auth.currentUser.getIdToken();
    const response = await fetch("/admin/users", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) throw new Error(await response.text());

    const users = await response.json();
    state.users = users;
    renderUsersTable(users);
  } catch (error) {
    console.error("Failed to fetch users:", error);
    document.getElementById("users-table-body").innerHTML =
      `<tr><td colspan="5" class="loading">Error: ${error.message}</td></tr>`;
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById("users-table-body");
  tbody.innerHTML = "";

  if (users.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="loading">No users found</td></tr>';
    return;
  }

  users.forEach((user) => {
    const tr = document.createElement("tr");
    const lastLogin = user.last_login
      ? new Date(user.last_login).toLocaleDateString()
      : "Never";

    tr.innerHTML = `
            <td>
                <div class="user-email">${escapeHtml(user.email)}</div>
                <div class="subtitle" style="font-size: 0.7rem">${user.uid}</div>
            </td>
            <td>${user.message_count}</td>
            <td>${lastLogin}</td>
            <td>
                <span class="status-badge ${user.is_blocked ? "status-blocked" : "status-active"}">
                    ${user.is_blocked ? "Blocked" : "Active"}
                </span>
            </td>
            <td>
                <button class="btn ${user.is_blocked ? "btn-success" : "btn-danger"}" onclick="toggleBlock('${user.uid}', ${user.is_blocked})">
                    ${user.is_blocked ? "Unblock" : "Block"}
                </button>
            </td>
        `;
    tbody.appendChild(tr);
  });
}

async function toggleBlock(uid, currentlyBlocked) {
  const action = currentlyBlocked ? "unblock" : "block";
  if (!confirm(`Are you sure you want to ${action} this user?`)) return;

  try {
    const token = await state.auth.currentUser.getIdToken();
    const response = await fetch(`/admin/users/${uid}/${action}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      fetchUsers();
    } else {
      alert("Failed to update user status");
    }
  } catch (error) {
    console.error("Toggle block error:", error);
  }
}

function renderChart(data) {
  const ctx = document.getElementById("activityChart").getContext("2d");

  if (state.chart) state.chart.destroy();

  const labels = data.map((d) => d.day);
  const values = data.map((d) => d.count);

  state.chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Messages Sent",
          data: values,
          borderColor: "#ffffff",
          backgroundColor: "rgba(255, 255, 255, 0.05)",
          borderWidth: 2,
          tension: 0,
          fill: true,
          pointBackgroundColor: "#ffffff",
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#888888", font: { family: "Inter", size: 10 } },
        },
        x: {
          grid: { display: false },
          ticks: { color: "#888888", font: { family: "Inter", size: 10 } },
        },
      },
      plugins: {
        legend: { display: false },
      },
    },
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Global toggle for onclick handlers
window.toggleBlock = toggleBlock;
window.activateProvider = activateProvider;
window.deleteProvider = deleteProvider;
window.testProvider = testProvider;

// Start initialization
initFirebase();
