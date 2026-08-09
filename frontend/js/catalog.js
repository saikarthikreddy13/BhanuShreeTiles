const money = (value) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value || 0);

function setStatus(id, message) {
	const node = document.getElementById(id);
	if (node) node.textContent = message;
}

async function loadOptions(endpoint) {
	return apiFetch(endpoint);
}

function renderSimpleRows(items, renderRow, emptyLabel) {
	return items.length ? items.map(renderRow).join('') : `<tr><td colspan="5">${emptyLabel}</td></tr>`;
}

async function initSimpleCrud({
	formId,
	tableId,
	statusId,
	endpoint,
	fields,
	buildPayload,
	renderRow,
	emptyLabel,
}) {
	requireAuthRedirect();
	const form = document.getElementById(formId);
	const table = document.getElementById(tableId);

	async function refresh() {
		const items = await apiFetch(endpoint);
		table.innerHTML = renderSimpleRows(items, renderRow, emptyLabel);
		setStatus(statusId, `${items.length} records`);
		return items;
	}

	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		const payload = buildPayload(form);
		const method = form.id.value ? 'PUT' : 'POST';
		const url = form.id.value ? `${endpoint}/${form.id.value}` : endpoint;
		await apiFetch(url, { method, body: JSON.stringify(payload) });
		form.reset();
		form.id.value = '';
		await refresh();
	});

	form.querySelector('[data-reset]')?.addEventListener('click', () => {
		form.reset();
		form.id.value = '';
	});

	table.addEventListener('click', async (event) => {
		const editButton = event.target.closest('[data-edit]');
		const deleteButton = event.target.closest('[data-delete]');
		if (editButton) {
			const item = JSON.parse(decodeURIComponent(editButton.dataset.edit));
			form.id.value = item._id;
			fields.forEach((field) => {
				if (form.elements[field]) form.elements[field].value = item[field] ?? '';
			});
		}
		if (deleteButton) {
			if (!confirm('Delete this record?')) return;
			await apiFetch(`${endpoint}/${deleteButton.dataset.delete}`, { method: 'DELETE' });
			await refresh();
		}
	});

	await refresh();
}

async function initProductsPage() {
	requireAuthRedirect();
	const [categories, brands] = await Promise.all([
		loadOptions('/api/categories'),
		loadOptions('/api/brands'),
	]);

	const categoryFilter = document.getElementById('productCategoryFilter');
	const brandFilter = document.getElementById('productBrandFilter');
	const categoryOptions = document.getElementById('categoryOptions');
	const brandOptions = document.getElementById('brandOptions');

	const fillSelect = (select, items, firstLabel) => {
		if (!select) return;
		select.innerHTML = `<option value="">${firstLabel}</option>` + items.map((item) => `<option value="${item.name}">${item.name}</option>`).join('');
	};

	const fillDatalist = (list, items) => {
		if (!list) return;
		list.innerHTML = items.map((item) => `<option value="${item.name}"></option>`).join('');
	};

	fillSelect(categoryFilter, categories, 'All Categories');
	fillSelect(brandFilter, brands, 'All Brands');
	fillDatalist(categoryOptions, categories);
	fillDatalist(brandOptions, brands);

	async function refreshProducts() {
		const params = new URLSearchParams();
		const q = document.getElementById('productSearch').value.trim();
		const category = categoryFilter.value;
		const brand = brandFilter.value;
		if (q) params.set('q', q);
		if (category) params.set('category', category);
		if (brand) params.set('brand', brand);
		const items = await apiFetch(`/api/products${params.toString() ? `?${params}` : ''}`);
		document.getElementById('productTable').innerHTML = renderSimpleRows(items, (product) => `
			<tr>
				<td>${product.sku || ''}</td>
				<td>${product.name}</td>
				<td>${product.category}</td>
				<td>${product.brand || ''}</td>
				<td>${money(product.price)}</td>
				<td>${product.stock}</td>
				<td>
					<button class="btn btn-sm btn-outline-light me-2" data-edit="${encodeURIComponent(JSON.stringify(product))}">Edit</button>
					<button class="btn btn-sm btn-outline-danger" data-delete="${product._id}">Delete</button>
				</td>
			</tr>
		`, 'No products found');
		setStatus('productStatus', `${items.length} products`);
	}

	document.getElementById('productForm').addEventListener('submit', async (event) => {
		event.preventDefault();
		const form = event.currentTarget;
		const payload = {
			sku: form.sku.value.trim(),
			name: form.name.value.trim(),
			category: form.category.value,
			brand: form.brand.value,
			finish: form.finish.value.trim(),
			size: form.size.value.trim(),
			color: form.color.value.trim(),
			thickness: form.thickness.value.trim(),
			price: Number(form.price.value || 0),
			mrp: Number(form.mrp.value || 0),
			gstRate: Number(form.gstRate.value || 0),
			stock: Number(form.stock.value || 0),
			lowStockThreshold: Number(form.lowStockThreshold.value || 10),
			description: form.description.value.trim(),
			unit: form.unit.value.trim(),
			isActive: form.isActive.value === 'true',
		};
		const method = form.id.value ? 'PUT' : 'POST';
		const url = form.id.value ? `/api/products/${form.id.value}` : '/api/products';
		await apiFetch(url, { method, body: JSON.stringify(payload) });
		form.reset();
		form.id.value = '';
		await refreshProducts();
	});

	document.getElementById('productFormReset').addEventListener('click', () => document.getElementById('productForm').reset());
	document.getElementById('productSearchButton').addEventListener('click', () => refreshProducts().catch((error) => alert(error.message)));
	categoryFilter.addEventListener('change', () => refreshProducts().catch((error) => alert(error.message)));
	brandFilter.addEventListener('change', () => refreshProducts().catch((error) => alert(error.message)));
	document.getElementById('productTable').addEventListener('click', async (event) => {
		const editButton = event.target.closest('[data-edit]');
		const deleteButton = event.target.closest('[data-delete]');
		const form = document.getElementById('productForm');
		if (editButton) {
			const product = JSON.parse(decodeURIComponent(editButton.dataset.edit));
			form.id.value = product._id;
			form.sku.value = product.sku || '';
			form.name.value = product.name || '';
			form.category.value = product.category || '';
			form.brand.value = product.brand || '';
			form.finish.value = product.finish || '';
			form.size.value = product.size || '';
			form.color.value = product.color || '';
			form.thickness.value = product.thickness || '';
			form.price.value = product.price || 0;
			form.mrp.value = product.mrp || 0;
			form.gstRate.value = product.gstRate || 0;
			form.stock.value = product.stock || 0;
			form.lowStockThreshold.value = product.lowStockThreshold || 10;
			form.description.value = product.description || '';
			form.unit.value = product.unit || 'box';
			form.isActive.value = String(Boolean(product.isActive));
		}
		if (deleteButton) {
			if (!confirm('Delete this product?')) return;
			await apiFetch(`/api/products/${deleteButton.dataset.delete}`, { method: 'DELETE' });
			await refreshProducts();
		}
	});

	await refreshProducts();
}

