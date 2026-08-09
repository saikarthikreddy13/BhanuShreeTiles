async function refreshEmployees() {
  requireAuthRedirect();
  const employees = await apiFetch('/api/employees');
  const tbody = document.getElementById('employeeTable');
  tbody.innerHTML = employees.map((employee) => `
    <tr>
      <td>${employee.employeeCode}</td>
      <td>${employee.name}</td>
      <td>${employee.role}</td>
      <td>${employee.phone || ''}</td>
      <td><span class="badge ${employee.status === 'active' ? 'text-bg-success' : 'text-bg-secondary'}">${employee.status}</span></td>
      <td>
        <button class="btn btn-sm btn-outline-light me-2" data-edit="${encodeURIComponent(JSON.stringify(employee))}">Edit</button>
        <button class="btn btn-sm btn-outline-danger" data-delete="${employee._id}">Delete</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6">No employees added yet</td></tr>';

  tbody.querySelectorAll('[data-edit]').forEach((button) => {
    button.onclick = () => {
      const employee = JSON.parse(decodeURIComponent(button.dataset.edit));
      const form = document.getElementById('employeeForm');
      form.id.value = employee._id;
      form.name.value = employee.name || '';
      form.employeeCode.value = employee.employeeCode || '';
      form.role.value = employee.role || '';
      form.phone.value = employee.phone || '';
      form.email.value = employee.email || '';
      form.salary.value = employee.salary || 0;
      form.status.value = employee.status || 'active';
      form.notes.value = employee.notes || '';
    };
  });

  tbody.querySelectorAll('[data-delete]').forEach((button) => {
    button.onclick = async () => {
      if (!confirm('Delete this employee?')) return;
      await apiFetch(`/api/employees/${button.dataset.delete}`, { method: 'DELETE' });
      await refreshEmployees();
    };
  });
}

document.addEventListener('DOMContentLoaded', () => {
  requireAuthRedirect();

  document.getElementById('employeeForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = {
      name: form.name.value.trim(),
      employeeCode: form.employeeCode.value.trim(),
      role: form.role.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      salary: Number(form.salary.value || 0),
      status: form.status.value,
      notes: form.notes.value.trim(),
    };
    const method = form.id.value ? 'PUT' : 'POST';
    const url = form.id.value ? `/api/employees/${form.id.value}` : '/api/employees';
    await apiFetch(url, { method, body: JSON.stringify(payload) });
    form.reset();
    await refreshEmployees();
  });

  document.getElementById('employeeReset').addEventListener('click', () => document.getElementById('employeeForm').reset());
  refreshEmployees().catch((error) => alert(error.message));
});
