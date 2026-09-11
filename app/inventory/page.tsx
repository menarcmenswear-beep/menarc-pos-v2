'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { Search, Download, Pencil, Trash2, X, Check, CheckCircle2, XCircle, PackagePlus } from 'lucide-react';
import { LogoutButton } from '@/components/logout-button';

const supabase = createClient();

type Toast = { msg: string; type: 'success' | 'error' } | null;

export default function InventoryManagement() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  const [newSku, setNewSku] = useState('');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('General');
  const [newSupplier, setNewSupplier] = useState('Internal');
  const [newColor, setNewColor] = useState('');
  const [newSize, setNewSize] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newThreshold, setNewThreshold] = useState('15');

  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<any>({});
  const [confirmDeleteSku, setConfirmDeleteSku] = useState<string | null>(null);

  useEffect(() => {
    fetchInventory();
  }, []);

  function notify(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  }

  async function fetchInventory() {
    setLoading(true);
    const { data, error } = await supabase.from('inventory').select('*').order('sku');
    if (error) {
      notify('Error fetching stock: ' + error.message, 'error');
    } else if (data) {
      setInventory(data);
    }
    setLoading(false);
  }

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!newSku || !newPrice || !newQty) {
      notify('Please fill out SKU, Price, and Quantity.', 'error');
      return;
    }

    const { error } = await supabase.from('inventory').insert({
      sku: newSku.trim().toUpperCase(),
      name: newName.trim(),
      category: newCategory.trim(),
      supplier: newSupplier.trim(),
      color: newColor.trim(),
      size: newSize.trim(),
      price: parseFloat(newPrice),
      current_quantity: parseInt(newQty),
      low_stock_threshold: newThreshold ? parseInt(newThreshold) : 15,
    });

    if (error) {
      notify('Error adding product: ' + error.message, 'error');
    } else {
      notify('Product added successfully.');
      setNewSku(''); setNewName(''); setNewColor(''); setNewSize('');
      setNewPrice(''); setNewQty(''); setNewThreshold('15');
      fetchInventory();
    }
  }

  async function updateQuantity(sku: string, currentQty: number, delta: number) {
    const updatedQty = Math.max(0, currentQty + delta);
    const { error } = await supabase.from('inventory').update({ current_quantity: updatedQty }).eq('sku', sku);
    if (error) notify('Failed to update quantity: ' + error.message, 'error');
    else fetchInventory();
  }

  function startEdit(item: any) {
    setEditingSku(item.sku);
    setEditDraft({ ...item });
    setConfirmDeleteSku(null);
  }

  async function saveEdit() {
    const { error } = await supabase
      .from('inventory')
      .update({
        name: editDraft.name,
        category: editDraft.category,
        supplier: editDraft.supplier,
        color: editDraft.color,
        size: editDraft.size,
        price: parseFloat(editDraft.price),
        current_quantity: parseInt(editDraft.current_quantity),
        low_stock_threshold: editDraft.low_stock_threshold ? parseInt(editDraft.low_stock_threshold) : 15,
      })
      .eq('sku', editingSku);

    if (error) notify('Failed to save changes: ' + error.message, 'error');
    else {
      notify('Item updated.');
      setEditingSku(null);
      fetchInventory();
    }
  }

  async function deleteItem(sku: string) {
    const { error } = await supabase.from('inventory').delete().eq('sku', sku);
    if (error) notify('Failed to delete: ' + error.message, 'error');
    else {
      notify('Item deleted.');
      setConfirmDeleteSku(null);
      fetchInventory();
    }
  }

  function exportInventoryCSV() {
    if (inventory.length === 0) return notify('No inventory data to export.', 'error');
    const headers = ['SKU', 'Name', 'Category', 'Supplier', 'Color', 'Size', 'Price', 'Stock', 'Low Stock Threshold'];
    const rows = inventory.map(i => [i.sku, i.name, i.category, i.supplier, i.color, i.size, i.price, i.current_quantity, i.low_stock_threshold]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `menarc_inventory_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const categories = ['ALL', ...Array.from(new Set(inventory.map(item => item.category || 'General')))];

  const filteredInventory = inventory.filter((item) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      item.sku?.toLowerCase().includes(term) ||
      item.name?.toLowerCase().includes(term) ||
      item.supplier?.toLowerCase().includes(term) ||
      item.color?.toLowerCase().includes(term) ||
      item.size?.toLowerCase().includes(term);
    const matchesCategory = selectedCategory === 'ALL' || (item.category || 'General') === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6 md:p-10 font-sans">
      <div className="max-w-5xl mx-auto">
        <header className="flex flex-wrap justify-between items-center gap-3 mb-8 border-b border-neutral-800 pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-widest">MENARC</h1>
            <p className="text-xs text-neutral-400">Inventory Management & Supplier Control</p>
          </div>
          <div className="flex items-center gap-2">
            <nav className="flex items-center gap-2">
              <Link href="/" className="text-xs text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded transition">POS Checkout</Link>
              <Link href="/inventory" className="text-xs text-white bg-neutral-800 border border-neutral-700 px-3 py-1.5 rounded transition">Inventory</Link>
              <Link href="/dashboard" className="text-xs text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded transition">Dashboard</Link>
            </nav>
            <LogoutButton />
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl shadow-lg h-fit">
            <h2 className="flex items-center gap-2 font-bold text-base text-neutral-200 mb-4"><PackagePlus size={16} /> Add New Item</h2>
            <form onSubmit={handleAddProduct} className="space-y-4">
              <div>
                <label className="text-xs text-neutral-400 block mb-1">SKU *</label>
                <input type="text" placeholder="TSH-WHT-L" className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm uppercase text-white focus:outline-none focus:border-white w-full" value={newSku} onChange={(e) => setNewSku(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-neutral-400 block mb-1">Product Name</label>
                <input type="text" placeholder="Regular Fit T-Shirt" className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Category</label>
                  <input list="category-options" type="text" placeholder="General" className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
                  <datalist id="category-options">{categories.filter(c => c !== 'ALL').map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Supplier</label>
                  <input type="text" placeholder="Internal" className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full" value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Color</label>
                  <input type="text" placeholder="White" className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Size</label>
                  <input type="text" placeholder="L" className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full" value={newSize} onChange={(e) => setNewSize(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Price (₹) *</label>
                  <input type="number" min="0" placeholder="499" className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Quantity *</label>
                  <input type="number" min="0" placeholder="50" className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full" value={newQty} onChange={(e) => setNewQty(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs text-neutral-400 block mb-1">Low Stock Alert Below</label>
                <input type="number" min="0" placeholder="15" className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full" value={newThreshold} onChange={(e) => setNewThreshold(e.target.value)} />
              </div>
              <button type="submit" className="w-full bg-white text-black font-bold py-2.5 rounded hover:bg-neutral-200 transition text-sm mt-2">Save Product</button>
            </form>
          </div>

          <div className="md:col-span-2 bg-neutral-900 border border-neutral-800 p-6 rounded-xl shadow-lg flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
              <div>
                <h2 className="font-bold text-base text-neutral-200">Catalog Stock List</h2>
                <p className="text-xs text-neutral-500">Showing {filteredInventory.length} of {inventory.length} SKUs</p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto flex-wrap">
                <button onClick={exportInventoryCSV} className="flex items-center gap-1.5 text-xs bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 px-3 py-1.5 rounded transition">
                  <Download size={12} /> Export CSV
                </button>
                <select className="bg-neutral-950 border border-neutral-700 text-white px-3 py-1.5 rounded text-xs focus:outline-none" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                  {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                <div className="relative w-full sm:w-40">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" size={12} />
                  <input type="text" placeholder="Search SKU, supplier..." className="bg-neutral-950 border border-neutral-700 text-white pl-7 pr-2 py-1.5 rounded text-xs focus:outline-none w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="space-y-3 py-1">{[...Array(6)].map((_, i) => <div key={i} className="h-14 bg-neutral-800/50 rounded animate-pulse" />)}</div>
            ) : filteredInventory.length === 0 ? (
              <p className="text-sm text-neutral-500 py-4">No matching inventory items found.</p>
            ) : (
              <div className="divide-y divide-neutral-800 max-h-[440px] overflow-y-auto pr-2">
                {filteredInventory.map((item) => {
                  const isLowStock = item.current_quantity < (item.low_stock_threshold ?? 15);
                  const isEditing = editingSku === item.sku;

                  if (isEditing) {
                    return (
                      <div key={item.sku} className="py-3 space-y-2 bg-neutral-950/60 -mx-2 px-2 rounded">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">{item.sku}</span>
                          <span className="text-[10px] text-neutral-500">editing</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input className="bg-neutral-900 border border-neutral-700 rounded p-1.5 text-xs" placeholder="Name" value={editDraft.name || ''} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />
                          <input className="bg-neutral-900 border border-neutral-700 rounded p-1.5 text-xs" placeholder="Category" value={editDraft.category || ''} onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })} />
                          <input className="bg-neutral-900 border border-neutral-700 rounded p-1.5 text-xs" placeholder="Color" value={editDraft.color || ''} onChange={(e) => setEditDraft({ ...editDraft, color: e.target.value })} />
                          <input className="bg-neutral-900 border border-neutral-700 rounded p-1.5 text-xs" placeholder="Size" value={editDraft.size || ''} onChange={(e) => setEditDraft({ ...editDraft, size: e.target.value })} />
                          <input type="number" min="0" className="bg-neutral-900 border border-neutral-700 rounded p-1.5 text-xs" placeholder="Price" value={editDraft.price ?? ''} onChange={(e) => setEditDraft({ ...editDraft, price: e.target.value })} />
                          <input type="number" min="0" className="bg-neutral-900 border border-neutral-700 rounded p-1.5 text-xs" placeholder="Qty" value={editDraft.current_quantity ?? ''} onChange={(e) => setEditDraft({ ...editDraft, current_quantity: e.target.value })} />
                          <input type="number" min="0" className="bg-neutral-900 border border-neutral-700 rounded p-1.5 text-xs col-span-2" placeholder="Low stock below" value={editDraft.low_stock_threshold ?? ''} onChange={(e) => setEditDraft({ ...editDraft, low_stock_threshold: e.target.value })} />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button onClick={saveEdit} className="flex items-center gap-1 text-xs bg-white text-black font-semibold px-3 py-1.5 rounded"><Check size={12} /> Save</button>
                          <button onClick={() => setEditingSku(null)} className="flex items-center gap-1 text-xs bg-neutral-800 px-3 py-1.5 rounded"><X size={12} /> Cancel</button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={item.sku} className="py-3 flex justify-between items-center text-sm gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-neutral-100">{item.sku}</p>
                          <span className="bg-neutral-800 text-neutral-300 text-[10px] px-1.5 py-0.5 rounded">{item.category || 'General'}</span>
                          {item.supplier && <span className="bg-neutral-800/60 text-neutral-400 text-[10px] px-1.5 py-0.5 rounded">Supplier: {item.supplier}</span>}
                          {isLowStock && <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] px-1.5 py-0.5 rounded font-medium">Low Stock</span>}
                        </div>
                        <p className="text-xs text-neutral-400 truncate">{item.name || 'Unnamed'} {item.color ? `• ${item.color}` : ''} {item.size ? `• ${item.size}` : ''} | ₹{item.price}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`font-mono text-sm ${isLowStock ? 'text-amber-400 font-bold' : 'text-neutral-300'}`}>{item.current_quantity} qty</span>
                        <div className="flex gap-1">
                          <button onClick={() => updateQuantity(item.sku, item.current_quantity, -1)} className="bg-neutral-800 px-2 py-1 rounded text-xs hover:bg-neutral-700">-</button>
                          <button onClick={() => updateQuantity(item.sku, item.current_quantity, 1)} className="bg-neutral-800 px-2 py-1 rounded text-xs hover:bg-neutral-700">+</button>
                        </div>
                        <button onClick={() => startEdit(item)} className="text-neutral-500 hover:text-white p-1" aria-label="Edit"><Pencil size={13} /></button>
                        {confirmDeleteSku === item.sku ? (
                          <button onClick={() => deleteItem(item.sku)} className="text-[10px] bg-red-950 border border-red-700 text-red-300 px-2 py-1 rounded font-medium">Confirm?</button>
                        ) : (
                          <button onClick={() => setConfirmDeleteSku(item.sku)} className="text-neutral-500 hover:text-red-400 p-1" aria-label="Delete"><Trash2 size={13} /></button>
                        )}
                      </div>
                    </div>
                  );
                })}
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
