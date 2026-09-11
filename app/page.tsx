'use client';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ScanLine, ShoppingCart, Trash2, Plus, Minus, RefreshCw, CheckCircle2, XCircle, Loader2, Package, User, UserRound } from 'lucide-react';
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
  const [showCustomerFields, setShowCustomerFields] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
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
    updated[index] = { ...updated[index], checkoutQty: newQty };
    setCart(updated);
  }

  function removeFromCart(index: number) {
    setCart(cart.filter((_, i) => i !== index));
  }

  async function completeSale() {
    if (cart.length === 0) return;
    setProcessing(true);

    const items = cart.map(item => ({
      sku: item.sku,
      qty: item.checkoutQty,
      item_rate: item.price,
      discount: item.discount,
    }));

    const { error } = await supabase.rpc('record_sale', {
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

    playTone(1046, 140);
    notify('Sale completed successfully.', 'success');
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setProcessing(false);
    fetchInventory();
  }

  const cartTotal = cart.reduce((acc, item) => acc + (item.price * item.checkoutQty) - item.discount, 0);
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
                  <div className="divide-y divide-neutral-800 max-h-[220px] overflow-y-auto pr-2">
                    {cart.map((item, index) => (
                      <div key={index} className="py-2.5 flex justify-between items-center text-sm">
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
                          <span className="font-mono text-neutral-200 w-16 text-right">₹{item.price * item.checkoutQty}</span>
                          <button onClick={() => removeFromCart(index)} className="text-neutral-600 hover:text-red-400" aria-label="Remove item"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {cart.length > 0 && (
                <div className="pt-4 border-t border-neutral-800 mt-4">
                  <button
                    onClick={() => setShowCustomerFields(!showCustomerFields)}
                    className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white mb-3"
                  >
                    <UserRound size={12} /> {showCustomerFields ? 'Hide' : 'Add'} customer details (optional)
                  </button>
                  {showCustomerFields && (
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <input
                        type="text" placeholder="Customer name"
                        className="col-span-2 bg-neutral-950 border border-neutral-700 rounded p-2 text-xs text-white focus:outline-none focus:border-white"
                        value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                      />
                      <input
                        type="tel" placeholder="Phone number"
                        className="bg-neutral-950 border border-neutral-700 rounded p-2 text-xs text-white focus:outline-none focus:border-white"
                        value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
                      />
                      <input
                        type="email" placeholder="Email (optional)"
                        className="bg-neutral-950 border border-neutral-700 rounded p-2 text-xs text-white focus:outline-none focus:border-white"
                        value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="flex justify-between items-center text-lg font-bold mb-4">
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
    </div>
  );
}
