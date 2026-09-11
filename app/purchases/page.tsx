'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PackagePlus, CheckCircle2, XCircle, Loader2, Search } from 'lucide-react';
import { Nav } from '@/components/nav';
import { useStaffRole } from '@/lib/hooks/use-staff-role';

const supabase = createClient();

type Toast = { msg: string; type: 'success' | 'error' } | null;

export default function PurchasesPage() {
  const { userId } = useStaffRole();
  const [entries, setEntries] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const [sku, setSku] = useState('');
  const [productName, setProductName] = useState('');
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [quantity, setQuantity] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('General');
  const [threshold, setThreshold] = useState('15');

  useEffect(() => {
    fetchEntries();
    fetchSuppliers();
  }, []);

  function notify(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  }

  async function fetchEntries() {
    setLoading(true);
    const { data, error } = await supabase
      .from('purchase_entries')
      .select('*, suppliers(name)')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) notify('Error fetching purchase log: ' + error.message, 'error');
    else if (data) setEntries(data);
    setLoading(false);
  }

  async function fetchSuppliers() {
    const { data } = await supabase.from('suppliers').select('id, name').order('name');
    if (data) setSuppliers(data);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sku || !quantity || !price) {
      return notify('SKU, quantity, and price are required.', 'error');
    }

    setSubmitting(true);
    const { error } = await supabase.rpc('record_purchase', {
      p_sku: sku.trim().toUpperCase(),
      p_product_name: productName.trim() || null,
      p_color: color.trim() || null,
      p_size: size.trim() || null,
      p_quantity: parseInt(quantity),
      p_supplier_id: supplierId || null,
      p_price: parseFloat(price),
      p_category: category.trim() || 'General',
      p_low_stock_threshold: threshold ? parseInt(threshold) : 15,
      p_staff_id: userId,
    });

    if (error) {
      notify('Failed to log purchase: ' + error.message, 'error');
    } else {
      notify('Purchase logged — stock updated.');
      setSku(''); setProductName(''); setColor(''); setSize('');
      setQuantity(''); setPrice(''); setSupplierId('');
      fetchEntries();
    }
    setSubmitting(false);
  }

  const totalValue = quantity && price ? (parseFloat(quantity) * parseFloat(price)).toFixed(2) : null;

  const filteredEntries = entries.filter((e) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      e.sku?.toLowerCase().includes(term) ||
      e.product_name?.toLowerCase().includes(term) ||
      e.suppliers?.name?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6 md:p-10 font-sans">
      <div className="max-w-5xl mx-auto">
        <header className="flex flex-wrap justify-between items-center gap-3 mb-8 border-b border-neutral-800 pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-widest">MENARC</h1>
            <p className="text-xs text-neutral-400">Purchase Entry — Goods Received</p>
          </div>
          <Nav current="/purchases" showLogout />
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl shadow-lg h-fit">
            <h2 className="flex items-center gap-2 font-bold text-base text-neutral-200 mb-4"><PackagePlus size={16} /> Log a Purchase</h2>
            <p className="text-xs text-neutral-500 mb-4">
              If the SKU already exists, this adds to its stock and updates its cost price.
              If it's new, it creates the catalog entry (you'll set the sell price afterward in Inventory).
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-neutral-400 block mb-1">SKU *</label>
                <input type="text" placeholder="TSH-WHT-L" className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm uppercase text-white focus:outline-none focus:border-white w-full" value={sku} onChange={(e) => setSku(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-neutral-400 block mb-1">Product Name</label>
                <input type="text" placeholder="Regular Fit T-Shirt" className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full" value={productName} onChange={(e) => setProductName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Color</label>
                  <input type="text" placeholder="White" className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full" value={color} onChange={(e) => setColor(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Size</label>
                  <input type="text" placeholder="L" className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full" value={size} onChange={(e) => setSize(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs text-neutral-400 block mb-1">Supplier</label>
                <select className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Select a supplier</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {suppliers.length === 0 && <p className="text-[10px] text-amber-400 mt-1">No suppliers on file yet — add one on the Suppliers page first.</p>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Quantity *</label>
                  <input type="number" min="1" placeholder="50" className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Price / unit (₹) *</label>
                  <input type="number" min="0" placeholder="300" className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full" value={price} onChange={(e) => setPrice(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Category (new SKU only)</label>
                  <input type="text" className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full" value={category} onChange={(e) => setCategory(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Low Stock Below</label>
                  <input type="number" min="0" className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
                </div>
              </div>

              {totalValue && (
                <div className="bg-neutral-950 border border-neutral-800 rounded p-2.5 text-sm flex justify-between">
                  <span className="text-neutral-400">Total goods value</span>
                  <span className="font-mono font-bold">₹{totalValue}</span>
                </div>
              )}

              <button type="submit" disabled={submitting} className="w-full flex items-center justify-center gap-2 bg-white text-black font-bold py-2.5 rounded hover:bg-neutral-200 transition text-sm disabled:opacity-60">
                {submitting ? <><Loader2 size={14} className="animate-spin" /> Logging...</> : 'Log Purchase'}
              </button>
            </form>
          </div>

          <div className="md:col-span-2 bg-neutral-900 border border-neutral-800 p-6 rounded-xl shadow-lg">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
              <div>
                <h2 className="font-bold text-base text-neutral-200">Recent Purchase Log</h2>
                <p className="text-xs text-neutral-500">{filteredEntries.length} of {entries.length} shown (last 50 entries)</p>
              </div>
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" size={12} />
                <input type="text" placeholder="Search SKU or supplier..." className="bg-neutral-950 border border-neutral-700 text-white pl-7 pr-2 py-1.5 rounded text-xs focus:outline-none w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
            </div>

            {loading ? (
              <div className="space-y-3 py-1">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-neutral-800/50 rounded animate-pulse" />)}</div>
            ) : filteredEntries.length === 0 ? (
              <p className="text-sm text-neutral-500 py-4">{entries.length === 0 ? 'No purchases logged yet.' : 'No entries match your search.'}</p>
            ) : (
              <div className="divide-y divide-neutral-800 max-h-[560px] overflow-y-auto pr-2">
                {filteredEntries.map((e) => (
                  <div key={e.id} className="py-3 flex justify-between items-center text-sm">
                    <div>
                      <p className="font-semibold text-neutral-100">{e.sku}</p>
                      <p className="text-xs text-neutral-400">
                        {e.product_name} {e.color ? `• ${e.color}` : ''} {e.size ? `• ${e.size}` : ''} · {e.quantity} units @ ₹{e.price}
                      </p>
                      {e.suppliers?.name && <p className="text-xs text-neutral-500 mt-0.5">from {e.suppliers.name}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-bold text-white">₹{e.total_value}</p>
                      <p className="text-xs text-neutral-500">{new Date(e.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl border text-sm font-medium z-50
          ${toast.type === 'success' ? 'bg-emerald-950 border-emerald-700 text-emerald-300' : 'bg-red-950 border-red-700 text-red-300'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
