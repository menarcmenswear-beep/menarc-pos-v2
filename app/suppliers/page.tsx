'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Truck, Pencil, Trash2, X, Check, CheckCircle2, XCircle, Plus, Lock, Phone, Mail, MapPin, Search } from 'lucide-react';
import { Nav } from '@/components/nav';
import { useStaffRole } from '@/lib/hooks/use-staff-role';

const supabase = createClient();

type Toast = { msg: string; type: 'success' | 'error' } | null;

export default function SuppliersPage() {
  const { isAdmin, loading: roleLoading } = useStaffRole();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<any>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => { fetchSuppliers(); }, []);

  const filteredSuppliers = suppliers.filter((s) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      s.name?.toLowerCase().includes(term) ||
      s.contact_person?.toLowerCase().includes(term) ||
      s.phone?.includes(term) ||
      s.email?.toLowerCase().includes(term)
    );
  });

  function notify(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  }

  async function fetchSuppliers() {
    setLoading(true);
    const { data, error } = await supabase.from('suppliers').select('*').order('name');
    if (error) notify('Error fetching suppliers: ' + error.message, 'error');
    else if (data) setSuppliers(data);
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return notify('Supplier name is required.', 'error');
    if (phone.trim() && !/^\d{10}$/.test(phone.trim())) {
      return notify('Phone number must be exactly 10 digits.', 'error');
    }

    const { error } = await supabase.from('suppliers').insert({
      name: name.trim(),
      contact_person: contactPerson.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
    });

    if (error) notify('Error adding supplier: ' + error.message, 'error');
    else {
      notify('Supplier added.');
      setName(''); setContactPerson(''); setPhone(''); setEmail(''); setAddress(''); setNotes('');
      fetchSuppliers();
    }
  }

  function startEdit(s: any) {
    setEditingId(s.id);
    setEditDraft({ ...s });
    setConfirmDeleteId(null);
  }

  async function saveEdit() {
    if (editDraft.phone && !/^\d{10}$/.test(editDraft.phone)) {
      return notify('Phone number must be exactly 10 digits.', 'error');
    }

    const { error } = await supabase.from('suppliers').update({
      name: editDraft.name,
      contact_person: editDraft.contact_person,
      phone: editDraft.phone,
      email: editDraft.email,
      address: editDraft.address,
      notes: editDraft.notes,
    }).eq('id', editingId);

    if (error) notify('Failed to save: ' + error.message, 'error');
    else {
      notify('Supplier updated.');
      setEditingId(null);
      fetchSuppliers();
    }
  }

  async function deleteSupplier(id: string) {
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) notify('Failed to delete (likely still linked to inventory items): ' + error.message, 'error');
    else {
      notify('Supplier deleted.');
      setConfirmDeleteId(null);
      fetchSuppliers();
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6 md:p-10 font-sans">
      <div className="max-w-5xl mx-auto">
        <header className="flex flex-wrap justify-between items-center gap-3 mb-8 border-b border-neutral-800 pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-widest">MENARC</h1>
            <p className="text-xs text-neutral-400">Supplier Directory</p>
          </div>
          <Nav current="/suppliers" showLogout />
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {isAdmin && (
            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl shadow-lg h-fit">
              <h2 className="flex items-center gap-2 font-bold text-base text-neutral-200 mb-4"><Plus size={16} /> Add Supplier</h2>
              <form onSubmit={handleAdd} className="space-y-4">
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Supplier Name *</label>
                  <input type="text" placeholder="Kinsey Knitt International" className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Contact Person</label>
                  <input type="text" placeholder="Ramesh" className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-neutral-400 block mb-1">Phone</label>
                    <input type="tel" inputMode="numeric" maxLength={10} placeholder="10-digit number" className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 block mb-1">Email</label>
                    <input type="email" placeholder="supplier@mail.com" className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Address</label>
                  <textarea placeholder="Tirupur, Tamil Nadu" rows={2} className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full resize-none" value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Notes</label>
                  <textarea placeholder="Payment terms, lead time, etc." rows={2} className="bg-neutral-950 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-white w-full resize-none" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
                <button type="submit" className="w-full bg-white text-black font-bold py-2.5 rounded hover:bg-neutral-200 transition text-sm">Save Supplier</button>
              </form>
            </div>
          )}

          <div className={isAdmin ? "md:col-span-2 bg-neutral-900 border border-neutral-800 p-6 rounded-xl shadow-lg" : "md:col-span-3 bg-neutral-900 border border-neutral-800 p-6 rounded-xl shadow-lg"}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-bold text-base text-neutral-200"><Truck size={16} /> All Suppliers</h2>
                <p className="text-xs text-neutral-500">{filteredSuppliers.length} of {suppliers.length} shown {!isAdmin && !roleLoading && '· view-only'}</p>
              </div>
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" size={12} />
                <input type="text" placeholder="Search name, contact, phone..." className="bg-neutral-950 border border-neutral-700 text-white pl-7 pr-2 py-1.5 rounded text-xs focus:outline-none w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
            </div>

            {loading ? (
              <div className="space-y-3 py-1">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-neutral-800/50 rounded animate-pulse" />)}</div>
            ) : filteredSuppliers.length === 0 ? (
              <p className="text-sm text-neutral-500 py-4">{suppliers.length === 0 ? 'No suppliers added yet.' : 'No suppliers match your search.'}</p>
            ) : (
              <div className="divide-y divide-neutral-800">
                {filteredSuppliers.map((s) => {
                  const isEditing = editingId === s.id;

                  if (isEditing && isAdmin) {
                    return (
                      <div key={s.id} className="py-4 space-y-2">
                        <input className="bg-neutral-950 border border-neutral-700 rounded p-1.5 text-sm w-full font-semibold" value={editDraft.name || ''} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />
                        <div className="grid grid-cols-2 gap-2">
                          <input className="bg-neutral-950 border border-neutral-700 rounded p-1.5 text-xs" placeholder="Contact person" value={editDraft.contact_person || ''} onChange={(e) => setEditDraft({ ...editDraft, contact_person: e.target.value })} />
                          <input type="tel" inputMode="numeric" maxLength={10} className="bg-neutral-950 border border-neutral-700 rounded p-1.5 text-xs" placeholder="10-digit phone" value={editDraft.phone || ''} onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
                          <input className="bg-neutral-950 border border-neutral-700 rounded p-1.5 text-xs" placeholder="Email" value={editDraft.email || ''} onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })} />
                          <input className="bg-neutral-950 border border-neutral-700 rounded p-1.5 text-xs" placeholder="Address" value={editDraft.address || ''} onChange={(e) => setEditDraft({ ...editDraft, address: e.target.value })} />
                        </div>
                        <textarea className="bg-neutral-950 border border-neutral-700 rounded p-1.5 text-xs w-full resize-none" rows={2} placeholder="Notes" value={editDraft.notes || ''} onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })} />
                        <div className="flex gap-2 pt-1">
                          <button onClick={saveEdit} className="flex items-center gap-1 text-xs bg-white text-black font-semibold px-3 py-1.5 rounded"><Check size={12} /> Save</button>
                          <button onClick={() => setEditingId(null)} className="flex items-center gap-1 text-xs bg-neutral-800 px-3 py-1.5 rounded"><X size={12} /> Cancel</button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={s.id} className="py-4 flex justify-between items-start gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-neutral-100">{s.name}</p>
                        {s.contact_person && <p className="text-xs text-neutral-400 mt-0.5">Contact: {s.contact_person}</p>}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-neutral-500">
                          {s.phone && <span className="flex items-center gap-1"><Phone size={11} /> {s.phone}</span>}
                          {s.email && <span className="flex items-center gap-1"><Mail size={11} /> {s.email}</span>}
                          {s.address && <span className="flex items-center gap-1"><MapPin size={11} /> {s.address}</span>}
                        </div>
                        {s.notes && <p className="text-xs text-neutral-600 mt-1.5 italic">{s.notes}</p>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {isAdmin ? (
                          <>
                            <button onClick={() => startEdit(s)} className="text-neutral-500 hover:text-white p-1" aria-label="Edit"><Pencil size={13} /></button>
                            {confirmDeleteId === s.id ? (
                              <button onClick={() => deleteSupplier(s.id)} className="text-[10px] bg-red-950 border border-red-700 text-red-300 px-2 py-1 rounded font-medium">Confirm?</button>
                            ) : (
                              <button onClick={() => setConfirmDeleteId(s.id)} className="text-neutral-500 hover:text-red-400 p-1" aria-label="Delete"><Trash2 size={13} /></button>
                            )}
                          </>
                        ) : (
                          <Lock size={12} className="text-neutral-700" />
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
