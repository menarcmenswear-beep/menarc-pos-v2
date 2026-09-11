'use client';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ScanLine, ShoppingCart, Trash2, Plus, Minus, RefreshCw, CheckCircle2, XCircle, Loader2, Package, User, UserRound, Printer, Percent } from 'lucide-react';
import { Nav } from '@/components/nav';

const supabase = createClient();

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchInventory();
    fetchStaff();
  }, []);

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
        setCart([...cart, { ...item, checkoutQty: 1, discount: 0 }]);
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

  function updateCartDiscount(index: number, value: string) {
    const item = cart[index];
    const lineValue = item.price * item.checkoutQty;
    let discount = parseFloat(value) || 0;
    if (discount < 0) discount = 0;
    if (discount > lineValue) discount = lineValue;
    const updated = [...cart];
    updated[index] = { ...updated[index], discount };
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
    const newLineValue = item.price * newQty;
    const clampedDiscount = Math.min(item.discount, newLineValue);
    updated[index] = { ...updated[index], checkoutQty: newQty, discount: clampedDiscount };
    setCart(updated);
  }

  function removeFromCart(index: number) {
    setCart(cart.filter((_, i) => i !== index));
  }

  async function completeSale() {
    if (cart.length === 0) return;

    if (!customerName.trim() || !customerPhone.trim()) {
      notify('Customer name and phone number are required to complete a sale.', 'error');
      return;
    }

    setProcessing(true);

    const items = cart.map(item => ({
      sku: item.sku,
      qty: item.checkoutQty,
      item_rate: item.price,
      discount: item.discount,
    }));

    const { data: saleId, error } = await supabase.rpc('record_sale', {
      p_items: items,
      p_offline_ref: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null,
      p_staff_id: staffId || null,
      p_customer_name: customerName.trim() || null,
      p_customer_phone: customerPhone.trim() || null,
      p_customer_email: customerEmail.trim() || null,
    });

    if (error) {
      notify('Sale failed: ' + error.message, 'error');
      setProcessing(false);
      return;
    }

    const cashier = staff.find(s => s.id === staffId);
    setReceipt({
      id: saleId,
      date: new Date(),
      cashierName: cashier?.full_name || null,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerEmail: customerEmail.trim(),
      items: cart.map(i => ({
        sku: i.sku,
        name: i.name,
        qty: i.checkoutQty,
        rate: i.price,
        discount: i.discount,
        lineTotal: i.price * i.checkoutQty - i.discount,
        hsn: i.hsn_code || null,
        gstRate: i.gst_rate || 0,
      })),
      subtotal: cartSubtotal,
      discountTotal: cartDiscountTotal,
      total: cartTotal,
    });

    playTone(1046, 140);
    notify('Sale completed successfully.', 'success');
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setProcessing(false);
    fetchInventory();
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
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-neutral-100">{item.sku}</p>
                          {isOut ? (
                            <span className="bg-red-500/10 text-red-400 border border-red-500/30 text-[10px] px-1.5 py-0.5 rounded font-medium">Out of Stock</span>
                          ) : isLowStock && (
                            <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] px-1.5 py-0.5 rounded font-medium">Low Stock</span>
                          )}
                        </div>
                        <p className="text-xs text-neutral-400">{item.name} {item.color ? `• ${item.color}` : ''} {item.size ? `• ${item.size}` : ''}</p>
                      </div>
                      <div className="text-right">
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
                            <div>
                              <p className="font-medium text-white">{item.sku}</p>
                              <p className="text-xs text-neutral-400">₹{item.price} each</p>
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
                            <Percent size={11} className="text-neutral-600" />
                            <input
                              type="number" min="0" max={lineGross} placeholder="Discount ₹"
                              className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-[11px] text-neutral-300 w-24 focus:outline-none focus:border-neutral-600"
                              value={item.discount || ''}
                              onChange={(e) => updateCartDiscount(index, e.target.value)}
                            />
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
                      type="tel" placeholder="Phone number *" required
                      className="bg-neutral-950 border border-neutral-700 rounded p-2 text-xs text-white focus:outline-none focus:border-white"
                      value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
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
                  </div>
                  <div className="border-t border-dashed border-neutral-400 my-2" />
                  <p>Date: {receipt.date.toLocaleString()}</p>
                  <p>Receipt #: {receipt.id ? String(receipt.id).slice(0, 8) : '—'}</p>
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
                    <div className="flex justify-between mb-6 pb-6 border-b border-neutral-200">
                      <div>
                        <p className="text-[11px] text-neutral-500 uppercase tracking-wide mb-1">Billed To</p>
                        <p className="font-semibold text-neutral-900">{receipt.customerName}</p>
                        <p className="text-sm text-neutral-600">{receipt.customerPhone}</p>
                        {receipt.customerEmail && <p className="text-sm text-neutral-600">{receipt.customerEmail}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-neutral-500 uppercase tracking-wide mb-1">Invoice Details</p>
                        <p className="text-sm text-neutral-700">Receipt #{receipt.id ? String(receipt.id).slice(0, 8) : '—'}</p>
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
    </div>
  );
}
