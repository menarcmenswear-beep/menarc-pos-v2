'use client';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ScanLine, ShoppingCart, Trash2, Plus, Minus, RefreshCw, CheckCircle2, XCircle, Loader2, Package, User, UserRound, Printer, Percent, Wifi, WifiOff, CloudUpload, AlertTriangle, X } from 'lucide-react';
import { Nav } from '@/components/nav';

const supabase = createClient();

const OFFLINE_QUEUE_KEY = 'menarc_offline_sale_queue';

type QueuedSale = {
  offlineRef: string;
  items: { sku: string; qty: number; item_rate: number; discount: number }[];
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  staffId: string | null;
  queuedAt: string;
  lastError?: string;
};

type Toast = { msg: string; type: 'success' | 'error' | 'info' } | null;

function playTone(freq: number, duration: number) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + duration / 1000);
    setTimeout(() => ctx.close(), duration + 50);
  } catch {}
}

export default function POS() {
  const [sku, setSku] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [staffId, setStaffId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [receipt, setReceipt] = useState<any | null>(null);
  const [receiptVariant, setReceiptVariant] = useState<'thermal' | 'professional'>('thermal');
  const [isOnline, setIsOnline] = useState(true);
  const [offlineQueue, setOfflineQueue] = useState<QueuedSale[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [showQueuePanel, setShowQueuePanel] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchInventory();
    fetchStaff();

    // Load any sales that were queued offline in a previous session
    try {
      const stored = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (stored) setOfflineQueue(JSON.parse(stored));
    } catch {
      // Corrupt or inaccessible storage — start with an empty queue rather than crash
    }

    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-sync whenever connectivity comes back, and retry periodically in case
  // navigator.onLine reports "online" while the connection is still unreliable.
  useEffect(() => {
    if (isOnline && offlineQueue.length > 0) {
      syncQueue();
    }
    if (offlineQueue.length === 0) return;
    const interval = setInterval(() => {
      if (navigator.onLine) syncQueue();
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, offlineQueue.length]);

  function notify(msg: string, type: 'success' | 'error' | 'info' = 'info') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  }

  async function fetchInventory() {
    setLoading(true);
    const { data, error } = await supabase.from('inventory').select('*');
    if (error) {
      notify('Error fetching stock: ' + error.message, 'error');
    } else if (data) {
      setInventory(data);
    }
    setLoading(false);
  }

  async function fetchStaff() {
    const { data } = await supabase.from('profiles').select('id, full_name').eq('active', true).order('full_name');
    if (data) setStaff(data);
  }

  function addToCart(scannedSku?: string) {
    const targetSku = (scannedSku || sku).trim().toUpperCase();
    if (!targetSku) return;

    const item = inventory.find(i => i.sku.toUpperCase() === targetSku);
    if (item) {
      if (item.current_quantity <= 0) {
        playTone(220, 180);
        notify('Item out of stock!', 'error');
        setSku('');
        inputRef.current?.focus();
        return;
      }

      const existingIndex = cart.findIndex(cartItem => cartItem.sku.toUpperCase() === targetSku);
      if (existingIndex > -1) {
        const updatedCart = [...cart];
        if (updatedCart[existingIndex].checkoutQty < item.current_quantity) {
          updatedCart[existingIndex].checkoutQty += 1;
          setCart(updatedCart);
          playTone(880, 90);
        } else {
          playTone(220, 180);
          notify('Cannot add more than available stock.', 'error');
        }
      } else {
        setCart([...cart, { ...item, checkoutQty: 1, discount: 0, discountType: 'flat', discountInput: '' }]);
        playTone(880, 90);
      }

      setSku('');
    } else {
      playTone(220, 180);
      notify(`SKU "${targetSku}" not found in inventory.`, 'error');
      setSku('');
    }
    inputRef.current?.focus();
  }

  function computeDiscount(price: number, qty: number, type: 'flat' | 'percent', rawInput: string): number {
    const lineValue = price * qty;
    const raw = parseFloat(rawInput) || 0;
    let discount = type === 'percent' ? (lineValue * Math.min(raw, 100)) / 100 : raw;
    if (discount < 0) discount = 0;
    if (discount > lineValue) discount = lineValue;
    return discount;
  }

  function updateCartDiscount(index: number, rawValue: string) {
    const item = cart[index];
    const discount = computeDiscount(item.price, item.checkoutQty, item.discountType, rawValue);
    const updated = [...cart];
    updated[index] = { ...updated[index], discountInput: rawValue, discount };
    setCart(updated);
  }

  function toggleDiscountType(index: number) {
    const item = cart[index];
    const newType = item.discountType === 'flat' ? 'percent' : 'flat';
    const discount = computeDiscount(item.price, item.checkoutQty, newType, item.discountInput);
    const updated = [...cart];
    updated[index] = { ...updated[index], discountType: newType, discount };
    setCart(updated);
  }

  function updateCartQty(index: number, delta: number) {
    const item = cart[index];
    const stockItem = inventory.find(i => i.sku === item.sku);
    const maxQty = stockItem ? stockItem.current_quantity : item.checkoutQty;
    const newQty = item.checkoutQty + delta;

    if (newQty <= 0) {
      removeFromCart(index);
      return;
    }
    if (newQty > maxQty) {
      notify('Cannot exceed available stock.', 'error');
      return;
    }
    const updated = [...cart];
    const recomputedDiscount = computeDiscount(item.price, newQty, item.discountType, item.discountInput);
    updated[index] = { ...updated[index], checkoutQty: newQty, discount: recomputedDiscount };
    setCart(updated);
  }

  function removeFromCart(index: number) {
    setCart(cart.filter((_, i) => i !== index));
  }

  function persistQueue(queue: QueuedSale[]) {
    setOfflineQueue(queue);
    try {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    } catch {
      // If storage is full/unavailable, the in-memory queue still works for this
      // session — sales just won't survive a page reload while offline.
    }
  }

  function isLikelyNetworkError(err: any): boolean {
    if (!err) return false;
    if (typeof err.message === 'string' && /fetch|network|failed to fetch/i.test(err.message)) return true;
    // Real Postgres/PostgREST errors carry a code/details/hint; a bare failure usually doesn't.
    return !err.code && !err.details && !err.hint;
  }

  function buildReceipt(id: string, snapshot: typeof cart, custName: string, custPhone: string, custEmail: string, queued: boolean) {
    const cashier = staff.find(s => s.id === staffId);
    const subtotal = snapshot.reduce((acc, i) => acc + i.price * i.checkoutQty, 0);
    const discountTotal = snapshot.reduce((acc, i) => acc + i.discount, 0);
    setReceipt({
      id,
      queued,
      date: new Date(),
      cashierName: cashier?.full_name || null,
      customerName: custName,
      customerPhone: custPhone,
      customerEmail: custEmail,
      items: snapshot.map(i => ({
        sku: i.sku,
        name: i.name,
        qty: i.checkoutQty,
        rate: i.price,
        discount: i.discount,
        lineTotal: i.price * i.checkoutQty - i.discount,
        hsn: i.hsn_code || null,
        gstRate: i.gst_rate || 0,
      })),
      subtotal,
      discountTotal,
      total: subtotal - discountTotal,
    });
  }

  function queueSaleOffline(items: QueuedSale['items'], offlineRef: string, snapshot: typeof cart, custName: string, custPhone: string, custEmail: string) {
    const queued: QueuedSale = {
      offlineRef,
      items,
      customerName: custName,
      customerPhone: custPhone,
      customerEmail: custEmail,
      staffId: staffId || null,
      queuedAt: new Date().toISOString(),
    };
    persistQueue([...offlineQueue, queued]);

    // Optimistically reflect the sale in the local stock view so the next
    // offline sale on this device doesn't oversell — the server is the real
    // source of truth once this syncs.
    setInventory(prev => prev.map(inv => {
      const sold = items.find(i => i.sku === inv.sku);
      return sold ? { ...inv, current_quantity: Math.max(0, inv.current_quantity - sold.qty) } : inv;
    }));

    playTone(660, 160);
    notify('No connection — sale saved on this device and will sync automatically.', 'info');
    buildReceipt(offlineRef, snapshot, custName, custPhone, custEmail, true);
  }

  async function syncQueue() {
    if (offlineQueue.length === 0 || syncing) return;
    setSyncing(true);

    const remaining: QueuedSale[] = [];
    let syncedCount = 0;

    for (let i = 0; i < offlineQueue.length; i++) {
      const q = offlineQueue[i];
      const { error } = await supabase.rpc('record_sale', {
        p_items: q.items,
        p_offline_ref: q.offlineRef,
        p_staff_id: q.staffId,
        p_customer_name: q.customerName || null,
        p_customer_phone: q.customerPhone || null,
        p_customer_email: q.customerEmail || null,
      });

      if (error) {
        if (isLikelyNetworkError(error)) {
          // Still offline (or network dropped mid-sync) — stop here, keep this
          // item and everything after it untouched, try again on the next trigger.
          remaining.push(...offlineQueue.slice(i));
          break;
        }
        // A real error (e.g. insufficient stock now that other sales synced) —
        // keep it in the queue with the reason so staff can see and resolve it.
        remaining.push({ ...q, lastError: error.message });
      } else {
        syncedCount++;
      }
    }

    persistQueue(remaining);
    if (syncedCount > 0) {
      notify(`${syncedCount} queued sale${syncedCount > 1 ? 's' : ''} synced successfully.`, 'success');
      fetchInventory();
    }
    setSyncing(false);
  }

  function discardQueuedSale(offlineRef: string) {
    persistQueue(offlineQueue.filter(q => q.offlineRef !== offlineRef));
  }

  async function completeSale() {
    if (cart.length === 0) return;

    if (!customerName.trim() || !customerPhone.trim()) {
      notify('Customer name and phone number are required to complete a sale.', 'error');
      return;
    }

    if (!/^\d{10}$/.test(customerPhone.trim())) {
      notify('Phone number must be exactly 10 digits.', 'error');
      return;
    }

    setProcessing(true);

    const items = cart.map(item => ({
      sku: item.sku,
      qty: item.checkoutQty,
      item_rate: item.price,
      discount: item.discount,
    }));
    const offlineRef = crypto.randomUUID();
    const cartSnapshot = cart;
    const custName = customerName.trim();
    const custPhone = customerPhone.trim();
    const custEmail = customerEmail.trim();

    if (!navigator.onLine) {
      queueSaleOffline(items, offlineRef, cartSnapshot, custName, custPhone, custEmail);
      setCart([]);
      setCustomerName(''); setCustomerPhone(''); setCustomerEmail('');
      setProcessing(false);
      return;
    }

    try {
      const { data: saleId, error } = await supabase.rpc('record_sale', {
        p_items: items,
        p_offline_ref: offlineRef,
        p_staff_id: staffId || null,
        p_customer_name: custName || null,
        p_customer_phone: custPhone || null,
        p_customer_email: custEmail || null,
      });

      if (error) {
        if (isLikelyNetworkError(error)) {
          queueSaleOffline(items, offlineRef, cartSnapshot, custName, custPhone, custEmail);
        } else {
          notify('Sale failed: ' + error.message, 'error');
          setProcessing(false);
          return;
        }
      } else {
        playTone(1046, 140);
        notify('Sale completed successfully.', 'success');
        buildReceipt(saleId, cartSnapshot, custName, custPhone, custEmail, false);
        fetchInventory();
      }
    } catch {
      // fetch itself threw — no connection at all
      queueSaleOffline(items, offlineRef, cartSnapshot, custName, custPhone, custEmail);
    }

    setCart([]);
    setCustomerName(''); setCustomerPhone(''); setCustomerEmail('');
    setProcessing(false);
  }

  const cartSubtotal = cart.reduce((acc, item) => acc + (item.price * item.checkoutQty), 0);
  const cartDiscountTotal = cart.reduce((acc, item) => acc + item.discount, 0);
  const cartTotal = cartSubtotal - cartDiscountTotal;
  const cartItemCount = cart.reduce((acc, item) => acc + item.checkoutQty, 0);

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6 md:p-10 font-sans">
      <div className="max-w-5xl mx-auto">
        <header className="flex flex-wrap justify-between items-center gap-3 mb-8 border-b border-neutral-800 pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-widest">MENARC</h1>
            <p className="text-xs text-neutral-400">Offline Point of Sale & Barcode Scanner</p>
          </div>
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border ${
                isOnline ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-red-400 border-red-500/30 bg-red-500/10'
              }`}
              title={isOnline ? 'Connected' : 'No connection — sales will be saved locally'}
            >
              {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
              {isOnline ? 'Online' : 'Offline'}
            </div>
            {offlineQueue.length > 0 && (
              <button
                onClick={() => setShowQueuePanel(true)}
                className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition"
              >
                {syncing ? <Loader2 size={12} className="animate-spin" /> : <CloudUpload size={12} />}
                {offlineQueue.length} pending sync
              </button>
            )}
            {staff.length > 0 && (
              <div className="relative">
                <User className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" size={12} />
                <select
                  className="bg-neutral-900 border border-neutral-800 text-xs pl-7 pr-2 py-1.5 rounded focus:outline-none"
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                >
                  <option value="">Cashier: unassigned</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>
            )}
            <Nav current="/" />
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-base text-neutral-200">Live Inventory</h2>
              <button onClick={fetchInventory} className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white border border-neutral-800 px-2.5 py-1 rounded transition">
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>

            {loading ? (
              <div className="space-y-3 py-1">
                {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-neutral-800/50 rounded animate-pulse" />)}
              </div>
            ) : inventory.length === 0 ? (
              <div className="py-12 text-center text-neutral-500">
                <Package className="mx-auto mb-2 opacity-40" size={28} />
                <p className="text-sm">No products found in database.</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-800 max-h-[420px] overflow-y-auto pr-2">
                {inventory.map((item) => {
                  const isLowStock = item.current_quantity < (item.low_stock_threshold ?? 15);
                  const isOut = item.current_quantity <= 0;
                  return (
                    <div key={item.sku} className={`py-3 flex justify-between items-center text-sm ${isOut ? 'opacity-50' : ''}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        {item.image_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={item.image_url} alt={item.sku} className="w-9 h-9 object-cover rounded border border-neutral-800 shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded border border-neutral-800 bg-neutral-950 flex items-center justify-center shrink-0">
                            <Package size={13} className="text-neutral-700" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-neutral-100">{item.sku}</p>
                            {isOut ? (
                              <span className="bg-red-500/10 text-red-400 border border-red-500/30 text-[10px] px-1.5 py-0.5 rounded font-medium">Out of Stock</span>
                            ) : isLowStock && (
                              <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] px-1.5 py-0.5 rounded font-medium">Low Stock</span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-400 truncate">{item.name} {item.color ? `• ${item.color}` : ''} {item.size ? `• ${item.size}` : ''}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-mono text-sm ${isLowStock ? 'text-amber-400 font-bold' : 'text-neutral-300'}`}>{item.current_quantity} in stock</p>
                        <p className="text-xs text-neutral-500">₹{item.price}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="flex gap-2">
              <div className="relative w-full">
                <ScanLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" size={18} />
                <input
                  ref={inputRef}
                  type="text"
                  autoFocus
                  placeholder="Scan barcode or type SKU..."
                  className="bg-neutral-900 border border-neutral-700 text-white pl-10 pr-4 py-3.5 rounded-lg w-full uppercase placeholder:text-neutral-500 placeholder:normal-case focus:outline-none focus:border-white text-sm tracking-wider"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addToCart(); }}
                />
              </div>
              <button onClick={() => addToCart()} className="bg-white text-black font-bold px-6 py-3.5 rounded-lg hover:bg-neutral-200 active:scale-95 transition text-sm shrink-0">
                Add
              </button>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl flex flex-col justify-between min-h-[340px] shadow-lg">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="flex items-center gap-2 font-bold text-base text-neutral-200"><ShoppingCart size={16} /> Current Cart</h2>
                  {cartItemCount > 0 && <span className="text-xs text-neutral-500">{cartItemCount} item{cartItemCount > 1 ? 's' : ''}</span>}
                </div>
                {cart.length === 0 ? (
                  <p className="text-sm text-neutral-500 py-12 text-center">Cart is empty. Scan a barcode or type SKU to begin sale.</p>
                ) : (
                  <div className="divide-y divide-neutral-800 max-h-[280px] overflow-y-auto pr-2">
                    {cart.map((item, index) => {
                      const lineGross = item.price * item.checkoutQty;
                      const lineNet = lineGross - item.discount;
                      return (
                        <div key={index} className="py-2.5 text-sm">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2 min-w-0">
                              {item.image_url ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={item.image_url} alt={item.sku} className="w-7 h-7 object-cover rounded border border-neutral-800 shrink-0" />
                              ) : (
                                <div className="w-7 h-7 rounded border border-neutral-800 bg-neutral-950 flex items-center justify-center shrink-0">
                                  <Package size={10} className="text-neutral-700" />
                                </div>
                              )}
                              <div>
                                <p className="font-medium text-white">{item.sku}</p>
                                <p className="text-xs text-neutral-400">₹{item.price} each</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1.5 bg-neutral-800 rounded px-1.5 py-1">
                                <button onClick={() => updateCartQty(index, -1)} className="p-0.5 hover:text-white text-neutral-400"><Minus size={12} /></button>
                                <span className="w-5 text-center font-mono text-xs">{item.checkoutQty}</span>
                                <button onClick={() => updateCartQty(index, 1)} className="p-0.5 hover:text-white text-neutral-400"><Plus size={12} /></button>
                              </div>
                              <span className="font-mono text-neutral-200 w-16 text-right">
                                {item.discount > 0 && <span className="line-through text-neutral-600 text-[10px] block">₹{lineGross}</span>}
                                ₹{lineNet}
                              </span>
                              <button onClick={() => removeFromCart(index)} className="text-neutral-600 hover:text-red-400" aria-label="Remove item"><Trash2 size={14} /></button>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5 pl-0.5">
                            <button
                              type="button"
                              onClick={() => toggleDiscountType(index)}
                              className="flex items-center justify-center w-6 h-6 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold shrink-0"
                              title="Toggle ₹ / %"
                            >
                              {item.discountType === 'percent' ? <Percent size={11} /> : '₹'}
                            </button>
                            <input
                              type="number" min="0" max={item.discountType === 'percent' ? 100 : lineGross}
                              placeholder={item.discountType === 'percent' ? 'Discount %' : 'Discount ₹'}
                              className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-[11px] text-neutral-300 w-24 focus:outline-none focus:border-neutral-600"
                              value={item.discountInput || ''}
                              onChange={(e) => updateCartDiscount(index, e.target.value)}
                            />
                            {item.discount > 0 && item.discountType === 'percent' && (
                              <span className="text-[10px] text-neutral-600">= ₹{item.discount.toFixed(0)}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {cart.length > 0 && (
                <div className="pt-4 border-t border-neutral-800 mt-4">
                  <p className="flex items-center gap-1.5 text-xs text-neutral-400 mb-2">
                    <UserRound size={12} /> Customer details (required)
                  </p>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <input
                      type="text" placeholder="Customer name *" required
                      className="col-span-2 bg-neutral-950 border border-neutral-700 rounded p-2 text-xs text-white focus:outline-none focus:border-white"
                      value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                    />
                    <input
                      type="tel" inputMode="numeric" placeholder="10-digit phone number *" required
                      maxLength={10}
                      className="bg-neutral-950 border border-neutral-700 rounded p-2 text-xs text-white focus:outline-none focus:border-white"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    />
                    <input
                      type="email" placeholder="Email (optional)"
                      className="bg-neutral-950 border border-neutral-700 rounded p-2 text-xs text-white focus:outline-none focus:border-white"
                      value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 mb-3 text-xs text-neutral-400">
                    <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">₹{cartSubtotal}</span></div>
                    {cartDiscountTotal > 0 && (
                      <div className="flex justify-between text-amber-400"><span>Discount</span><span className="font-mono">-₹{cartDiscountTotal}</span></div>
                    )}
                  </div>
                  <div className="flex justify-between items-center text-lg font-bold mb-4 pt-2 border-t border-neutral-800">
                    <span>Total</span>
                    <span className="font-mono text-white">₹{cartTotal}</span>
                  </div>
                  <button
                    onClick={completeSale}
                    disabled={processing}
                    className="w-full flex items-center justify-center gap-2 bg-white text-black font-bold py-3.5 rounded-lg hover:bg-neutral-200 active:scale-[0.99] transition tracking-wide text-sm disabled:opacity-60"
                  >
                    {processing ? <><Loader2 size={16} className="animate-spin" /> Processing...</> : 'COMPLETE SALE'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl border text-sm font-medium z-50
          ${toast.type === 'success' ? 'bg-emerald-950 border-emerald-700 text-emerald-300' : ''}
          ${toast.type === 'error' ? 'bg-red-950 border-red-700 text-red-300' : ''}
          ${toast.type === 'info' ? 'bg-neutral-800 border-neutral-700 text-neutral-200' : ''}`}>
          {toast.type === 'success' && <CheckCircle2 size={16} />}
          {toast.type === 'error' && <XCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {receipt && (() => {
        const totalGst = receipt.items.reduce((acc: number, it: any) => {
          if (!it.gstRate) return acc;
          return acc + (it.lineTotal - it.lineTotal / (1 + it.gstRate / 100));
        }, 0);
        const hasGst = totalGst > 0.01;

        return (
          <>
            <style>{`
              @media print {
                body * { visibility: hidden; }
                #receipt-print, #receipt-print * { visibility: visible; }
                #receipt-print { position: fixed; top: 0; left: 0; width: 100%; }
                .no-print { display: none !important; }
                @page { size: ${receiptVariant === 'thermal' ? '80mm auto' : 'A4'}; margin: ${receiptVariant === 'thermal' ? '0' : '15mm'}; }
              }
            `}</style>
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
              {receiptVariant === 'thermal' ? (
                <div id="receipt-print" className="bg-white text-black w-full max-w-[300px] mx-auto rounded-lg p-5 font-mono text-xs my-8">
                  <div className="text-center mb-2">
                    <p className="font-black text-lg tracking-[0.2em]">MENARC</p>
                    <p className="text-[9px] italic text-neutral-600 tracking-wide">Never go unnoticed</p>
                    <p className="text-[10px] text-neutral-600 mt-1">Sale Receipt</p>
                    {receipt.queued && (
                      <p className="text-[9px] font-bold text-amber-600 mt-1">⚠ SAVED OFFLINE — PENDING SYNC</p>
                    )}
                  </div>
                  <div className="border-t border-dashed border-neutral-400 my-2" />
                  <p>Date: {receipt.date.toLocaleString()}</p>
                  <p>Receipt #: {receipt.queued ? 'Pending…' : (receipt.id ? String(receipt.id).slice(0, 8) : '—')}</p>
                  {receipt.cashierName && <p>Cashier: {receipt.cashierName}</p>}
                  <div className="border-t border-dashed border-neutral-400 my-2" />
                  <p>Customer: {receipt.customerName}</p>
                  <p>Phone: {receipt.customerPhone}</p>
                  {receipt.customerEmail && <p>Email: {receipt.customerEmail}</p>}
                  <div className="border-t border-dashed border-neutral-400 my-2" />
                  {receipt.items.map((it: any, i: number) => (
                    <div key={i} className="mb-1.5">
                      <div className="flex justify-between font-semibold"><span>{it.sku}</span><span>₹{it.lineTotal.toFixed(2)}</span></div>
                      <div className="text-[10px] text-neutral-600">
                        {it.qty} × ₹{it.rate}{it.discount > 0 ? ` − ₹${it.discount} disc.` : ''}
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-dashed border-neutral-400 my-2" />
                  <div className="flex justify-between"><span>Subtotal</span><span>₹{receipt.subtotal.toFixed(2)}</span></div>
                  {receipt.discountTotal > 0 && (
                    <div className="flex justify-between"><span>Discount</span><span>−₹{receipt.discountTotal.toFixed(2)}</span></div>
                  )}
                  {hasGst && <div className="flex justify-between text-neutral-600"><span>(incl. GST)</span><span>₹{totalGst.toFixed(2)}</span></div>}
                  <div className="flex justify-between font-bold text-sm mt-1 pt-1 border-t border-neutral-300">
                    <span>Total</span><span>₹{receipt.total.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-dashed border-neutral-400 my-3" />
                  <p className="text-center text-[10px] italic text-neutral-600">Never go unnoticed.</p>
                  <p className="text-center text-[9px] text-neutral-500 mt-1">Thank you for shopping with us!</p>
                </div>
              ) : (
                <div id="receipt-print" className="bg-white text-black w-full max-w-2xl mx-auto rounded-lg overflow-hidden my-8 shadow-2xl">
                  <div className="bg-black px-8 py-6 flex items-center justify-between">
                    <img src="/menarc-logo.jpg" alt="MENARC" className="h-14 w-auto rounded" />
                    <div className="text-right">
                      <p className="text-amber-400 font-semibold text-sm tracking-wide">Never go unnoticed</p>
                      <p className="text-neutral-400 text-[11px] mt-1">Tax Invoice</p>
                    </div>
                  </div>

                  <div className="p-8">
                    {receipt.queued && (
                      <div className="mb-4 flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs font-semibold">
                        <AlertTriangle size={13} /> Saved offline — will sync automatically once reconnected
                      </div>
                    )}
                    <div className="flex justify-between mb-6 pb-6 border-b border-neutral-200">
                      <div>
                        <p className="text-[11px] text-neutral-500 uppercase tracking-wide mb-1">Billed To</p>
                        <p className="font-semibold text-neutral-900">{receipt.customerName}</p>
                        <p className="text-sm text-neutral-600">{receipt.customerPhone}</p>
                        {receipt.customerEmail && <p className="text-sm text-neutral-600">{receipt.customerEmail}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-neutral-500 uppercase tracking-wide mb-1">Invoice Details</p>
                        <p className="text-sm text-neutral-700">Receipt #{receipt.queued ? 'Pending…' : (receipt.id ? String(receipt.id).slice(0, 8) : '—')}</p>
                        <p className="text-sm text-neutral-700">{receipt.date.toLocaleDateString()} · {receipt.date.toLocaleTimeString()}</p>
                        {receipt.cashierName && <p className="text-sm text-neutral-700">Served by {receipt.cashierName}</p>}
                      </div>
                    </div>

                    <table className="w-full text-sm mb-6">
                      <thead>
                        <tr className="text-left text-[11px] text-neutral-500 uppercase tracking-wide border-b border-neutral-200">
                          <th className="pb-2 font-medium">Item</th>
                          {hasGst && <th className="pb-2 font-medium text-center">HSN</th>}
                          <th className="pb-2 font-medium text-center">Qty</th>
                          <th className="pb-2 font-medium text-right">Rate</th>
                          {hasGst && <th className="pb-2 font-medium text-right">GST%</th>}
                          <th className="pb-2 font-medium text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {receipt.items.map((it: any, i: number) => (
                          <tr key={i} className="border-b border-neutral-100">
                            <td className="py-2.5">
                              <p className="font-medium text-neutral-900">{it.sku}</p>
                              {it.name && <p className="text-[11px] text-neutral-500">{it.name}</p>}
                              {it.discount > 0 && <p className="text-[11px] text-amber-600">− ₹{it.discount} discount</p>}
                            </td>
                            {hasGst && <td className="py-2.5 text-center text-neutral-600 text-xs">{it.hsn || '—'}</td>}
                            <td className="py-2.5 text-center text-neutral-700">{it.qty}</td>
                            <td className="py-2.5 text-right text-neutral-700">₹{it.rate}</td>
                            {hasGst && <td className="py-2.5 text-right text-neutral-600 text-xs">{it.gstRate || 0}%</td>}
                            <td className="py-2.5 text-right font-medium text-neutral-900">₹{it.lineTotal.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="flex justify-end">
                      <div className="w-56 space-y-1.5">
                        <div className="flex justify-between text-sm text-neutral-600">
                          <span>Subtotal</span><span>₹{receipt.subtotal.toFixed(2)}</span>
                        </div>
                        {receipt.discountTotal > 0 && (
                          <div className="flex justify-between text-sm text-amber-600">
                            <span>Discount</span><span>−₹{receipt.discountTotal.toFixed(2)}</span>
                          </div>
                        )}
                        {hasGst && (
                          <div className="flex justify-between text-sm text-neutral-500">
                            <span>GST (included)</span><span>₹{totalGst.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-lg font-bold text-neutral-900 pt-2 border-t border-neutral-200">
                          <span>Total</span><span>₹{receipt.total.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-neutral-200 text-center">
                      <p className="text-neutral-900 font-semibold text-sm">Never go unnoticed.</p>
                      <p className="text-neutral-400 text-xs mt-1">Thank you for shopping with MENARC.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="no-print fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-wrap justify-center gap-2 z-[60] px-4">
              <div className="flex bg-neutral-900 border border-neutral-800 rounded-lg p-1">
                <button
                  onClick={() => setReceiptVariant('thermal')}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition ${receiptVariant === 'thermal' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'}`}
                >
                  Thermal
                </button>
                <button
                  onClick={() => setReceiptVariant('professional')}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition ${receiptVariant === 'professional' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'}`}
                >
                  Professional
                </button>
              </div>
              <button onClick={() => window.print()} className="flex items-center gap-2 bg-white text-black font-bold px-5 py-2.5 rounded-lg text-sm shadow-xl hover:bg-neutral-200 transition">
                <Printer size={14} /> Print / Save PDF
              </button>
              <button onClick={() => setReceipt(null)} className="bg-neutral-800 text-white px-5 py-2.5 rounded-lg text-sm shadow-xl hover:bg-neutral-700 transition">
                New Sale
              </button>
            </div>
          </>
        );
      })()}

      {showQueuePanel && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-neutral-800">
              <h2 className="flex items-center gap-2 font-bold text-base text-white">
                <CloudUpload size={16} /> Pending Sync ({offlineQueue.length})
              </h2>
              <button onClick={() => setShowQueuePanel(false)} className="text-neutral-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3">
              {offlineQueue.length === 0 ? (
                <p className="text-sm text-neutral-500">Nothing pending — all sales are synced.</p>
              ) : (
                offlineQueue.map((q) => (
                  <div key={q.offlineRef} className="bg-neutral-950 border border-neutral-800 rounded p-3 text-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-white">{q.customerName || 'Walk-in customer'}</p>
                        <p className="text-xs text-neutral-400">{q.customerPhone} · {q.items.length} item{q.items.length !== 1 ? 's' : ''}</p>
                        <p className="text-xs text-neutral-600 mt-1">Queued {new Date(q.queuedAt).toLocaleString()}</p>
                      </div>
                      <button onClick={() => discardQueuedSale(q.offlineRef)} className="text-neutral-600 hover:text-red-400 shrink-0" aria-label="Discard"><Trash2 size={13} /></button>
                    </div>
                    {q.lastError && (
                      <p className="flex items-center gap-1.5 text-[11px] text-red-400 mt-2 pt-2 border-t border-neutral-800">
                        <AlertTriangle size={11} /> {q.lastError}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="p-5 border-t border-neutral-800">
              <button
                onClick={syncQueue}
                disabled={syncing || !isOnline || offlineQueue.length === 0}
                className="w-full flex items-center justify-center gap-2 bg-white text-black font-bold py-2.5 rounded-lg text-sm disabled:opacity-50"
              >
                {syncing ? <><Loader2 size={14} className="animate-spin" /> Syncing...</> : 'Sync Now'}
              </button>
              {!isOnline && <p className="text-[11px] text-neutral-500 text-center mt-2">Waiting for a connection to sync.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