document.addEventListener('DOMContentLoaded', () => {
	if (document.getElementById('productForm') && document.getElementById('productTable')) {
		initProductsPage().catch((error) => alert(error.message));
	}

	if (document.getElementById('categoryForm') && document.getElementById('categoryTable')) {
		initSimpleCrud({
			formId: 'categoryForm',
			tableId: 'categoryTable',
			statusId: 'categoryStatus',
			endpoint: '/api/categories',
			fields: ['name', 'slug', 'description', 'isActive'],
			buildPayload: (form) => ({
				name: form.name.value.trim(),
				slug: form.slug.value.trim(),
				description: form.description.value.trim(),
				isActive: form.isActive.value === 'true',
			}),
			renderRow: (category) => `
				<tr>
					<td>${category.name}</td>
					<td>${category.slug || ''}</td>
					<td>${category.description || ''}</td>
					<td><span class="badge ${category.isActive ? 'text-bg-success' : 'text-bg-secondary'}">${category.isActive ? 'active' : 'inactive'}</span></td>
					<td>
						<button class="btn btn-sm btn-outline-light me-2" data-edit="${encodeURIComponent(JSON.stringify(category))}">Edit</button>
						<button class="btn btn-sm btn-outline-danger" data-delete="${category._id}">Delete</button>
					</td>
				</tr>
			`,
			emptyLabel: 'No categories added yet',
		}).catch((error) => alert(error.message));
	}

	if (document.getElementById('brandForm') && document.getElementById('brandTable')) {
		initSimpleCrud({
			formId: 'brandForm',
			tableId: 'brandTable',
			statusId: 'brandStatus',
			endpoint: '/api/brands',
			fields: ['name', 'slug', 'logoUrl', 'description', 'isActive'],
			buildPayload: (form) => ({
				name: form.name.value.trim(),
				slug: form.slug.value.trim(),
				logoUrl: form.logoUrl.value.trim(),
				description: form.description.value.trim(),
				isActive: form.isActive.value === 'true',
			}),
			renderRow: (brand) => `
				<tr>
					<td>${brand.name}</td>
					<td>${brand.slug || ''}</td>
					<td>${brand.description || ''}</td>
					<td><span class="badge ${brand.isActive ? 'text-bg-success' : 'text-bg-secondary'}">${brand.isActive ? 'active' : 'inactive'}</span></td>
					<td>
						<button class="btn btn-sm btn-outline-light me-2" data-edit="${encodeURIComponent(JSON.stringify(brand))}">Edit</button>
						<button class="btn btn-sm btn-outline-danger" data-delete="${brand._id}">Delete</button>
					</td>
				</tr>
			`,
			emptyLabel: 'No brands added yet',
		}).catch((error) => alert(error.message));
	}
});
