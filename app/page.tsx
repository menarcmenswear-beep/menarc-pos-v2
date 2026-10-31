'use client';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ScanLine, ShoppingCart, Trash2, Plus, Minus, RefreshCw, CheckCircle2, XCircle, Loader2, Package, User, UserRound, Printer, Percent, Wifi, WifiOff, CloudUpload, AlertTriangle, X } from 'lucide-react';
import { Nav } from '@/components/nav';

// ❌ REMOVE THIS: const supabase = createClient();

const OFFLINE_QUEUE_KEY = 'menarc_offline_sale_queue';

// ... (types and playTone remain unchanged)

export default function POS() {
  // ✅ Instantiate supabase client inside the component scope
  const supabase = createClient();

  const [sku, setSku] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  // ... rest of your code stays exactly the same
