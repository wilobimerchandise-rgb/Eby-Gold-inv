// ============================================
// EBY-GOLD INVENTORY ENHANCER
// Complete UI Panel with Customer Tab
// ============================================

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
        LOW_STOCK_THRESHOLD: 10,
        EXCHANGE_RATE: 1600
    };

    // ============================================
    // UI CLASS
    // ============================================
    class InventoryUI {
        constructor(manager) {
            this.manager = manager;
            this.currentView = 'products';
            this.container = null;
        }

        injectStyles() {
            const styleId = 'eby-inventory-styles';
            if (document.getElementById(styleId)) return;

            const styles = `
                #eby-inventory-module {
                    font-family: system-ui, -apple-system, sans-serif;
                    max-width: 1200px;
                    margin: 20px auto;
                    padding: 20px;
                    color: #333;
                }
                #eby-inventory-module .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    padding-bottom: 10px;
                    border-bottom: 2px solid #e0e0e0;
                    flex-wrap: wrap;
                    gap: 10px;
                }
                #eby-inventory-module .header h2 {
                    margin: 0;
                    color: #2c3e50;
                }
                #eby-inventory-module .nav-tabs {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                }
                #eby-inventory-module .nav-tabs button {
                    padding: 8px 16px;
                    border: 1px solid #ddd;
                    background: #f8f9fa;
                    cursor: pointer;
                    border-radius: 4px;
                    transition: all 0.2s;
                }
                #eby-inventory-module .nav-tabs button:hover {
                    background: #e9ecef;
                }
                #eby-inventory-module .nav-tabs button.active {
                    background: #007bff;
                    color: white;
                    border-color: #007bff;
                }
                #eby-inventory-module .view-container {
                    background: white;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    min-height: 300px;
                }
                #eby-inventory-module .search-bar {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 15px;
                    flex-wrap: wrap;
                }
                #eby-inventory-module .search-bar input {
                    flex: 1;
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                    min-width: 150px;
                }
                #eby-inventory-module .search-bar button {
                    padding: 8px 16px;
                    background: #28a745;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                }
                #eby-inventory-module .search-bar button:hover {
                    background: #218838;
                }
                #eby-inventory-module table {
                    width: 100%;
                    border-collapse: collapse;
                }
                #eby-inventory-module th, #eby-inventory-module td {
                    padding: 10px 12px;
                    text-align: left;
                    border-bottom: 1px solid #eee;
                }
                #eby-inventory-module th {
                    background: #f8f9fa;
                    font-weight: 600;
                }
                #eby-inventory-module .badge {
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: 600;
                }
                #eby-inventory-module .badge-danger {
                    background: #dc3545;
                    color: white;
                }
                #eby-inventory-module .badge-warning {
                    background: #ffc107;
                    color: #333;
                }
                #eby-inventory-module .badge-success {
                    background: #28a745;
                    color: white;
                }
                #eby-inventory-module .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.5);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 9999;
                }
                #eby-inventory-module .modal-content {
                    background: white;
                    padding: 30px;
                    border-radius: 8px;
                    max-width: 500px;
                    width: 90%;
                    max-height: 80vh;
                    overflow-y: auto;
                }
                #eby-inventory-module .form-group {
                    margin-bottom: 15px;
                }
                #eby-inventory-module .form-group label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: 500;
                }
                #eby-inventory-module .form-group input,
                #eby-inventory-module .form-group select,
                #eby-inventory-module .form-group textarea {
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                }
                #eby-inventory-module .form-actions {
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                    margin-top: 20px;
                }
                #eby-inventory-module .form-actions button {
                    padding: 8px 20px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                }
                #eby-inventory-module .btn-primary {
                    background: #007bff;
                    color: white;
                }
                #eby-inventory-module .btn-primary:hover {
                    background: #0056b3;
                }
                #eby-inventory-module .btn-secondary {
                    background: #6c757d;
                    color: white;
                }
                #eby-inventory-module .btn-secondary:hover {
                    background: #5a6268;
                }
                #eby-inventory-module .btn-danger {
                    background: #dc3545;
                    color: white;
                }
                #eby-inventory-module .btn-danger:hover {
                    background: #c82333;
                }
                #eby-inventory-module .btn-success {
                    background: #28a745;
                    color: white;
                }
                #eby-inventory-module .btn-success:hover {
                    background: #218838;
                }
                #eby-inventory-module .alert {
                    padding: 12px 16px;
                    border-radius: 4px;
                    margin-bottom: 15px;
                }
                #eby-inventory-module .alert-danger {
                    background: #f8d7da;
                    color: #721c24;
                    border: 1px solid #f5c6cb;
                }
                #eby-inventory-module .alert-success {
                    background: #d4edda;
                    color: #155724;
                    border: 1px solid #c3e6cb;
                }
                #eby-inventory-module .alert-info {
                    background: #d1ecf1;
                    color: #0c5460;
                    border: 1px solid #bee5eb;
                }
                #eby-inventory-module .stock-low {
                    color: #dc3545;
                    font-weight: 600;
                }
                #eby-inventory-module .stock-ok {
                    color: #28a745;
                }
                #eby-inventory-module .float-btn {
                    position: fixed;
                    bottom: 30px;
                    right: 30px;
                    width: 60px;
                    height: 60px;
                    border-radius: 50%;
                    background: #007bff;
                    color: white;
                    border: none;
                    font-size: 28px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    cursor: pointer;
                    z-index: 9998;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s;
                }
                #eby-inventory-module .float-btn:hover {
                    transform: scale(1.1);
                }
                @media (max-width: 768px) {
                    #eby-inventory-module {
                        padding: 10px;
                    }
                    #eby-inventory-module .nav-tabs button {
                        flex: 1;
                        min-width: 60px;
                        font-size: 12px;
                        padding: 6px 10px;
                    }
                    #eby-inventory-module table {
                        font-size: 12px;
                    }
                    #eby-inventory-module th, #eby-inventory-module td {
                        padding: 6px 8px;
                    }
                    #eby-inventory-module .modal-content {
                        padding: 20px;
                    }
                    #eby-inventory-module .float-btn {
                        width: 50px;
                        height: 50px;
                        font-size: 22px;
                        bottom: 20px;
                        right: 20px;
                    }
                }
            `;

            const styleEl = document.createElement('style');
            styleEl.id = styleId;
            styleEl.textContent = styles;
            document.head.appendChild(styleEl);
        }

        render() {
            // Remove any existing module
            const existing = document.getElementById('eby-inventory-module');
            if (existing) existing.remove();

            this.injectStyles();

            const container = document.createElement('div');
            container.id = 'eby-inventory-module';
            container.innerHTML = `
                <div class="header">
                    <h2>📦 Inventory Management</h2>
                    <button class="btn-success" onclick="window.__inventoryUI.showAddProductForm()">
                        ➕ Add Product
                    </button>
                </div>
                <div class="nav-tabs">
                    <button class="active" data-view="products">📦 Products</button>
                    <button data-view="lowstock">⚠️ Low Stock</button>
                    <button data-view="valuation">💰 Valuation</button>
                    <button data-view="movements">📊 Movements</button>
                    <button data-view="customers">👥 Customers</button>
                </div>
                <div class="view-container" id="inventory-view-content">
                    Loading...
                </div>
            `;

            // Find where to insert
            const target = document.querySelector('main') || 
                          document.querySelector('.container') || 
                          document.body;
            target.appendChild(container);

            this.container = container;
            this.setupEventListeners();
            this.loadView('products');

            // Expose for modal functions
            window.__inventoryUI = this;
        }

        setupEventListeners() {
            // Tab navigation
            this.container.querySelectorAll('.nav-tabs button').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.container.querySelectorAll('.nav-tabs button').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.loadView(btn.dataset.view);
                });
            });
        }

        async loadView(view) {
            const content = this.container.querySelector('#inventory-view-content');
            content.innerHTML = '<div style="text-align:center;padding:20px;">Loading...</div>';
            
            try {
                switch(view) {
                    case 'products':
                        await this.renderProducts(content);
                        break;
                    case 'lowstock':
                        await this.renderLowStock(content);
                        break;
                    case 'valuation':
                        await this.renderValuation(content);
                        break;
                    case 'movements':
                        await this.renderMovements(content);
                        break;
                    case 'customers':
                        await this.renderCustomers(content);
                        break;
                    default:
                        content.innerHTML = '<p>View not found</p>';
                }
            } catch (error) {
                content.innerHTML = `<div class="alert alert-danger">Error loading view: ${error.message}</div>`;
                console.error('View load error:', error);
            }
        }

        // ============================================
        // PRODUCTS VIEW
        // ============================================
        async renderProducts(container) {
            const products = await this.manager.getAllProducts();
            
            if (products.length === 0) {
                container.innerHTML = `
                    <div class="alert alert-info">
                        📦 No products found. Click "Add Product" to get started.
                    </div>
                `;
                return;
            }

            let html = `
                <div class="search-bar">
                    <input type="text" id="product-search" placeholder="Search by name, SKU, or barcode..." />
                    <button onclick="window.__inventoryUI.searchProducts()">🔍 Search</button>
                    <button onclick="window.__inventoryUI.clearSearch()">Clear</button>
                </div>
                <div style="overflow-x: auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>SKU</th>
                                <th>Name</th>
                                <th>Category</th>
                                <th>Price (₦)</th>
                                <th>Stock</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="product-table-body">
                    </tbody></table>
                </div>
            `;
            container.innerHTML = html;

            const tbody = container.querySelector('#product-table-body');
            for (const p of products) {
                const productWithStock = await this.manager.getProductWithStock(p.id);
                const stock = productWithStock ? productWithStock.quantity : 0;
                const priceNGN = (p.unitPriceUSD || 0) * CONFIG.EXCHANGE_RATE;
                
                const tr = document.createElement('tr');
                const statusClass = stock < CONFIG.LOW_STOCK_THRESHOLD ? 'badge-danger' : 'badge-success';
                const statusText = stock < CONFIG.LOW_STOCK_THRESHOLD ? '⚠️ Low Stock' : '✅ In Stock';
                
                tr.innerHTML = `
                    <td><strong>${p.sku}</strong></td>
                    <td>${p.name}</td>
                    <td>${p.category || '-'}</td>
                    <td>₦${priceNGN.toLocaleString()}</td>
                    <td class="${stock < CONFIG.LOW_STOCK_THRESHOLD ? 'stock-low' : 'stock-ok'}">
                        ${stock}
                    </td>
                    <td><span class="badge ${statusClass}">${statusText}</span></td>
                    <td>
                        <button onclick="window.__inventoryUI.editProduct(${p.id})" style="margin-right:5px;cursor:pointer;">✏️</button>
                        <button onclick="window.__inventoryUI.deleteProduct(${p.id})" style="cursor:pointer;">🗑️</button>
                    </td>
                `;
                tbody.appendChild(tr);
            }

            // Setup search
            const searchInput = container.querySelector('#product-search');
            if (searchInput) {
                let searchTimeout;
                searchInput.addEventListener('input', () => {
                    clearTimeout(searchTimeout);
                    searchTimeout = setTimeout(() => {
                        this.searchProducts();
                    }, 300);
                });
            }
        }

        async searchProducts() {
            const input = document.querySelector('#product-search');
            const query = input ? input.value : '';
            const tbody = document.querySelector('#product-table-body');
            if (!tbody) return;

            const products = query.length > 0 
                ? await this.manager.searchProducts(query)
                : await this.manager.getAllProducts();

            tbody.innerHTML = '';
            for (const p of products) {
                const productWithStock = await this.manager.getProductWithStock(p.id);
                const stock = productWithStock ? productWithStock.quantity : 0;
                const priceNGN = (p.unitPriceUSD || 0) * CONFIG.EXCHANGE_RATE;
                
                const tr = document.createElement('tr');
                const statusClass = stock < CONFIG.LOW_STOCK_THRESHOLD ? 'badge-danger' : 'badge-success';
                const statusText = stock < CONFIG.LOW_STOCK_THRESHOLD ? '⚠️ Low Stock' : '✅ In Stock';
                
                tr.innerHTML = `
                    <td><strong>${p.sku}</strong></td>
                    <td>${p.name}</td>
                    <td>${p.category || '-'}</td>
                    <td>₦${priceNGN.toLocaleString()}</td>
                    <td class="${stock < CONFIG.LOW_STOCK_THRESHOLD ? 'stock-low' : 'stock-ok'}">
                        ${stock}
                    </td>
                    <td><span class="badge ${statusClass}">${statusText}</span></td>
                    <td>
                        <button onclick="window.__inventoryUI.editProduct(${p.id})" style="margin-right:5px;cursor:pointer;">✏️</button>
                        <button onclick="window.__inventoryUI.deleteProduct(${p.id})" style="cursor:pointer;">🗑️</button>
                    </td>
                `;
                tbody.appendChild(tr);
            }
        }

        clearSearch() {
            const input = document.querySelector('#product-search');
            if (input) {
                input.value = '';
                this.searchProducts();
            }
        }

        // ============================================
        // LOW STOCK VIEW
        // ============================================
        async renderLowStock(container) {
            const lowStock = await this.manager.getLowStockProducts();
            
            if (lowStock.length === 0) {
                container.innerHTML = `
                    <div class="alert alert-success">
                        ✅ All products have healthy stock levels!
                    </div>
                `;
                return;
            }

            let html = `
                <h3>⚠️ Low Stock Alert (${lowStock.length} products)</h3>
                <div style="overflow-x:auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>SKU</th>
                                <th>Name</th>
                                <th>Current Stock</th>
                                <th>Threshold</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                    </tbody></table>
                </div>
            `;
            container.innerHTML = html;

            const tbody = container.querySelector('tbody');
            lowStock.forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${p.sku}</td>
                    <td>${p.name}</td>
                    <td class="stock-low">${p.quantity}</td>
                    <td>${CONFIG.LOW_STOCK_THRESHOLD}</td>
                    <td>
                        <button onclick="window.__inventoryUI.showAddStockForm(${p.id})" class="btn-primary" style="padding:4px 12px;border:none;border-radius:4px;cursor:pointer;">📦 Restock</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        // ============================================
        // VALUATION VIEW
        // ============================================
        async renderValuation(container) {
            const valuation = await this.manager.getInventoryValuation();
            
            let html = `
                <h3>💰 Inventory Valuation</h3>
                <div style="background:#f8f9fa;padding:15px;border-radius:8px;margin-bottom:20px;display:flex;flex-wrap:wrap;gap:20px;">
                    <div><strong>Total Value (USD):</strong> $${valuation.totalValueUSD.toFixed(2)}</div>
                    <div><strong>Total Value (NGN):</strong> ₦${valuation.totalValueNGN.toLocaleString()}</div>
                    <div><strong>Products:</strong> ${valuation.details.length}</div>
                </div>
                <div style="overflow-x:auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>SKU</th>
                                <th>Quantity</th>
                                <th>Unit Cost (NGN)</th>
                                <th>Total Value (NGN)</th>
                            </tr>
                        </thead>
                        <tbody>
                    </tbody></table>
                </div>
            `;
            container.innerHTML = html;

            const tbody = container.querySelector('tbody');
            if (valuation.details.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5">No inventory data available</td></tr>';
                return;
            }

            valuation.details.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${item.product}</td>
                    <td>${item.sku}</td>
                    <td>${item.quantity}</td>
                    <td>₦${item.unitCostNGN.toFixed(2)}</td>
                    <td><strong>₦${item.totalValueNGN.toFixed(2)}</strong></td>
                `;
                tbody.appendChild(tr);
            });
        }

        // ============================================
        // MOVEMENTS VIEW
        // ============================================
        async renderMovements(container) {
            const allProducts = await this.manager.getAllProducts();
            let html = `
                <h3>📊 Recent Stock Movements</h3>
                <div style="margin-bottom:15px;">
                    <select id="movement-product-filter" onchange="window.__inventoryUI.loadMovements(this.value)" style="padding:8px;border:1px solid #ddd;border-radius:4px;width:100%;max-width:300px;">
                        <option value="">All Products</option>
                        ${allProducts.map(p => `<option value="${p.id}">${p.sku} - ${p.name}</option>`).join('')}
                    </select>
                </div>
                <div style="overflow-x:auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Type</th>
                                <th>Quantity</th>
                                <th>Note</th>
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody id="movements-table-body">
                    </tbody></table>
                </div>
            `;
            container.innerHTML = html;
            
            await this.loadMovements('');
        }

        async loadMovements(productId) {
            const tbody = document.querySelector('#movements-table-body');
            if (!tbody) return;

            let movements;
            if (productId) {
                movements = await this.manager.getStockMovements(parseInt(productId));
            } else {
                const all = await this.manager.db.getAll('stockMovements');
                movements = all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 100);
            }

            tbody.innerHTML = '';
            if (movements.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5">No movements found</td></tr>';
                return;
            }

            for (const m of movements) {
                const product = await this.manager.db.get('products', m.productId);
                const tr = document.createElement('tr');
                const typeLabels = {
                    'sale': '🛒 Sale',
                    'purchase': '📦 Purchase',
                    'adjustment': '⚙️ Adjustment',
                    'initial': '🚀 Initial'
                };
                const typeClass = m.type === 'sale' ? 'badge-danger' : 
                                 m.type === 'purchase' ? 'badge-success' : 'badge-warning';
                
                tr.innerHTML = `
                    <td>${product ? product.name : 'Unknown'}</td>
                    <td><span class="badge ${typeClass}">${typeLabels[m.type] || m.type}</span></td>
                    <td class="${m.quantity < 0 ? 'stock-low' : 'stock-ok'}">
                        ${m.quantity > 0 ? '+' : ''}${m.quantity}
                    </td>
                    <td>${m.note || '-'}</td>
                    <td>${new Date(m.timestamp).toLocaleString()}</td>
                `;
                tbody.appendChild(tr);
            }
        }

        // ============================================
        // CUSTOMERS VIEW        // ============================================
        async renderCustomers(container) {
            try {
                const customers = await this.manager.getCustomers();
                
                if (!customers || customers.length === 0) {
                    container.innerHTML = `
                        <div class="alert alert-info">
                            👥 No customers saved yet.<br>
                            Add customers from the invoice form when creating invoices.
                        </div>
                    `;
                    return;
                }
                
                let html = `
                    <h3>👥 Customer Database (${customers.length})</h3>
                    <div style="overflow-x:auto; margin-top: 15px;">
                        <table style="width:100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: #f8f9fa;">
                                    <th style="padding: 10px; text-align: left;">Name</th>
                                    <th style="padding: 10px; text-align: left;">Phone</th>
                                    <th style="padding: 10px; text-align: left;">Address</th>
                                    <th style="padding: 10px; text-align: left;">Added</th>
                                </tr>
                            </thead>
                            <tbody>
                `;
                
                customers.forEach(c => {
                    html += `
                        <tr>
                            <td style="padding: 8px 10px; border-bottom: 1px solid #eee;">
                                <strong>${c.name}</strong>
                            </td>
                            <td style="padding: 8px 10px; border-bottom: 1px solid #eee;">
                                ${c.phone || '-'}
                            </td>
                            <td style="padding: 8px 10px; border-bottom: 1px solid #eee;">
                                ${c.address || '-'}
                            </td>
                            <td style="padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 12px; color: #666;">
                                ${c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '-'}
                            </td>
                        </tr>
                    `;
                });
                
                html += `
                            </tbody>
                        </table>
                    </div>
                    <div style="margin-top: 15px; font-size: 13px; color: #666;">
                        Total: ${customers.length} customer${customers.length > 1 ? 's' : ''}
                    </div>
                `;
                
                container.innerHTML = html;
                
            } catch (error) {
                container.innerHTML = `<div class="alert alert-danger">Error loading customers: ${error.message}</div>`;
                console.error('Customer render error:', error);
            }
        }

        // ============================================
        // MODALS - Add Product
        // ============================================
        showAddProductForm() {
            this.showModal(`
                <h3>➕ Add New Product</h3>
                <form id="add-product-form">
                    <div class="form-group">
                        <label>SKU *</label>
                        <input type="text" id="prod-sku" placeholder="e.g., PRD-001" />
                        <small style="color:#666;">Leave blank to auto-generate</small>
                    </div>
                    <div class="form-group">
                        <label>Product Name *</label>
                        <input type="text" id="prod-name" required placeholder="e.g., Gold Chain 18K" />
                    </div>
                    <div class="form-group">
                        <label>Category</label>
                        <input type="text" id="prod-category" placeholder="e.g., Jewelry" />
                    </div>
                    <div class="form-group">
                        <label>Unit Price (NGN ₦)</label>
                        <input type="number" id="prod-price" step="0.01" placeholder="0.00" />
                        <small style="color:#666;">Will be converted to USD at ₦${CONFIG.EXCHANGE_RATE}/$</small>
                    </div>
                    <div class="form-group">
                        <label>Cost Price (NGN ₦)</label>
                        <input type="number" id="prod-cost" step="0.01" placeholder="0.00" />
                    </div>
                    <div class="form-group">
                        <label>Initial Stock</label>
                        <input type="number" id="prod-stock" value="0" min="0" />
                    </div>
                    <div class="form-group">
                        <label>Barcode (optional)</label>
                        <input type="text" id="prod-barcode" placeholder="Scan or enter barcode" />
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn-secondary" onclick="window.__inventoryUI.closeModal()">Cancel</button>
                        <button type="submit" class="btn-primary">Save Product</button>
                    </div>
                </form>
            `);

            document.getElementById('add-product-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const priceNGN = parseFloat(document.getElementById('prod-price').value) || 0;
                const costNGN = parseFloat(document.getElementById('prod-cost').value) || 0;
                
                const data = {
                    sku: document.getElementById('prod-sku').value.trim() || undefined,
                    name: document.getElementById('prod-name').value.trim(),
                    category: document.getElementById('prod-category').value.trim(),
                    unitPriceUSD: priceNGN / CONFIG.EXCHANGE_RATE,
                    costPriceUSD: costNGN / CONFIG.EXCHANGE_RATE,
                    initialStock: parseInt(document.getElementById('prod-stock').value) || 0,
                    barcode: document.getElementById('prod-barcode').value.trim(),
                };

                try {
                    await this.manager.createProduct(data);
                    this.closeModal();
                    this.loadView('products');
                    alert(`✅ Product created successfully!\nPrice: ₦${priceNGN.toFixed(2)} ($${(data.unitPriceUSD).toFixed(2)})`);
                } catch (error) {
                    alert('❌ ' + error.message);
                }
            });
        }

        // ============================================
        // MODALS - Restock
        // ============================================
        showAddStockForm(productId) {
            this.showModal(`
                <h3>📦 Restock Product</h3>
                <form id="restock-form">
                    <div class="form-group">
                        <label>Quantity to Add</label>
                        <input type="number" id="restock-qty" required min="1" placeholder="Enter quantity" />
                    </div>
                    <div class="form-group">
                        <label>Note (optional)</label>
                        <input type="text" id="restock-note" placeholder="e.g., New shipment received" />
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn-secondary" onclick="window.__inventoryUI.closeModal()">Cancel</button>
                        <button type="submit" class="btn-primary">Add Stock</button>
                    </div>
                </form>
            `);

            document.getElementById('restock-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const quantity = parseInt(document.getElementById('restock-qty').value);
                const note = document.getElementById('restock-note').value.trim();

                try {
                    await this.manager.updateStock(productId, quantity, 'purchase', note || 'Manual restock');
                    this.closeModal();
                    this.loadView('lowstock');
                    alert('✅ Stock updated successfully!');
                } catch (error) {
                    alert('❌ ' + error.message);
                }
            });
        }

        // ============================================
        // EDIT / DELETE PRODUCT
        // ============================================
        async editProduct(productId) {
            const product = await this.manager.db.get('products', productId);
            if (!product) return;

            const inv = await this.manager.db.query('inventory', 'productId', productId);
            const stock = inv.length > 0 ? inv[0].quantity : 0;
            const priceNGN = (product.unitPriceUSD || 0) * CONFIG.EXCHANGE_RATE;

            this.showModal(`
                <h3>✏️ Edit Product</h3>
                <form id="edit-product-form">
                    <div class="form-group">
                        <label>SKU *</label>
                        <input type="text" id="edit-sku" value="${product.sku}" required />
                    </div>
                    <div class="form-group">
                        <label>Product Name *</label>
                        <input type="text" id="edit-name" value="${product.name}" required />
                    </div>
                    <div class="form-group">
                        <label>Category</label>
                        <input type="text" id="edit-category" value="${product.category || ''}" />
                    </div>
                    <div class="form-group">
                        <label>Unit Price (NGN ₦)</label>
                        <input type="number" id="edit-price" step="0.01" value="${priceNGN.toFixed(2)}" />
                    </div>
                    <div class="form-group">
                        <label>Current Stock</label>
                        <input type="number" id="edit-stock" value="${stock}" disabled style="background:#f0f0f0;" />
                        <small style="color:#666;">Use "Restock" to change inventory</small>
                    </div>
                    <div class="form-group">
                        <label>Barcode</label>
                        <input type="text" id="edit-barcode" value="${product.barcode || ''}" />
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn-secondary" onclick="window.__inventoryUI.closeModal()">Cancel</button>
                        <button type="submit" class="btn-primary">Update Product</button>
                    </div>
                </form>
            `);

            document.getElementById('edit-product-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const priceNGN = parseFloat(document.getElementById('edit-price').value) || 0;
                
                const updates = {
                    sku: document.getElementById('edit-sku').value.trim(),
                    name: document.getElementById('edit-name').value.trim(),
                    category: document.getElementById('edit-category').value.trim(),
                    unitPriceUSD: priceNGN / CONFIG.EXCHANGE_RATE,
                    barcode: document.getElementById('edit-barcode').value.trim(),
                };

                try {
                    await this.manager.updateProduct(productId, updates);
                    this.closeModal();
                    this.loadView('products');
                    alert('✅ Product updated successfully!');
                } catch (error) {
                    alert('❌ ' + error.message);
                }
            });
        }

        async deleteProduct(productId) {
            if (!confirm('Are you sure you want to delete this product? This cannot be undone.')) return;
            
            try {
                await this.manager.deleteProduct(productId);
                this.loadView('products');
                alert('✅ Product deleted successfully');
            } catch (error) {
                alert('❌ ' + error.message);
            }
        }

        // ============================================
        // MODAL HELPERS
        // ============================================
        showModal(html) {
            this.closeModal();
            
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.innerHTML = `
                <div class="modal-content">
                    ${html}
                </div>
            `;
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.closeModal();
            });
            document.body.appendChild(overlay);
            this._modalOverlay = overlay;
        }

        closeModal() {
            if (this._modalOverlay) {
                this._modalOverlay.remove();
                this._modalOverlay = null;
            }
        }
    }

    // ============================================
    // INITIALIZATION
    // ============================================
    async function initUI() {
        try {
            // Wait for inventory
            let attempts = 0;
            while (!window.__inventory && attempts < 20) {
                await new Promise(resolve => setTimeout(resolve, 500));
                attempts++;
            }
            
            if (!window.__inventory) {
                console.error('❌ Inventory not available for UI');
                return;
            }

            const manager = window.__inventory.manager;
            const ui = new InventoryUI(manager);
            
            // Store globally
            window.__inventoryUI = ui;

            // Inject UI after a small delay
            setTimeout(() => ui.render(), 500);

            console.log('✅ Inventory UI loaded!');
            console.log('📚 Use window.__inventoryUI to interact');

        } catch (error) {
            console.error('❌ UI init failed:', error);
        }
    }

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }

})();
