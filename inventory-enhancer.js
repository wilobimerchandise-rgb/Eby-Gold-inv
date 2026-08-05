// ============================================
// CURRENCY CONFIGURATION
// ============================================
const CURRENCY_CONFIG = {
    // Base currency for inventory (what products are priced in)
    baseCurrency: 'USD',
    
    // Display currency for invoices (what customers see)
    displayCurrency: 'NGN',
    
    // Exchange rate (NGN per 1 USD) - Update this regularly!
    exchangeRate: 1600, // As of August 2026
    
    // Currency symbols
    symbols: {
        USD: '$',
        NGN: '₦'
    }
};

// Helper function to format currency
function formatCurrency(amount, currency = CURRENCY_CONFIG.displayCurrency) {
    const symbol = CURRENCY_CONFIG.symbols[currency] || currency;
    const formatted = amount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    return `${symbol}${formatted}`;
}

// Convert USD to NGN
function usdToNgn(usdAmount) {
    return usdAmount * CURRENCY_CONFIG.exchangeRate;
}

// Convert NGN to USD
function ngnToUsd(ngnAmount) {
    return ngnAmount / CURRENCY_CONFIG.exchangeRate;
}// ============================================
// EBY-GOLD INVENTORY ENHANCER
// Drop-in module - No code changes needed!
// ============================================

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
        DB_NAME: 'EbyGoldInventoryDB',
        DB_VERSION: 2,
        LOW_STOCK_THRESHOLD: 10,
        CURRENCY: 'NGN',
        INVOICE_TABLE_SELECTOR: 'table', // Will auto-detect your invoice table
        BANK_DETAILS: {
            bank: 'UBA',
            accountNo: '2189015307',
            accountName: 'Ebere Favour Akalola'
        }
    };

    // ============================================
    // INVENTORY DATABASE (IndexedDB)
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
                    
                    // Products store
                    if (!db.objectStoreNames.contains('products')) {
                        const productStore = db.createObjectStore('products', { 
                            keyPath: 'id', 
                            autoIncrement: true 
                        });
                        productStore.createIndex('sku', 'sku', { unique: true });
                        productStore.createIndex('name', 'name');
                        productStore.createIndex('category', 'category');
                    }

                    // Inventory store
                    if (!db.objectStoreNames.contains('inventory')) {
                        const invStore = db.createObjectStore('inventory', { 
                            keyPath: 'productId' 
                        });
                        invStore.createIndex('quantity', 'quantity');
                    }

                    // Stock movements store
                    if (!db.objectStoreNames.contains('stockMovements')) {
                        const moveStore = db.createObjectStore('stockMovements', { 
                            keyPath: 'id', 
                            autoIncrement: true 
                        });
                        moveStore.createIndex('productId', 'productId');
                        moveStore.createIndex('timestamp', 'timestamp');
                        moveStore.createIndex('type', 'type');
                    }

                    // Invoice history store (track which invoices used which stock)
                    if (!db.objectStoreNames.contains('invoiceHistory')) {
                        const invHistStore = db.createObjectStore('invoiceHistory', { 
                            keyPath: 'invoiceNumber' 
                        });
                        invHistStore.createIndex('date', 'date');
                    }
                };

                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    this.isReady = true;
                    console.log('📦 Inventory DB ready');
                    resolve();
                };

                request.onerror = (event) => {
                    console.error('❌ DB init failed:', event.target.error);
                    reject(event.target.error);
                };
            });
        }

        async add(storeName, data) {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([storeName], 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.add(data);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async get(storeName, id) {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([storeName], 'readonly');
                const store = tx.objectStore(storeName);
                const request = store.get(id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async getAll(storeName) {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([storeName], 'readonly');
                const store = tx.objectStore(storeName);
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async update(storeName, data) {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([storeName], 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.put(data);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async delete(storeName, id) {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([storeName], 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.delete(id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        async query(storeName, indexName, value) {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([storeName], 'readonly');
                const store = tx.objectStore(storeName);
                const index = store.index(indexName);
                const request = index.getAll(value);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async searchProducts(query) {
            const all = await this.getAll('products');
            const q = query.toLowerCase();
            return all.filter(p => 
                p.name.toLowerCase().includes(q) ||
                (p.sku && p.sku.toLowerCase().includes(q)) ||
                (p.category && p.category.toLowerCase().includes(q))
            );
        }
    }

    // ============================================
    // INVENTORY MANAGER
    // ============================================
    class InventoryManager {
        constructor(db) {
            this.db = db;
        }

        async createProduct(data) {
            if (!data.name) throw new Error('Product name is required');
            
            // Check for duplicate name
            const existing = await this.db.query('products', 'name', data.name);
            if (existing.length > 0) {
                throw new Error(`Product "${data.name}" already exists`);
            }

            const product = {
                name: data.name,
                sku: data.sku || this.generateSKU(data.name),
                category: data.category || 'General',
                unitPrice: data.unitPrice || 0,
                costPrice: data.costPrice || 0,
                barcode: data.barcode || '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const id = await this.db.add('products', product);
            
            // Initialize inventory
            await this.db.add('inventory', {
                productId: id,
                quantity: data.initialStock || 0,
                lowThreshold: CONFIG.LOW_STOCK_THRESHOLD,
                lastUpdated: new Date().toISOString()
            });

            return id;
        }

        generateSKU(name) {
            const prefix = name.substring(0, 3).toUpperCase();
            const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            return `${prefix}-${random}`;
        }

        async getAllProducts() {
            return await this.db.getAll('products');
        }

        async getProductWithStock(productId) {
            const product = await this.db.get('products', productId);
            if (!product) return null;
            const inv = await this.db.query('inventory', 'productId', productId);
            return {
                ...product,
                quantity: inv.length > 0 ? inv[0].quantity : 0,
                lowThreshold: inv.length > 0 ? inv[0].lowThreshold : CONFIG.LOW_STOCK_THRESHOLD
            };
        }

        async getProductByName(name) {
            const products = await this.db.query('products', 'name', name);
            if (products.length === 0) return null;
            return await this.getProductWithStock(products[0].id);
        }

        async updateStock(productId, quantityChange, type, note = '', invoiceNumber = '') {
            const invRecords = await this.db.query('inventory', 'productId', productId);
            if (invRecords.length === 0) {
                throw new Error('Inventory record not found');
            }

            const inv = invRecords[0];
            const newQuantity = inv.quantity + quantityChange;
            if (newQuantity < 0) {
                throw new Error('Insufficient stock');
            }

            inv.quantity = newQuantity;
            inv.lastUpdated = new Date().toISOString();
            await this.db.update('inventory', inv);

            // Log movement
            await this.db.add('stockMovements', {
                productId: productId,
                quantity: quantityChange,
                type: type,
                note: note,
                invoiceNumber: invoiceNumber,
                timestamp: new Date().toISOString()
            });

            // Check low stock
            if (newQuantity < CONFIG.LOW_STOCK_THRESHOLD) {
                this.showAlert(`⚠️ Low stock alert: Product ID ${productId} has ${newQuantity} units left`);
            }

            return newQuantity;
        }

        async deductStockForInvoice(invoiceNumber, items) {
            const results = [];
            for (const item of items) {
                try {
                    const product = await this.getProductByName(item.name);
                    if (!product) {
                        // Product not in inventory - auto-create it
                        const newId = await this.createProduct({
                            name: item.name,
                            unitPrice: item.rate,
                            initialStock: 0
                        });
                        results.push({ 
                            productName: item.name, 
                            status: 'created', 
                            newProductId: newId 
                        });
                        continue;
                    }

                    const newQty = await this.updateStock(
                        product.id,
                        -item.qty,
                        'sale',
                        `Invoice ${invoiceNumber}`,
                        invoiceNumber
                    );
                    results.push({ 
                        productName: item.name, 
                        status: 'deducted', 
                        remaining: newQty 
                    });
                } catch (error) {
                    results.push({ 
                        productName: item.name, 
                        status: 'error', 
                        error: error.message 
                    });
                }
            }
            return results;
        }

        async getLowStockProducts() {
            const allInv = await this.db.getAll('inventory');
            const low = allInv.filter(i => i.quantity < CONFIG.LOW_STOCK_THRESHOLD);
            const products = [];
            for (const inv of low) {
                const product = await this.db.get('products', inv.productId);
                if (product) {
                    products.push({ ...product, quantity: inv.quantity });
                }
            }
            return products;
        }

        showAlert(message) {
            // Try to use your app's notification system, or fallback to alert
            if (window.showNotification) {
                window.showNotification(message, 'warning');
            } else {
                // Create a friendly toast notification
                const toast = document.createElement('div');
                toast.style.cssText = `
                    position: fixed;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #ff9800;
                    color: white;
                    padding: 12px 24px;
                    border-radius: 8px;
                    z-index: 99999;
                    font-family: Arial, sans-serif;
                    font-size: 14px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    animation: slideUp 0.3s ease;
                    max-width: 90%;
                `;
                toast.textContent = message;
                document.body.appendChild(toast);
                setTimeout(() => {
                    toast.style.opacity = '0';
                    toast.style.transition = 'opacity 0.3s';
                    setTimeout(() => toast.remove(), 300);
                }, 5000);
            }
        }
    }

    // ============================================
    // INVOICE DETECTOR & ENHANCER
    // ============================================
    class InvoiceEnhancer {
        constructor(manager) {
            this.manager = manager;
            this.invoiceNumber = '';
            this.items = [];
        }

        detectInvoice() {
            // Try to find the invoice number
            const docNoElements = document.querySelectorAll('*');
            for (const el of docNoElements) {
                if (el.textContent && el.textContent.includes('DOCUMENT NO:')) {
                    const match = el.textContent.match(/DOCUMENT NO:\s*(#?[\w-]+)/);
                    if (match) {
                        this.invoiceNumber = match[1];
                        break;
                    }
                }
            }

            // If not found, try other patterns
            if (!this.invoiceNumber) {
                const text = document.body.textContent;
                const match = text.match(/#?EGS-INV-[\d]+/);
                if (match) {
                    this.invoiceNumber = match[0];
                }
            }

            console.log('📄 Detected Invoice:', this.invoiceNumber);
            return this.invoiceNumber;
        }

        extractItems() {
            const items = [];
            
            // Method 1: Look for the table structure from your screenshot
            // Find any table with item data
            const tables = document.querySelectorAll('table');
            for (const table of tables) {
                const rows = table.querySelectorAll('tr');
                let isItemTable = false;
                let headers = [];

                // Check if this is the item table by looking for headers
                const headerRow = rows[0];
                if (headerRow) {
                    const cells = headerRow.querySelectorAll('th, td');
                    const headerTexts = Array.from(cells).map(c => c.textContent.trim());
                    // Look for S/N, Items, Qty, Rate, Total
                    if (headerTexts.some(h => /S\/N|#|No/.test(h)) &&
                        headerTexts.some(h => /Item|Product|Description/.test(h)) &&
                        headerTexts.some(h => /Qty|Quantity/.test(h)) &&
                        headerTexts.some(h => /Rate|Price/.test(h)) &&
                        headerTexts.some(h => /Total|Amount/.test(h))) {
                        isItemTable = true;
                        headers = headerTexts;
                    }
                }

                if (isItemTable) {
                    // Parse data rows (skip header)
                    for (let i = 1; i < rows.length; i++) {
                        const cells = rows[i].querySelectorAll('td');
                        if (cells.length >= 4) {
                            const itemName = cells[1] ? cells[1].textContent.trim() : '';
                            const qty = parseFloat(cells[2] ? cells[2].textContent.replace(/,/g, '') : '0');
                            const rate = parseFloat(cells[3] ? cells[3].textContent.replace(/,/g, '').replace(/[A-Za-z\s]/g, '') : '0');
                            const total = parseFloat(cells[4] ? cells[4].textContent.replace(/,/g, '').replace(/[A-Za-z\s]/g, '') : '0');
                            
                            if (itemName && !isNaN(qty) && qty > 0) {
                                items.push({
                                    name: itemName,
                                    qty: qty,
                                    rate: rate,
                                    total: total
                                });
                            }
                        }
                    }
                    break;
                }
            }

            // Method 2: Fallback - look for the specific items from your screenshot
            if (items.length === 0) {
                // Look for known item patterns in the text
                const text = document.body.textContent;
                const lines = text.split('\n');
                let foundItems = false;
                
                for (const line of lines) {
                    // Try to parse lines like: "1   Insecticide    15   NGN 500    NGN 7,500"
                    const match = line.match(/(\d+)\s+([A-Za-z\s]+?)\s+([\d,]+)\s+[A-Za-z]*\s*([\d,.]+)\s+[A-Za-z]*\s*([\d,.]+)/);
                    if (match) {
                        const name = match[2].trim();
                        const qty = parseFloat(match[3].replace(/,/g, ''));
                        const rate = parseFloat(match[4].replace(/,/g, ''));
                        const total = parseFloat(match[5].replace(/,/g, ''));
                        items.push({ name, qty, rate, total });
                        foundItems = true;
                    }
                }

                // If still no items, try a simpler pattern
                if (!foundItems) {
                    const itemMatches = text.match(/([A-Za-z][A-Za-z\s]+?)\s+([\d,]+)\s+[A-Za-z]*\s*([\d,.]+)/g);
                    if (itemMatches) {
                        for (const m of itemMatches) {
                            const parts = m.match(/([A-Za-z][A-Za-z\s]+?)\s+([\d,]+)\s+[A-Za-z]*\s*([\d,.]+)/);
                            if (parts) {
                                const name = parts[1].trim();
                                const qty = parseFloat(parts[2].replace(/,/g, ''));
                                const rate = parseFloat(parts[3].replace(/,/g, ''));
                                if (name && !isNaN(qty) && qty > 0) {
                                    items.push({ name, qty, rate, total: qty * rate });
                                }
                            }
                        }
                    }
                }
            }

            this.items = items;
            console.log('📊 Extracted items:', items);
            return items;
        }

        addInventoryBadges() {
            // Add stock badges to the item table
            const tables = document.querySelectorAll('table');
            for (const table of tables) {
                const rows = table.querySelectorAll('tr');
                let headerRow = rows[0];
                if (headerRow) {
                    const cells = headerRow.querySelectorAll('th, td');
                    const headerTexts = Array.from(cells).map(c => c.textContent.trim());
                    
                    if (headerTexts.some(h => /Item|Product/.test(h))) {
                        // Add a "Stock" column header if not exists
                        if (!headerTexts.some(h => /Stock|Inv/.test(h))) {
                            const newHeader = document.createElement('th');
                            newHeader.textContent = 'Stock';
                            newHeader.style.cssText = 'background: #f8f9fa; text-align: center;';
                            headerRow.appendChild(newHeader);
                        }

                        // Add stock data to each row
                        for (let i = 1; i < rows.length; i++) {
                            const row = rows[i];
                            const cells = row.querySelectorAll('td');
                            if (cells.length >= 2) {
                                const itemName = cells[1] ? cells[1].textContent.trim() : '';
                                const stockCell = document.createElement('td');
                                stockCell.style.cssText = 'text-align: center; font-weight: bold;';
                                
                                if (itemName) {
                                    this.manager.getProductByName(itemName).then(product => {
                                        if (product) {
                                            const qty = product.quantity || 0;
                                            stockCell.textContent = qty;
                                            stockCell.style.color = qty < CONFIG.LOW_STOCK_THRESHOLD ? '#dc3545' : '#28a745';
                                        } else {
                                            stockCell.textContent = '❌';
                                            stockCell.title = 'Not in inventory';
                                        }
                                    }).catch(() => {
                                        stockCell.textContent = '?';
                                    });
                                } else {
                                    stockCell.textContent = '-';
                                }
                                row.appendChild(stockCell);
                            }
                        }
                        break;
                    }
                }
            }
        }

        addInventoryFooter() {
            // Add inventory summary below the invoice
            const invoiceContainer = this.findInvoiceContainer();
            if (!invoiceContainer) return;

            const summaryDiv = document.createElement('div');
            summaryDiv.id = 'inventory-summary';
            summaryDiv.style.cssText = `
                margin-top: 20px;
                padding: 15px;
                background: #f8f9fa;
                border-radius: 8px;
                font-family: Arial, sans-serif;
                font-size: 14px;
                border-left: 4px solid #007bff;
            `;

            // Check stock status for each item
            const statusPromises = this.items.map(async (item) => {
                const product = await this.manager.getProductByName(item.name);
                if (product) {
                    const available = product.quantity || 0;
                    const status = available >= item.qty ? '✅ Sufficient' : '⚠️ Insufficient';
                    return {
                        name: item.name,
                        required: item.qty,
                        available: available,
                        status: status,
                        ok: available >= item.qty
                    };
                } else {
                    return {
                        name: item.name,
                        required: item.qty,
                        available: 0,
                        status: '❌ Not in inventory',
                        ok: false
                    };
                }
            });

            Promise.all(statusPromises).then(statuses => {
                const allOk = statuses.every(s => s.ok);
                
                let html = `<h4 style="margin: 0 0 10px 0;">📦 Inventory Status</h4>`;
                html += `<table style="width:100%; border-collapse: collapse; font-size: 13px;">`;
                html += `<tr style="background: #e9ecef;">
                            <th style="padding: 5px 10px; text-align: left;">Item</th>
                            <th style="padding: 5px 10px; text-align: center;">Required</th>
                            <th style="padding: 5px 10px; text-align: center;">Available</th>
                            <th style="padding: 5px 10px; text-align: center;">Status</th>
                        </tr>`;
                
                for (const s of statuses) {
                    const color = s.ok ? '#28a745' : '#dc3545';
                    html += `<tr>
                                <td style="padding: 5px 10px;">${s.name}</td>
                                <td style="padding: 5px 10px; text-align: center;">${s.required}</td>
                                <td style="padding: 5px 10px; text-align: center; color: ${s.available < CONFIG.LOW_STOCK_THRESHOLD ? '#dc3545' : '#28a745'};">${s.available}</td>
                                <td style="padding: 5px 10px; text-align: center; color: ${color};">${s.status}</td>
                            </tr>`;
                }
                
                html += `</table>`;
                html += `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #dee2e6;">
                            ${allOk ? '✅ All items have sufficient stock' : '⚠️ Some items need restocking'}
                         </div>`;

                // Add auto-deduct button
                if (this.invoiceNumber && this.items.length > 0) {
                    html += `<button onclick="window.__inventory.deductStockForCurrentInvoice()" 
                                style="margin-top: 10px; padding: 8px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                📊 Deduct Stock for This Invoice
                            </button>`;
                }

                summaryDiv.innerHTML = html;
                invoiceContainer.appendChild(summaryDiv);
            });
        }

        findInvoiceContainer() {
            // Try to find the main invoice container
            const possibleSelectors = [
                '.invoice-container',
                '.invoice-wrapper',
                '.invoice-content',
                '.print-area',
                'main',
                'article',
                '.container',
                '#app',
                'body'
            ];

            for (const selector of possibleSelectors) {
                const el = document.querySelector(selector);
                if (el && el.textContent.includes('SALES INVOICE')) {
                    return el;
                }
            }

            // Fallback: find the element containing "SALES INVOICE"
            const all = document.querySelectorAll('*');
            for (const el of all) {
                if (el.textContent && el.textContent.includes('SALES INVOICE') && el.tagName !== 'BODY') {
                    // Find the closest container
                    let parent = el.parentElement;
                    while (parent && parent.tagName !== 'BODY' && parent.children.length < 20) {
                        parent = parent.parentElement;
                    }
                    return parent || el;
                }
            }

            return document.body;
        }

        async enhance() {
            this.detectInvoice();
            this.extractItems();
            
            // Add stock badges to the table
            this.addInventoryBadges();
            
            // Add inventory footer with status
            this.addInventoryFooter();

            // Add a floating inventory button
            this.addFloatingButton();

            console.log('✅ Invoice enhanced with inventory features!');
        }

        addFloatingButton() {
            const existing = document.querySelector('#inventory-float-btn');
            if (existing) return;

            const btn = document.createElement('button');
            btn.id = 'inventory-float-btn';
            btn.innerHTML = '📦';
            btn.style.cssText = `
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
                z-index: 99998;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s;
            `;
            btn.onmouseenter = () => { btn.style.transform = 'scale(1.1)'; };
            btn.onmouseleave = () => { btn.style.transform = 'scale(1)'; };
            btn.onclick = () => {
                this.showInventoryPanel();
            };

            document.body.appendChild(btn);
        }

        showInventoryPanel() {
            // Check if panel already exists
            let panel = document.querySelector('#inventory-panel');
            if (panel) {
                panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
                return;
            }

            panel = document.createElement('div');
            panel.id = 'inventory-panel';
            panel.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 90%;
                max-width: 600px;
                max-height: 80vh;
                background: white;
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                z-index: 99999;
                padding: 25px;
                overflow-y: auto;
                font-family: Arial, sans-serif;
            `;

            panel.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0;">📦 Inventory Manager</h3>
                    <button onclick="document.getElementById('inventory-panel').remove()" 
                            style="background: none; border: none; font-size: 24px; cursor: pointer;">✕</button>
                </div>
                <div id="inventory-panel-content">
                    Loading inventory...
                </div>
            `;

            document.body.appendChild(panel);

            // Load inventory data
            this.loadInventoryPanelContent();
        }

        async loadInventoryPanelContent() {
            const content = document.querySelector('#inventory-panel-content');
            if (!content) return;

            try {
                const products = await this.manager.getAllProducts();
                const lowStock = await this.manager.getLowStockProducts();

                let html = `
                    <div style="display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap;">
                        <button onclick="window.__inventory.showAddProductForm()" 
                                style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            ➕ Add Product
                        </button>
                        <button onclick="window.__inventory.refreshInventoryPanel()" 
                                style="padding: 8px 16px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            🔄 Refresh
                        </button>
                    </div>
                    <div style="background: #fff3cd; padding: 10px; border-radius: 4px; margin-bottom: 15px;">
                        ⚠️ Low Stock: ${lowStock.length} products
                    </div>
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                            <tr style="background: #f8f9fa;">
                                <th style="padding: 8px; text-align: left;">Product</th>
                                <th style="padding: 8px; text-align: center;">Stock</th>
                                <th style="padding: 8px; text-align: center;">Price</th>
                                <th style="padding: 8px; text-align: center;">Status</th>
                            </tr>
                `;

                for (const p of products) {
                    const stock = await this.manager.getProductWithStock(p.id);
                    const qty = stock ? stock.quantity : 0;
                    const low = qty < CONFIG.LOW_STOCK_THRESHOLD;
                    html += `
                        <tr>
                            <td style="padding: 8px;">${p.name}</td>
                            <td style="padding: 8px; text-align: center; color: ${low ? '#dc3545' : '#28a745'}; font-weight: ${low ? 'bold' : 'normal'};">
                                ${qty}
                            </td>
                            <td style="padding: 8px; text-align: center;">₦${(p.unitPrice || 0).toLocaleString()}</td>
                            <td style="padding: 8px; text-align: center;">
                                ${low ? '⚠️ Low' : '✅ OK'}
                            </td>
                        </tr>
                    `;
                }

                html += `</table></div>`;
                content.innerHTML = html;

                // Store reference for functions
                window.__inventory = window.__inventory || {};
                window.__inventory.showAddProductForm = () => this.showAddProductForm();
                window.__inventory.refreshInventoryPanel = () => this.loadInventoryPanelContent();

            } catch (error) {
                content.innerHTML = `<div style="color: #dc3545;">❌ Error loading inventory: ${error.message}</div>`;
            }
        }

        showAddProductForm() {
            const content = document.querySelector('#inventory-panel-content');
            if (!content) return;

            content.innerHTML = `
                <h4>Add New Product</h4>
                <form id="add-product-form" style="display: flex; flex-direction: column; gap: 10px;">
                    <div>
                        <label style="display: block; font-weight: 500; margin-bottom: 3px;">Product Name *</label>
                        <input type="text" id="prod-name" required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="display: block; font-weight: 500; margin-bottom: 3px;">Category</label>
                        <input type="text" id="prod-category" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="display: block; font-weight: 500; margin-bottom: 3px;">Unit Price (₦)</label>
                        <input type="number" id="prod-price" step="0.01" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="display: block; font-weight: 500; margin-bottom: 3px;">Initial Stock</label>
                        <input type="number" id="prod-stock" value="0" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        <button type="submit" style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">Save Product</button>
                        <button type="button" onclick="window.__inventory.refreshInventoryPanel()" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
                    </div>
                </form>
            `;

            document.getElementById('add-product-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const data = {
                    name: document.getElementById('prod-name').value.trim(),
                    category: document.getElementById('prod-category').value.trim(),
                    unitPrice: parseFloat(document.getElementById('prod-price').value) || 0,
                    initialStock: parseInt(document.getElementById('prod-stock').value) || 0
                };

                try {
                    await this.manager.createProduct(data);
                    alert('✅ Product created successfully!');
                    this.loadInventoryPanelContent();
                } catch (error) {
                    alert('❌ ' + error.message);
                }
            });
        }

        async deductStockForCurrentInvoice() {
            if (!this.invoiceNumber || this.items.length === 0) {
                alert('No invoice data found to deduct stock from.');
                return;
            }

            if (!confirm(`Deduct stock for invoice ${this.invoiceNumber}?`)) return;

            try {
                const results = await this.manager.deductStockForInvoice(this.invoiceNumber, this.items);
                
                let message = '📊 Stock Deduction Results:\n\n';
                for (const r of results) {
                    if (r.status === 'deducted') {
                        message += `✅ ${r.productName}: ${r.remaining} remaining\n`;
                    } else if (r.status === 'created') {
                        message += `🆕 ${r.productName}: Created in inventory (0 stock)\n`;
                    } else {
                        message += `❌ ${r.productName}: ${r.error}\n`;
                    }
                }
                alert(message);

                // Refresh the inventory panel
                this.loadInventoryPanelContent();

                // Update the invoice footer
                this.addInventoryFooter();

            } catch (error) {
                alert('❌ Stock deduction failed: ' + error.message);
            }
        }
    }

    // ============================================
    // INITIALIZATION
    // ============================================
    async function init() {
        try {
            const db = new InventoryDB();
            await db.init();

            const manager = new InventoryManager(db);
            const enhancer = new InvoiceEnhancer(manager);

            // Store globally
            window.__inventory = {
                db,
                manager,
                enhancer,
                deductStockForCurrentInvoice: () => enhancer.deductStockForCurrentInvoice(),
                showAddProductForm: () => enhancer.showAddProductForm(),
                refreshInventoryPanel: () => enhancer.loadInventoryPanelContent()
            };

            // Wait for the invoice to render, then enhance
            setTimeout(() => {
                enhancer.enhance();
            }, 1000);

            console.log('✅ Eby-Gold Inventory Enhancer loaded!');
            console.log('📚 Use window.__inventory to access features');

        } catch (error) {
            console.error('❌ Init failed:', error);
        }
    }

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
// Add to the render method - add a new tab
// In the nav-tabs section:
<div class="nav-tabs">
    <button class="active" data-view="products">Products</button>
    <button data-view="lowstock">Low Stock</button>
    <button data-view="valuation">Valuation</button>
    <button data-view="movements">Movements</button>
    <button data-view="customers">Customers</button> <!-- NEW -->
</div>

// Add new render method
async renderCustomers(container) {
    const customers = await this.manager.getCustomers();
    
    if (customers.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info">
                No customers saved yet. Add customers from the invoice form.
            </div>
        `;
        return;
    }
    
    let html = `
        <h3>👥 Customer Database (${customers.length})</h3>
        <div style="overflow-x:auto;">
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Address</th>
                        <th>Added</th>
                    </tr>
                </thead>
                <tbody>
            </tbody></table>
        </div>
    `;
    container.innerHTML = html;
    
    const tbody = container.querySelector('tbody');
    customers.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${c.name}</strong></td>
            <td>${c.phone || '-'}</td>
            <td>${c.address || '-'}</td>
            <td>${new Date(c.createdAt).toLocaleDateString()}</td>
        `;
        tbody.appendChild(tr);
    });
    }
