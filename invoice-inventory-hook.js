// ============================================
// INVOICE-INVENTORY HOOK
// Connects your existing invoice system to inventory
// Run this AFTER your invoice is created
// ============================================

(function() {
    'use strict';

    // Wait for inventory
    function waitForInventory(retries = 30) {
        return new Promise((resolve, reject) => {
            if (window.__inventory && window.__inventory.manager) {
                resolve(window.__inventory);
                return;
            }

            let attempts = 0;
            const interval = setInterval(() => {
                attempts++;
                if (window.__inventory && window.__inventory.manager) {
                    clearInterval(interval);
                    resolve(window.__inventory);
                } else if (attempts >= retries) {
                    clearInterval(interval);
                    reject(new Error('Inventory module not loaded'));
                }
            }, 500);
        });
    }

    // ============================================
    // MAIN HOOK CLASS
    // ============================================
    class InvoiceInventoryHook {
        constructor() {
            this.inventory = null;
            this.initialized = false;
        }

        async init() {
            try {
                this.inventory = await waitForInventory();
                this.initialized = true;
                console.log('✅ Invoice-Inventory Hook ready');
                
                // Hook into invoice creation
                this.hookInvoiceCreation();
                
                // Hook into PDF generation (optional)
                this.hookPDFGeneration();
                
                return true;
            } catch (error) {
                console.error('❌ Hook init failed:', error);
                return false;
            }
        }

        // ============================================
        // HOOK INTO INVOICE CREATION
        // ============================================
        hookInvoiceCreation() {
            // Method 1: Listen for custom event
            document.addEventListener('invoice-created', async (event) => {
                const invoiceData = event.detail;
                if (invoiceData && invoiceData.items) {
                    await this.processInvoice(invoiceData);
                }
            });

            // Method 2: Intercept the create/save button
            this.interceptCreateButton();

            // Method 3: Watch for DOM changes (for dynamic forms)
            this.watchForInvoiceChanges();

            console.log('✅ Invoice creation hooks installed');
        }

        interceptCreateButton() {
            // Find all buttons
            const buttons = document.querySelectorAll('button');
            
            for (const btn of buttons) {
                const text = (btn.textContent || '').toLowerCase();
                if (text.includes('create') || 
                    text.includes('save') || 
                    text.includes('generate') || 
                    text.includes('invoice') ||
                    text.includes('submit')) {
                    
                    // Store original click handler
                    const originalClick = btn.onclick;
                    
                    // Add our hook
                    btn.addEventListener('click', async (e) => {
                        // Wait a moment for the invoice to be created
                        setTimeout(async () => {
                            await this.captureCurrentInvoice();
                        }, 500);
                    });
                    
                    console.log(`✅ Hooked button: "${btn.textContent.trim()}"`);
                }
            }
        }

        watchForInvoiceChanges() {
            // Watch for new invoice numbers appearing
            const observer = new MutationObserver(async (mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        // Check for new invoice number
                        const docNoElements = document.querySelectorAll('*');
                        for (const el of docNoElements) {
                            const text = el.textContent || '';
                            if (text.includes('DOCUMENT NO:') || text.includes('INVOICE NO:')) {
                                // Found invoice number, wait for items
                                setTimeout(async () => {
                                    await this.captureCurrentInvoice();
                                }, 1000);
                                break;
                            }
                        }
                    }
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        // ============================================
        // CAPTURE AND PROCESS INVOICE
        // ============================================
        async captureCurrentInvoice() {
            try {
                // Extract invoice data from the page
                const invoiceData = this.extractInvoiceFromPage();
                
                if (!invoiceData || invoiceData.items.length === 0) {
                    console.log('⏭️ No invoice items found to process');
                    return;
                }

                console.log('📄 Captured invoice:', invoiceData);
                
                // Process inventory deduction
                await this.processInvoice(invoiceData);
                
            } catch (error) {
                console.error('❌ Failed to capture invoice:', error);
            }
        }

        extractInvoiceFromPage() {
            // Get invoice number
            let invoiceNumber = '';
            const docNoElements = document.querySelectorAll('*');
            for (const el of docNoElements) {
                const text = el.textContent || '';
                const match = text.match(/DOCUMENT NO:\s*(#?[\w-]+)/i);
                if (match) {
                    invoiceNumber = match[1];
                    break;
                }
            }

            // Get customer name
            let customerName = '';
            const billedToElements = document.querySelectorAll('*');
            for (const el of billedToElements) {
                const text = el.textContent || '';
                if (text.includes('BILLED TO:')) {
                    const lines = text.split('\n');
                    if (lines.length > 1) {
                        customerName = lines[1].trim();
                    }
                    break;
                }
            }

            // Extract items from table
            const items = [];
            const tables = document.querySelectorAll('table');
            
            for (const table of tables) {
                const rows = table.querySelectorAll('tr');
                let isItemTable = false;
                
                // Check if this is the items table (has S/N, Items, Qty, Rate, Total)
                const headerRow = rows[0];
                if (headerRow) {
                    const cells = headerRow.querySelectorAll('th, td');
                    const headerTexts = Array.from(cells).map(c => c.textContent.trim());
                    if (headerTexts.some(h => /S\/N|#/.test(h)) &&
                        headerTexts.some(h => /Items|Product/.test(h)) &&
                        headerTexts.some(h => /Qty|Quantity/.test(h)) &&
                        headerTexts.some(h => /Rate|Price/.test(h))) {
                        isItemTable = true;
                    }
                }

                if (isItemTable) {
                    // Parse data rows
                    for (let i = 1; i < rows.length; i++) {
                        const cells = rows[i].querySelectorAll('td');
                        if (cells.length >= 5) {
                            const name = cells[1] ? cells[1].textContent.trim() : '';
                            const qty = parseFloat(cells[2] ? cells[2].textContent.replace(/,/g, '') : '0');
                            const rate = parseFloat(cells[3] ? cells[3].textContent.replace(/,/g, '').replace(/[A-Za-z\s]/g, '') : '0');
                            const total = parseFloat(cells[4] ? cells[4].textContent.replace(/,/g, '').replace(/[A-Za-z\s]/g, '') : '0');
                            
                            if (name && qty > 0 && rate > 0) {
                                items.push({
                                    name: name,
                                    qty: qty,
                                    rate: rate,
                                    total: total || (qty * rate)
                                });
                            }
                        }
                    }
                    break;
                }
            }

            return {
                invoiceNumber: invoiceNumber || this.generateInvoiceNumber(),
                customer: customerName || 'Unknown Customer',
                items: items,
                total: items.reduce((sum, item) => sum + item.total, 0)
            };
        }

        generateInvoiceNumber() {
            const prefix = 'EGS-INV';
            const date = new Date();
            const dateStr = date.getFullYear() + 
                           String(date.getMonth() + 1).padStart(2, '0') + 
                           String(date.getDate()).padStart(2, '0');
            const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
            return `${prefix}-${dateStr}-${random}`;
        }

        // ============================================
        // PROCESS INVOICE (DEDUCT STOCK)
        // ============================================
        async processInvoice(invoiceData) {
            if (!invoiceData || !invoiceData.items || invoiceData.items.length === 0) {
                console.log('⏭️ No items to process');
                return;
            }

            console.log(`🔄 Processing invoice ${invoiceData.invoiceNumber} with ${invoiceData.items.length} items`);

            // Save customer if exists
            if (invoiceData.customer && invoiceData.customer !== 'Unknown Customer') {
                try {
                    await this.inventory.manager.saveCustomer({
                        name: invoiceData.customer,
                        phone: '',
                        address: ''
                    });
                    console.log(`✅ Customer "${invoiceData.customer}" saved`);
                } catch (error) {
                    console.warn('Customer save failed:', error.message);
                }
            }

            // Process each item
            const results = [];
            let hasErrors = false;

            for (const item of invoiceData.items) {
                try {
                    // Find product in inventory (by name)
                    let product = await this.inventory.manager.getProductByName(item.name);
                    
                    if (!product) {
                        // Auto-create product with 0 stock
                        const newId = await this.inventory.manager.createProduct({
                            name: item.name,
                            unitPriceUSD: item.rate / 1600,
                            initialStock: 0
                        });
                        product = await this.inventory.manager.getProductWithStock(newId);
                        results.push({
                            item: item.name,
                            status: 'created',
                            message: `Added "${item.name}" to inventory (0 stock)`
                        });
                    }

                    // Check stock
                    if (product && product.quantity < item.qty) {
                        results.push({
                            item: item.name,
                            status: 'warning',
                            message: `⚠️ Insufficient stock: ${product.quantity} available, ${item.qty} requested`
                        });
                        hasErrors = true;
                    } else if (product) {
                        // Deduct stock
                        await this.inventory.manager.updateStock(
                            product.id,
                            -item.qty,
                            'sale',
                            `Invoice ${invoiceData.invoiceNumber}`,
                            invoiceData.invoiceNumber
                        );
                        results.push({
                            item: item.name,
                            status: 'deducted',
                            message: `✅ Stock deducted: ${item.qty} units (${product.quantity - item.qty} remaining)`
                        });
                    }
                } catch (error) {
                    results.push({
                        item: item.name,
                        status: 'error',
                        message: `❌ Error: ${error.message}`
                    });
                    hasErrors = true;
                }
            }

            // Show results
            this.showResults(results, invoiceData, hasErrors);

            // Dispatch event for other listeners
            document.dispatchEvent(new CustomEvent('inventory-processed', {
                detail: {
                    invoiceNumber: invoiceData.invoiceNumber,
                    results: results,
                    hasErrors: hasErrors
                }
            }));

            return results;
        }

        showResults(results, invoiceData, hasErrors) {
            const summary = results.map(r => r.message).join('\n');
            
            if (hasErrors) {
                console.warn('⚠️ Inventory processing completed with errors:\n' + summary);
                // Optional: Show a toast notification
                this.showToast('⚠️ Inventory updated with warnings. Check console for details.', 'warning');
            } else {
                console.log('✅ Inventory processed successfully:\n' + summary);
                this.showToast(`✅ Stock deducted for ${results.filter(r => r.status === 'deducted').length} items`, 'success');
            }

            // Save invoice history
            this.saveInvoiceHistory(invoiceData, results);
        }

        saveInvoiceHistory(invoiceData, results) {
            try {
                const history = {
                    invoiceNumber: invoiceData.invoiceNumber,
                    date: new Date().toISOString(),
                    customer: invoiceData.customer,
                    items: invoiceData.items.map(item => ({
                        name: item.name,
                        qty: item.qty,
                        rate: item.rate
                    })),
                    total: invoiceData.total,
                    results: results,
                    processedAt: new Date().toISOString()
                };

                // Store in IndexedDB
                this.inventory.db.add('invoiceHistory', history).then(() => {
                    console.log('📄 Invoice history saved');
                }).catch(err => {
                    console.warn('Failed to save history:', err);
                });

            } catch (error) {
                console.warn('History save failed:', error);
            }
        }

        // ============================================
        // TOAST NOTIFICATIONS
        // ============================================
        showToast(message, type = 'success') {
            const toast = document.createElement('div');
            toast.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                padding: 12px 20px;
                background: ${type === 'success' ? '#28a745' : '#ffc107'};
                color: ${type === 'success' ? 'white' : '#333'};
                border-radius: 8px;
                z-index: 99999;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                max-width: 400px;
                font-family: system-ui, sans-serif;
                font-size: 14px;
                animation: slideIn 0.3s ease;
            `;
            toast.textContent = message;
            document.body.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.3s';
                setTimeout(() => toast.remove(), 300);
            }, 5000);
        }

        // ============================================
        // PDF GENERATION HOOK
        // ============================================
        hookPDFGeneration() {
            // If you have a PDF download button
            const pdfButtons = document.querySelectorAll('button');
            for (const btn of pdfButtons) {
                const text = (btn.textContent || '').toLowerCase();
                if (text.includes('pdf') || text.includes('download') || text.includes('print')) {
                    btn.addEventListener('click', async () => {
                        // Wait for PDF to generate, then capture
                        setTimeout(async () => {
                            await this.captureCurrentInvoice();
                        }, 1000);
                    });
                    console.log(`✅ Hooked PDF button: "${btn.textContent.trim()}"`);
                }
            }
        }

        // ============================================
        // MANUAL TRIGGER (For testing)
        // ============================================
        async manualProcess() {
            console.log('🔄 Manual processing triggered...');
            await this.captureCurrentInvoice();
        }
    }

    // ============================================
    // INITIALIZATION
    // ============================================
    let hookInstance = null;

    async function initHook() {
        try {
            // Wait for DOM
            await new Promise(resolve => {
                if (document.readyState === 'complete') resolve();
                else window.addEventListener('load', resolve);
            });

            // Create and init hook
            hookInstance = new InvoiceInventoryHook();
            await hookInstance.init();

            // Store globally
            window.__invoiceHook = hookInstance;

            console.log('✅ Invoice-Inventory Hook ready!');
            console.log('📚 Use window.__invoiceHook.manualProcess() to test');

            // Auto-process after a delay (for existing invoices)
            setTimeout(async () => {
                await hookInstance.captureCurrentInvoice();
            }, 3000);

        } catch (error) {
            console.error('❌ Hook init failed:', error);
        }
    }

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHook);
    } else {
        initHook();
    }

})();
