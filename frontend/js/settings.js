async function loadSettings() {
  requireAuthRedirect();
  const settings = await apiFetch('/api/settings');
  const form = document.getElementById('settingsForm');
  Object.keys(settings || {}).forEach((key) => {
    if (form.elements[key] && key !== 'logoUrl') {
      form.elements[key].value = settings[key] ?? '';
    }
  });
  if (settings?.logoUrl) {
    const preview = document.getElementById('logoPreview');
    preview.src = settings.logoUrl;
    preview.style.display = 'block';
    document.getElementById('logoPlaceholder').style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  requireAuthRedirect();

  document.getElementById('settingsForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: localStorage.getItem('token') ? { Authorization: `Bearer ${localStorage.getItem('token')}` } : {},
      body: data,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(payload.msg || 'Failed to save settings');
      return;
    }
    alert('Settings saved');
    await loadSettings();
  });

  loadSettings().catch((error) => alert(error.message));
});
