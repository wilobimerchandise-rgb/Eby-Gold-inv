// ============================================
// EBY-GOLD INVENTORY MODULE
// Complete Database & Business Logic
// ============================================

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
        DB_NAME: 'EbyGoldInventoryDB',
        DB_VERSION: 3, // Incremented for customers store
        STORES: ['products', 'inventory', 'stockMovements', 'categories', 'suppliers', 'customers'],
        LOW_STOCK_THRESHOLD: 10,
        CURRENCY: 'NGN',
        EXCHANGE_RATE: 1600 // NGN per USD
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
                    
                    // Products store
                    if (!db.objectStoreNames.contains('products')) {
                        const productStore = db.createObjectStore('products', { 
                            keyPath: 'id', 
                            autoIncrement: true 
                        });
                        productStore.createIndex('sku', 'sku', { unique: true });
                        productStore.createIndex('name', 'name');
                        productStore.createIndex('category', 'category');
                        productStore.createIndex('barcode', 'barcode');
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

                    // Categories store
                    if (!db.objectStoreNames.contains('categories')) {
                        const catStore = db.createObjectStore('categories', { 
                            keyPath: 'id', 
                            autoIncrement: true 
                        });
                        catStore.createIndex('name', 'name');
                    }

                    // Suppliers store
                    if (!db.objectStoreNames.contains('suppliers')) {
                        const supStore = db.createObjectStore('suppliers', { 
                            keyPath: 'id', 
                            autoIncrement: true 
                        });
                        supStore.createIndex('name', 'name');
                    }

                    // CUSTOMERS store - NEW
                    if (!db.objectStoreNames.contains('customers')) {
                        const customerStore = db.createObjectStore('customers', { 
                            keyPath: 'id', 
                            autoIncrement: true 
                        });
                        customerStore.createIndex('name', 'name', { unique: false });
                        customerStore.createIndex('phone', 'phone');
                        console.log('✅ Customers store created');
                    }

                    console.log('📦 Database schema updated');
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
            const q = query.toLowerCase().trim();
            if (!q) return all;
            
            return all.filter(p => 
                p.name.toLowerCase().includes(q) ||
                (p.sku && p.sku.toLowerCase().includes(q)) ||
                (p.barcode && p.barcode.includes(q)) ||
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

        generateSKU(name) {
            const prefix = name.substring(0, 3).toUpperCase();
            const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            return `${prefix}-${random}`;
        }

        async createProduct(data) {
            if (!data.name) throw new Error('Product name is required');
            
            // Check for duplicate name
            const existing = await this.db.query('products', 'name', data.name);
            if (existing.length > 0) {
                throw new Error(`Product "${data.name}" already exists`);
            }

            // Store prices in USD (base currency)
            const product = {
                name: data.name.trim(),
                sku: data.sku || this.generateSKU(data.name),
                category: data.category || 'General',
                unitPriceUSD: data.unitPriceUSD || data.unitPrice || 0,
                costPriceUSD: data.costPriceUSD || data.costPrice || 0,
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

            // Log initial stock movement
            if (data.initialStock > 0) {
                await this.db.add('stockMovements', {
                    productId: id,
                    quantity: data.initialStock,
                    type: 'initial',
                    note: 'Initial stock setup',
                    timestamp: new Date().toISOString()
                });
            }

            console.log(`✅ Product created: ${product.name} (ID: ${id})`);
            return id;
        }

        async updateProduct(productId, updates) {
            const product = await this.db.get('products', productId);
            if (!product) throw new Error('Product not found');

            const updated = { 
                ...product, 
                ...updates, 
                updatedAt: new Date().toISOString() 
            };
            await this.db.update('products', updated);
            console.log(`✅ Product updated: ${updated.name}`);
            return updated;
        }

        async deleteProduct(productId) {
            const inventory = await this.db.query('inventory', 'productId', productId);
            if (inventory.length > 0 && inventory[0].quantity > 0) {
                throw new Error('Cannot delete product with existing stock');
            }

            await this.db.delete('products', productId);
            await this.db.delete('inventory', productId);
            console.log(`🗑️ Product deleted: ${productId}`);
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
            
            const inv = await this.db.query('inventory', 'productId', productId);
            const quantity = inv.length > 0 ? inv[0].quantity : 0;
            
            return {
                ...product,
                quantity: quantity,
                lowThreshold: inv.length > 0 ? inv[0].lowThreshold : CONFIG.LOW_STOCK_THRESHOLD,
                unitPriceUSD: product.unitPriceUSD || 0,
                costPriceUSD: product.costPriceUSD || 0,
                unitPriceNGN: (product.unitPriceUSD || 0) * CONFIG.EXCHANGE_RATE,
                costPriceNGN: (product.costPriceUSD || 0) * CONFIG.EXCHANGE_RATE
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
                throw new Error(`Insufficient stock. Available: ${inv.quantity}`);
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
                console.warn(`⚠️ Low stock alert: Product ${productId} has ${newQuantity} units left`);
            }

            return newQuantity;
        }

        async deductStockForInvoice(invoiceNumber, items) {
            const results = [];
            for (const item of items) {
                try {
                    let product = await this.getProductByName(item.name);
                    
                    if (!product) {
                        // Auto-create product
                        const newId = await this.createProduct({
                            name: item.name,
                            unitPriceUSD: item.rate / CONFIG.EXCHANGE_RATE,
                            initialStock: 0
                        });
                        product = await this.getProductWithStock(newId);
                        results.push({ 
                            productName: item.name, 
                            status: 'created', 
                            productId: newId,
                            remaining: 0
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
                        productId: product.id,
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

        async getInventoryValuation() {
            const allProducts = await this.db.getAll('products');
            let totalValueUSD = 0;
            let totalValueNGN = 0;
            const details = [];

            for (const product of allProducts) {
                const inv = await this.db.query('inventory', 'productId', product.id);
                if (inv.length > 0 && inv[0].quantity > 0) {
                    const qty = inv[0].quantity;
                    const costUSD = product.costPriceUSD || product.unitPriceUSD || 0;
                    const valueUSD = qty * costUSD;
                    const valueNGN = valueUSD * CONFIG.EXCHANGE_RATE;
                    
                    totalValueUSD += valueUSD;
                    totalValueNGN += valueNGN;
                    
                    details.push({
                        product: product.name,
                        sku: product.sku,
                        quantity: qty,
                        unitCostUSD: costUSD,
                        unitCostNGN: costUSD * CONFIG.EXCHANGE_RATE,
                        totalValueUSD: valueUSD,
                        totalValueNGN: valueNGN
                    });
                }
            }

            return { 
                totalValueUSD, 
                totalValueNGN, 
                details 
            };
        }

        async getStockMovements(productId, limit = 50) {
            const allMovements = await this.db.getAll('stockMovements');
            return allMovements
                .filter(m => m.productId === productId)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, limit);
        }

        // ============================================
        // CUSTOMER METHODS
        // ============================================
        async saveCustomer(data) {
            if (!data.name) throw new Error('Customer name is required');
            
            // Check if customer already exists
            const existing = await this.db.query('customers', 'name', data.name);
            if (existing.length > 0) {
                // Update existing
                const customer = existing[0];
                customer.phone = data.phone || customer.phone || '';
                customer.address = data.address || customer.address || '';
                customer.updatedAt = new Date().toISOString();
                await this.db.update('customers', customer);
                console.log(`✅ Customer updated: ${customer.name}`);
                return customer;
            }
            
            // Create new customer
            const customer = {
                name: data.name.trim(),
                phone: data.phone || '',
                address: data.address || '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            const id = await this.db.add('customers', customer);
            console.log(`✅ Customer created: ${customer.name} (ID: ${id})`);
            return { ...customer, id };
        }

        async getCustomers(query = '') {
            if (query && query.trim()) {
                const all = await this.db.getAll('customers');
                const q = query.toLowerCase().trim();
                return all.filter(c => 
                    c.name.toLowerCase().includes(q) ||
                    (c.phone && c.phone.includes(q))
                );
            }
            return await this.db.getAll('customers');
        }

        async getCustomer(id) {
            return await this.db.get('customers', id);
        }

        async deleteCustomer(id) {
            await this.db.delete('customers', id);
            console.log(`🗑️ Customer deleted: ${id}`);
        }
    }

    // ============================================
    // INITIALIZATION
    // ============================================
    async function initInventoryModule() {
        try {
            const db = new InventoryDB();
            await db.init();
            
            const manager = new InventoryManager(db);
            
            // Store globally
            window.__inventory = {
                db,
                manager,
                CONFIG
            };

            console.log('✅ Eby-Gold Inventory Module loaded!');
            console.log('📚 Available APIs: window.__inventory');
            
            // Dispatch event for other scripts
            document.dispatchEvent(new CustomEvent('inventory-ready', {
                detail: { inventory: window.__inventory }
            }));

        } catch (error) {
            console.error('❌ Inventory module initialization failed:', error);
        }
    }

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initInventoryModule);
    } else {
        initInventoryModule();
    }

})();
// In the onupgradeneeded event handler
if (!db.objectStoreNames.contains('invoiceHistory')) {
    const invHistStore = db.createObjectStore('invoiceHistory', { 
        keyPath: 'invoiceNumber' 
    });
    invHistStore.createIndex('date', 'date');
    invHistStore.createIndex('customer', 'customer');
    console.log('✅ Invoice history store created');
}
