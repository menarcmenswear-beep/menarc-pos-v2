'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Undo2, Search, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Nav } from '@/components/nav';
import { useStaffRole } from '@/lib/hooks/use-staff-role';

const supabase = createClient();

type Toast = { msg: string; type: 'success' | 'error' } | null;

export default function ReturnsPage() {
  const { userId } = useStaffRole();
  const [searchTerm, setSearchTerm] = useState('');
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);

  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [returnQty, setReturnQty] = useState('1');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [recentReturns, setRecentReturns] = useState<any[]>([]);

  useEffect(() => {
    fetchRecentSales();
    fetchRecentReturns();
  }, []);

  function notify(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  }

  async function fetchRecentSales() {
    setLoading(true);
    const { data, error } = await supabase
      .from('sales')
      .select('*, sale_items(*)')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) notify('Error fetching sales: ' + error.message, 'error');
    else if (data) setSales(data);
    setLoading(false);
  }

  async function fetchRecentReturns() {
    const { data } = await supabase
      .from('returns')
      .select('*, sale_items(sku)')
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setRecentReturns(data);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedItemId || !returnQty) return notify('Pick a sale line and quantity.', 'error');

    setSubmitting(true);
    const { error } = await supabase.rpc('record_return', {
      p_sale_item_id: selectedItemId,
      p_qty: parseInt(returnQty),
      p_reason: reason.trim() || null,
      p_staff_id: userId,
    });

    if (error) {
      notify('Return failed: ' + error.message, 'error');
    } else {
      notify('Return recorded — stock restocked.');
      setSelectedSale(null);
      setSelectedItemId('');
      setReturnQty('1');
      setReason('');
      fetchRecentSales();
      fetchRecentReturns();
    }
    setSubmitting(false);
  }

  const filteredSales = sales.filter((s) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      s.customer_name?.toLowerCase().includes(term) ||
      s.customer_phone?.includes(term) ||
      s.sale_items?.some((i: any) => i.sku.toLowerCase().includes(term)) ||
      s.id.includes(term)
    );
  });

  const selectedItem = selectedSale?.sale_items?.find((i: any) => i.id === selectedItemId);
  const maxReturnable = selectedItem ? selectedItem.qty - (selectedItem.returned_qty || 0) : 0;

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6 md:p-10 font-sans">
      <div className="max-w-5xl mx-auto">
        <header className="flex flex-wrap justify-between items-center gap-3 mb-8 border-b border-neutral-800 pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-widest">MENARC</h1>
            <p className="text-xs text-neutral-400">Returns & Exchanges</p>
          </div>
          <Nav current="/returns" showLogout />
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 bg-neutral-900 border border-neutral-800 p-6 rounded-xl shadow-lg">
            <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
              <h2 className="font-bold text-base text-neutral-200">Find the Sale</h2>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" size={12} />
                <input type="text" placeholder="Customer name, phone, or SKU..." className="bg-neutral-950 border border-neutral-700 text-white pl-7 pr-2 py-1.5 rounded text-xs focus:outline-none w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
            </div>

            {loading ? (
              <div className="space-y-3 py-1">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-neutral-800/50 rounded animate-pulse" />)}</div>
            ) : filteredSales.length === 0 ? (
              <p className="text-sm text-neutral-500 py-4">No matching sales found in the last 30.</p>
            ) : (
              <div className="divide-y divide-neutral-800 max-h-[560px] overflow-y-auto pr-2">
                {filteredSales.map((sale) => (
                  <button
                    key={sale.id}
                    onClick={() => { setSelectedSale(sale); setSelectedItemId(''); }}
                    className={`w-full text-left py-3 px-2 -mx-2 rounded transition ${selectedSale?.id === sale.id ? 'bg-neutral-800' : 'hover:bg-neutral-800/50'}`}
                  >
                    <div className="flex justify-between items-center text-sm">
                      <div>
                        <p className="font-medium text-neutral-100">{sale.customer_name || 'Walk-in customer'}{sale.customer_phone ? ` · ${sale.customer_phone}` : ''}</p>
                        <p className="text-xs text-neutral-400">{sale.sale_items?.map((i: any) => i.sku).join(', ')}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm text-white">₹{sale.total}</p>
                        <p className="text-xs text-neutral-500">{new Date(sale.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl shadow-lg h-fit">
            <h2 className="flex items-center gap-2 font-bold text-base text-neutral-200 mb-4"><Undo2 size={16} /> Process Return</h2>

            {!selectedSale ? (
              <p className="text-sm text-neutral-500">Pick a sale on the left to see its items.</p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Line item</label>
                  <select
                    className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full"
                    value={selectedItemId}
                    onChange={(e) => { setSelectedItemId(e.target.value); setReturnQty('1'); }}
                  >
                    <option value="">Select item</option>
                    {selectedSale.sale_items?.map((i: any) => {
                      const remaining = i.qty - (i.returned_qty || 0);
                      return (
                        <option key={i.id} value={i.id} disabled={remaining <= 0}>
                          {i.sku} — {remaining} of {i.qty} returnable
                        </option>
                      );
                    })}
                  </select>
                </div>

                {selectedItemId && (
                  <>
                    <div>
                      <label className="text-xs text-neutral-400 block mb-1">Quantity to return (max {maxReturnable})</label>
                      <input
                        type="number" min="1" max={maxReturnable}
                        className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full"
                        value={returnQty} onChange={(e) => setReturnQty(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-neutral-400 block mb-1">Reason</label>
                      <textarea rows={2} placeholder="Wrong size, defective, etc." className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full resize-none" value={reason} onChange={(e) => setReason(e.target.value)} />
                    </div>
                    <p className="text-[10px] text-neutral-500">This restocks inventory but doesn't adjust the original sale total — handle any refund separately.</p>
                    <button type="submit" disabled={submitting} className="w-full flex items-center justify-center gap-2 bg-white text-black font-bold py-2.5 rounded hover:bg-neutral-200 transition text-sm disabled:opacity-60">
                      {submitting ? <><Loader2 size={14} className="animate-spin" /> Processing...</> : 'Confirm Return'}
                    </button>
                  </>
                )}
              </form>
            )}

            {recentReturns.length > 0 && (
              <div className="mt-6 pt-4 border-t border-neutral-800">
                <p className="text-xs text-neutral-500 mb-2">Recent returns</p>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {recentReturns.map((r) => (
                    <div key={r.id} className="text-xs flex justify-between text-neutral-400">
                      <span>{r.sale_items?.sku} × {r.qty}</span>
                      <span>{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
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
