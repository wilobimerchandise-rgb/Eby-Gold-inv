// ============================================
// EBY-GOLD INVENTORY MODULE
// Self-contained - No modifications to existing code
// ============================================

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
        DB_NAME: 'EbyGoldInventoryDB',
        DB_VERSION: 1,
        STORES: ['products', 'inventory', 'stockMovements', 'categories', 'suppliers'],
        LOW_STOCK_THRESHOLD: 10,
        SYNC_INTERVAL: 30000, // 30 seconds
    };

    // ============================================
    // INDEXEDDB MANAGER
    // ============================================
    class InventoryDB {
        constructor() {
            this.db = null;
            this.isReady = false;
        }

        async init() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    CONFIG.STORES.forEach(storeName => {
                        if (!db.objectStoreNames.contains(storeName)) {
                            const store = db.createObjectStore(storeName, { 
                                keyPath: 'id', 
                                autoIncrement: true 
                            });
                            // Create indexes for faster queries
                            if (storeName === 'products') {
                                store.createIndex('sku', 'sku', { unique: true });
                                store.createIndex('name', 'name');
                                store.createIndex('category', 'category');
                                store.createIndex('barcode', 'barcode');
                            }
                            if (storeName === 'inventory') {
                                store.createIndex('productId', 'productId', { unique: true });
                                store.createIndex('quantity', 'quantity');
                            }
                            if (storeName === 'stockMovements') {
                                store.createIndex('productId', 'productId');
                                store.createIndex('timestamp', 'timestamp');
                                store.createIndex('type', 'type');
                            }
                            if (storeName === 'categories') {
                                store.createIndex('name', 'name');
                            }
                            if (storeName === 'suppliers') {
                                store.createIndex('name', 'name');
                            }
                        }
                    });
                };

                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    this.isReady = true;
                    console.log('📦 Inventory DB initialized');
                    resolve();
                };

                request.onerror = (event) => {
                    console.error('❌ Inventory DB initialization failed:', event.target.error);
                    reject(event.target.error);
                };
            });
        }

        async add(storeName, data) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.add(data);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async get(storeName, id) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.get(id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async getAll(storeName) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async update(storeName, data) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.put(data);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async delete(storeName, id) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.delete(id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        async query(storeName, indexName, value) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const index = store.index(indexName);
                const request = index.getAll(value);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async searchProducts(query) {
            const allProducts = await this.getAll('products');
            const lowerQuery = query.toLowerCase();
            return allProducts.filter(p => 
                p.name.toLowerCase().includes(lowerQuery) ||
                p.sku.toLowerCase().includes(lowerQuery) ||
                (p.barcode && p.barcode.includes(query))
            );
        }
    }

    // ============================================
    // INVENTORY MANAGER (Business Logic)
    // ============================================
    class InventoryManager {
        constructor(db) {
            this.db = db;
            this.listeners = {};
        }

        // --- Product Operations ---
        async createProduct(productData) {
            // Validate required fields
            if (!productData.name || !productData.sku) {
                throw new Error('Product name and SKU are required');
            }

            // Check for duplicate SKU
            const existing = await this.db.query('products', 'sku', productData.sku);
            if (existing.length > 0) {
                throw new Error(`Product with SKU "${productData.sku}" already exists`);
            }

            const product = {
                ...productData,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            const productId = await this.db.add('products', product);

            // Initialize inventory for this product
            await this.db.add('inventory', {
                productId: productId,
                quantity: productData.initialStock || 0,
                reserved: 0,
                lowThreshold: CONFIG.LOW_STOCK_THRESHOLD,
                lastUpdated: new Date().toISOString()
            });

            // Log initial stock movement
            if (productData.initialStock > 0) {
                await this.db.add('stockMovements', {
                    productId: productId,
                    quantity: productData.initialStock,
                    type: 'initial',
                    note: 'Initial stock setup',
                    timestamp: new Date().toISOString(),
                    userId: 'system'
                });
            }

            this.triggerEvent('productCreated', { productId, product });
            return productId;
        }

        async updateProduct(productId, updates) {
            const product = await this.db.get('products', productId);
            if (!product) throw new Error('Product not found');

            const updated = { ...product, ...updates, updatedAt: new Date().toISOString() };
            await this.db.update('products', updated);
            this.triggerEvent('productUpdated', { productId, product: updated });
            return updated;
        }

        async deleteProduct(productId) {
            const inventory = await this.db.query('inventory', 'productId', productId);
            if (inventory.length > 0 && inventory[0].quantity > 0) {
                throw new Error('Cannot delete product with existing stock');
            }

            await this.db.delete('products', productId);
            await this.db.delete('inventory', productId);
            this.triggerEvent('productDeleted', { productId });
        }

        async getAllProducts() {
            return await this.db.getAll('products');
        }

        async searchProducts(query) {
            return await this.db.searchProducts(query);
        }

        async getProductWithStock(productId) {
            const product = await this.db.get('products', productId);
            if (!product) return null;
            const inventory = await this.db.query('inventory', 'productId', productId);
            return {
                ...product,
                stock: inventory.length > 0 ? inventory[0].quantity : 0,
                reserved: inventory.length > 0 ? inventory[0].reserved : 0,
                available: inventory.length > 0 ? inventory[0].quantity - (inventory[0].reserved || 0) : 0
            };
        }

        // --- Stock Operations ---
        async updateStock(productId, quantityChange, type, note = '') {
            const inventoryRecords = await this.db.query('inventory', 'productId', productId);
            if (inventoryRecords.length === 0) {
                throw new Error('Inventory record not found for product');
            }

            const inventory = inventoryRecords[0];
            const newQuantity = inventory.quantity + quantityChange;

            if (newQuantity < 0) {
                throw new Error('Insufficient stock');
            }

            inventory.quantity = newQuantity;
            inventory.lastUpdated = new Date().toISOString();
            await this.db.update('inventory', inventory);

            // Log movement
            await this.db.add('stockMovements', {
                productId: productId,
                quantity: quantityChange,
                type: type,
                note: note,
                timestamp: new Date().toISOString(),
                userId: 'system' // Should come from auth context
            });

            this.triggerEvent('stockUpdated', { 
                productId, 
                newQuantity, 
                change: quantityChange,
                type 
            });

            // Check for low stock alert
            if (newQuantity < CONFIG.LOW_STOCK_THRESHOLD) {
                this.triggerEvent('lowStockAlert', { productId, quantity: newQuantity });
            }

            return newQuantity;
        }

        async deductStockForInvoice(invoiceItems) {
            const results = [];
            for (const item of invoiceItems) {
                try {
                    const newQty = await this.updateStock(
                        item.productId,
                        -item.quantity,
                        'sale',
                        `Invoice #${item.invoiceId || 'unknown'}`
                    );
                    results.push({ productId: item.productId, success: true, newQty });
                } catch (error) {
                    results.push({ productId: item.productId, success: false, error: error.message });
                }
            }
            return results;
        }

        // --- Reports ---
        async getLowStockProducts() {
            const allInventory = await this.db.getAll('inventory');
            const lowStock = allInventory.filter(i => i.quantity < CONFIG.LOW_STOCK_THRESHOLD);
            
            const products = [];
            for (const inv of lowStock) {
                const product = await this.db.get('products', inv.productId);
                if (product) {
                    products.push({ ...product, quantity: inv.quantity });
                }
            }
            return products;
        }

        async getInventoryValuation() {
            const allProducts = await this.db.getAll('products');
            let totalValue = 0;
            const details = [];

            for (const product of allProducts) {
                const inv = await this.db.query('inventory', 'productId', product.id);
                if (inv.length > 0 && inv[0].quantity > 0) {
                    const value = inv[0].quantity * (product.costPrice || product.unitPrice || 0);
                    totalValue += value;
                    details.push({
                        product: product.name,
                        sku: product.sku,
                        quantity: inv[0].quantity,
                        unitCost: product.costPrice || product.unitPrice || 0,
                        totalValue: value
                    });
                }
            }

            return { totalValue, details };
        }

        async getStockMovements(productId, limit = 100) {
            const allMovements = await this.db.getAll('stockMovements');
            return allMovements
                .filter(m => m.productId === productId)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, limit);
        }

        // --- Event System (Integration hooks) ---
        on(event, callback) {
            if (!this.listeners[event]) this.listeners[event] = [];
            this.listeners[event].push(callback);
        }

        triggerEvent(event, data) {
            if (this.listeners[event]) {
                this.listeners[event].forEach(cb => cb(data));
            }
        }
    }

    // ============================================
    // UI COMPONENT (Self-contained HTML/CSS)
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
                    margin: 0 auto;
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
                    min-height: 400px;
                }
                #eby-inventory-module .search-bar {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 15px;
                }
                #eby-inventory-module .search-bar input {
                    flex: 1;
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
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
                #eby-inventory-module .btn-secondary {
                    background: #6c757d;
                    color: white;
                }
                #eby-inventory-module .btn-danger {
                    background: #dc3545;
                    color: white;
                }
                #eby-inventory-module .btn-primary:hover {
                    background: #0056b3;
                }
                #eby-inventory-module .btn-secondary:hover {
                    background: #5a6268;
                }
                #eby-inventory-module .btn-danger:hover {
                    background: #c82333;
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
                #eby-inventory-module .stock-low {
                    color: #dc3545;
                    font-weight: 600;
                }
                #eby-inventory-module .stock-ok {
                    color: #28a745;
                }
                @media (max-width: 768px) {
                    #eby-inventory-module .nav-tabs button {
                        flex: 1;
                        min-width: 80px;
                        font-size: 12px;
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
                    <button class="btn-primary" onclick="window.__inventoryUI.showAddProductForm()">
                        + Add Product
                    </button>
                </div>
                <div class="nav-tabs">
                    <button class="active" data-view="products">Products</button>
                    <button data-view="lowstock">Low Stock</button>
                    <button data-view="valuation">Valuation</button>
                    <button data-view="movements">Recent Movements</button>
                </div>
                <div class="view-container" id="inventory-view-content">
                    Loading...
                </div>
            `;

            // Find where to insert - try to append to body or a main container
            const target = document.querySelector('main') || document.querySelector('.container') || document.body;
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
                    default:
                        content.innerHTML = '<p>View not found</p>';
                }
            } catch (error) {
                content.innerHTML = `<div class="alert alert-danger">Error loading view: ${error.message}</div>`;
                console.error('View load error:', error);
            }
        }

        async renderProducts(container) {
            const products = await this.manager.getAllProducts();
            
            if (products.length === 0) {
                container.innerHTML = `
                    <div class="alert alert-info">
                        No products found. Click "Add Product" to get started.
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
                                <th>Price</th>
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
            products.forEach(p => {
                const tr = document.createElement('tr');
                const stockStatus = p.stock !== undefined ? p.stock : 0;
                const statusClass = stockStatus < CONFIG.LOW_STOCK_THRESHOLD ? 'badge-danger' : 'badge-success';
                const statusText = stockStatus < CONFIG.LOW_STOCK_THRESHOLD ? 'Low Stock' : 'In Stock';
                
                tr.innerHTML = `
                    <td><strong>${p.sku}</strong></td>
                    <td>${p.name}</td>
                    <td>${p.category || '-'}</td>
                    <td>$${(p.unitPrice || 0).toFixed(2)}</td>
                    <td class="${stockStatus < CONFIG.LOW_STOCK_THRESHOLD ? 'stock-low' : 'stock-ok'}">
                        ${stockStatus}
                    </td>
                    <td><span class="badge ${statusClass}">${statusText}</span></td>
                    <td>
                        <button onclick="window.__inventoryUI.editProduct(${p.id})" style="margin-right:5px;">✏️</button>
                        <button onclick="window.__inventoryUI.deleteProduct(${p.id})">🗑️</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // Setup search
            const searchInput = container.querySelector('#product-search');
            if (searchInput) {
                searchInput.addEventListener('input', debounce(() => {
                    this.searchProducts();
                }, 300));
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
            products.forEach(p => {
                const tr = document.createElement('tr');
                const stockStatus = p.stock !== undefined ? p.stock : 0;
                const statusClass = stockStatus < CONFIG.LOW_STOCK_THRESHOLD ? 'badge-danger' : 'badge-success';
                const statusText = stockStatus < CONFIG.LOW_STOCK_THRESHOLD ? 'Low Stock' : 'In Stock';
                
                tr.innerHTML = `
                    <td><strong>${p.sku}</strong></td>
                    <td>${p.name}</td>
                    <td>${p.category || '-'}</td>
                    <td>$${(p.unitPrice || 0).toFixed(2)}</td>
                    <td class="${stockStatus < CONFIG.LOW_STOCK_THRESHOLD ? 'stock-low' : 'stock-ok'}">
                        ${stockStatus}
                    </td>
                    <td><span class="badge ${statusClass}">${statusText}</span></td>
                    <td>
                        <button onclick="window.__inventoryUI.editProduct(${p.id})" style="margin-right:5px;">✏️</button>
                        <button onclick="window.__inventoryUI.deleteProduct(${p.id})">🗑️</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        clearSearch() {
            const input = document.querySelector('#product-search');
            if (input) {
                input.value = '';
                this.searchProducts();
            }
        }

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
                        <button onclick="window.__inventoryUI.showAddStockForm(${p.id})">📦 Restock</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        async renderValuation(container) {
            const valuation = await this.manager.getInventoryValuation();
            
            let html = `
                <h3>💰 Inventory Valuation</h3>
                <div style="background:#f8f9fa;padding:15px;border-radius:8px;margin-bottom:20px;">
                    <strong>Total Value:</strong> $${valuation.totalValue.toFixed(2)}
                </div>
                <div style="overflow-x:auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>SKU</th>
                                <th>Quantity</th>
                                <th>Unit Cost</th>
                                <th>Total Value</th>
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
                    <td>$${item.unitCost.toFixed(2)}</td>
                    <td><strong>$${item.totalValue.toFixed(2)}</strong></td>
                `;
                tbody.appendChild(tr);
            });
        }

        async renderMovements(container) {
            const allProducts = await this.manager.getAllProducts();
            let html = `
                <h3>📊 Recent Stock Movements</h3>
                <div style="margin-bottom:15px;">
                    <select id="movement-product-filter" onchange="window.__inventoryUI.loadMovements(this.value)">
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
            
            // Load all movements initially
            await this.loadMovements('');
        }

        async loadMovements(productId) {
            const tbody = document.querySelector('#movements-table-body');
            if (!tbody) return;

            let movements;
            if (productId) {
                movements = await this.manager.getStockMovements(parseInt(productId));
            } else {
                // Get all movements (limited to last 100)
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

        // --- Modal Forms ---
        showAddProductForm() {
            this.showModal(`
                <h3>➕ Add New Product</h3>
                <form id="add-product-form">
                    <div class="form-group">
                        <label>SKU *</label>
                        <input type="text" id="prod-sku" required placeholder="e.g., PRD-001" />
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
                        <label>Unit Price ($)</label>
                        <input type="number" id="prod-price" step="0.01" placeholder="0.00" />
                    </div>
                    <div class="form-group">
                        <label>Cost Price ($)</label>
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
                const data = {
                    sku: document.getElementById('prod-sku').value.trim(),
                    name: document.getElementById('prod-name').value.trim(),
                    category: document.getElementById('prod-category').value.trim(),
                    unitPrice: parseFloat(document.getElementById('prod-price').value) || 0,
                    costPrice: parseFloat(document.getElementById('prod-cost').value) || 0,
                    initialStock: parseInt(document.getElementById('prod-stock').value) || 0,
                    barcode: document.getElementById('prod-barcode').value.trim(),
                };

                try {
                    await this.manager.createProduct(data);
                    this.closeModal();
                    this.loadView('products');
                    this.showToast('✅ Product created successfully!', 'success');
                } catch (error) {
                    this.showToast('❌ ' + error.message, 'danger');
                }
            });
        }

        showAddStockForm(productId) {
            this.showModal(`
                <h3>📦 Restock Product</h
