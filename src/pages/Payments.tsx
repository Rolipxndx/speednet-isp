import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Filter,
  Download,
  Eye,
  Upload,
  Calendar as CalendarIcon,
  X,
  Printer,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useDropzone } from 'react-dropzone';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import toast from 'react-hot-toast';

// ---------- Tipos ----------
const paymentSchema = z.object({
  client_id: z.string().uuid('Cliente requerido'),
  amount: z.number().positive('El monto debe ser positivo'),
  payment_date: z.date(),
  billing_month: z.string().min(1, 'Mes facturado requerido'),
  payment_method: z.enum(['efectivo', 'transferencia', 'tarjeta', 'otro']),
  notes: z.string().optional().nullable(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

type Payment = {
  id: string;
  client_id: string;
  amount: number;
  payment_date: string;
  billing_month: string;
  payment_method: 'efectivo' | 'transferencia' | 'tarjeta' | 'otro';
  evidence_url: string | null;
  receipt_url: string | null;
  notes: string | null;
  created_at: string;
  client?: {
    full_name: string;
    id_number: string;
    plan?: { price: number } | null;
  } | null;
};

type ClientOption = {
  id: string;
  full_name: string;
  id_number: string;
  plan_price: number | null;
};

// Generar meses facturación
const generateMonthOptions = () => {
  const options = [];
  const now = new Date();
  for (let i = -12; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = format(date, 'yyyy-MM');
    const label = format(date, 'MMMM yyyy', { locale: es });
    options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return options;
};

const monthOptions = generateMonthOptions();

// ---------- Componente Principal ----------
export default function Payments() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const preselectedClientId = searchParams.get('client');

  const [openDialog, setOpenDialog] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined } | undefined>(undefined);
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generateReceipt, setGenerateReceipt] = useState(false);

  const isAdminOrCobrador = profile?.role === 'admin' || profile?.role === 'cobrador';
  const canEdit = isAdminOrCobrador;
  const canDelete = profile?.role === 'admin';

  // Obtener clientes para selector con el precio del plan
  const { data: clients } = useQuery({
    queryKey: ['clients-select'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, full_name, id_number, plan:plans!plan_id(price)')
        .order('full_name');
      if (error) throw error;
      
      return data.map((c: any) => ({
        id: c.id,
        full_name: c.full_name,
        id_number: c.id_number,
        plan_price: c.plan?.price || null,
      })) as ClientOption[];
    },
  });

  // Obtener pagos con filtros (CORREGIDO EL FILTRADO OR)
  const { data: paymentsData, isLoading } = useQuery({
    queryKey: ['payments', debouncedSearch, clientFilter, methodFilter, dateRange, page],
    queryFn: async () => {
      let query = supabase
        .from('payments')
        .select('*, client:clients(full_name, id_number, plan:plans(price))', { count: 'exact' })
        .order('payment_date', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (debouncedSearch) {
        query = query.or(`full_name.ilike.%${debouncedSearch}%,id_number.ilike.%${debouncedSearch}%`, {
          foreignTable: 'clients'
        });
      }
      if (clientFilter !== 'all') {
        query = query.eq('client_id', clientFilter);
      }
      if (methodFilter !== 'all') {
        query = query.eq('payment_method', methodFilter);
      }
      if (dateRange?.from) {
        query = query.gte('payment_date', format(dateRange.from, 'yyyy-MM-dd'));
      }
      if (dateRange?.to) {
        query = query.lte('payment_date', format(dateRange.to, 'yyyy-MM-dd'));
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data as Payment[], count: count || 0 };
    },
  });

  const payments = paymentsData?.data || [];
  const totalCount = paymentsData?.count || 0;

  // Formulario
  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      client_id: '',
      amount: 0,
      payment_date: new Date(),
      billing_month: format(new Date(), 'yyyy-MM'),
      payment_method: 'efectivo',
      notes: '',
    },
  });

  // Observa el cliente seleccionado para autocompletar el monto (solo en nuevos pagos)
  const selectedClientId = form.watch('client_id');

  useEffect(() => {
    // Solo autocompletar si estamos creando un nuevo pago (no edición)
    if (!editingPayment && selectedClientId && clients) {
      const client = clients.find(c => c.id === selectedClientId);
      const currentAmount = form.getValues('amount');
      if (client?.plan_price && client.plan_price > 0 && (currentAmount === 0 || currentAmount === null)) {
        form.setValue('amount', client.plan_price);
      }
      // Validación suave del campo cliente
      form.trigger('client_id').catch(console.warn);
    }
  }, [selectedClientId, clients, editingPayment, form]);

  // Dropzone para evidencia
  const onDrop = useCallback((acceptedFiles: File[]) => {
    setEvidenceFile(acceptedFiles[0]);
  }, []);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png'], 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024,
  });

  const uploadEvidence = async (file: File): Promise<string | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const { error } = await supabase.storage
      .from('payment_evidences')
      .upload(fileName, file);
    if (error) throw error;
    return fileName;
  };

  // Generar y salvar recibo de pago
  const generateReceiptPDF = async (paymentId: string, paymentData: PaymentFormData) => {
    try {
      const { data: company, error: companyError } = await supabase
        .from('company_settings')
        .select('*')
        .single();
      if (companyError) throw companyError;

      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('full_name, id_number, address, phone')
        .eq('id', paymentData.client_id)
        .single();
      if (clientError) throw clientError;

      if (!client || !company) {
        throw new Error('No se pudieron obtener los datos para el PDF');
      }

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, 150] });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(company.name || 'Mi Empresa', pageWidth / 2, 10, { align: 'center' });
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(company.address || '', pageWidth / 2, 15, { align: 'center' });
      doc.text(`Tel: ${company.phone || ''}`, pageWidth / 2, 20, { align: 'center' });
      if (company.tax_id) doc.text(`RUC: ${company.tax_id}`, pageWidth / 2, 25, { align: 'center' });
      doc.line(5, 28, pageWidth - 5, 28);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('RECIBO DE PAGO', pageWidth / 2, 33, { align: 'center' });

      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(`Cliente: ${client.full_name}`, 5, 40);
      doc.text(`Cédula: ${client.id_number}`, 5, 45);
      doc.text(`Dirección: ${client.address || ''}`, 5, 50);
      doc.line(5, 53, pageWidth - 5, 53);

      doc.setFont('helvetica', 'bold');
      doc.text('DETALLE DEL PAGO', pageWidth / 2, 58, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text(`Fecha: ${format(new Date(paymentData.payment_date), 'dd/MM/yyyy')}`, 5, 63);
      doc.text(`Mes facturado: ${paymentData.billing_month}`, 5, 68);
      doc.text(`Método: ${paymentData.payment_method}`, 5, 73);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`$${paymentData.amount.toFixed(2)}`, pageWidth / 2, 83, { align: 'center' });
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      if (paymentData.notes) doc.text(`Notas: ${paymentData.notes}`, 5, 90);
      doc.line(5, 95, pageWidth - 5, 95);
      doc.text('Gracias por su pago', pageWidth / 2, 100, { align: 'center' });
      doc.text(`Impreso: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth / 2, 105, { align: 'center' });

      const pdfBlob = doc.output('blob');
      const fileName = `receipt_${paymentId}_${Date.now()}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(fileName, pdfBlob, {
          contentType: 'application/pdf',
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('receipts')
        .getPublicUrl(fileName);
      const publicUrl = publicUrlData.publicUrl;

      const { error: updateError } = await supabase
        .from('payments')
        .update({ receipt_url: publicUrl })
        .eq('id', paymentId);
      if (updateError) throw updateError;

      toast.success('Recibo generado y guardado correctamente');
      window.open(publicUrl, '_blank');
    } catch (error: any) {
      console.error('Error al generar recibo:', error);
      toast.error('Error al generar recibo: ' + (error.message || 'Error de permisos'));
    }
  };

  // Mutación crear/editar
  const mutation = useMutation({
    mutationFn: async (data: PaymentFormData) => {
      let evidenceUrl = editingPayment?.evidence_url || null;

      if (evidenceFile) {
        setUploading(true);
        try {
          evidenceUrl = await uploadEvidence(evidenceFile);
        } catch (uploadError) {
          console.error('Error al subir la evidencia:', uploadError);
          toast.error('No se pudo subir el comprobante');
          setUploading(false);
          throw uploadError;
        } finally {
          setUploading(false);
        }
      }

      let result;

      if (editingPayment) {
        const { error } = await supabase
          .from('payments')
          .update({
            client_id: data.client_id,
            amount: data.amount,
            payment_date: format(data.payment_date, 'yyyy-MM-dd'),
            billing_month: data.billing_month,
            payment_method: data.payment_method,
            notes: data.notes,
            evidence_url: evidenceUrl,
          })
          .eq('id', editingPayment.id);
        if (error) throw error;
        result = { id: editingPayment.id, ...data };
      } else {
        const { data: paymentId, error: insertError } = await supabase.rpc('insert_payment', {
          p_client_id: data.client_id,
          p_amount: data.amount,
          p_payment_date: format(data.payment_date, 'yyyy-MM-dd'),
          p_billing_month: data.billing_month,
          p_payment_method: data.payment_method,
          p_notes: data.notes || null,
          p_evidence_url: evidenceUrl,
          p_created_by: profile?.id,
        });
        if (insertError) throw insertError;
        result = { id: paymentId, ...data };
      }

      if (generateReceipt && result && !editingPayment) {
        try {
          await generateReceiptPDF(result.id, data);
        } catch (err) {
          console.error('Error al generar recibo automático:', err);
        }
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setOpenDialog(false);
      setEditingPayment(null);
      setEvidenceFile(null);
      setGenerateReceipt(false);
      form.reset();
      toast.success('Operación realizada con éxito');
    },
    onError: (error: any) => {
      console.error('Error en mutation:', error);
      toast.error('Error al guardar el pago: ' + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('payments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setPaymentToDelete(null);
      toast.success('Pago eliminado correctamente');
    },
    onError: (error: any) => {
      toast.error('Error al eliminar: ' + error.message);
    },
  });

  const onSubmit = (data: PaymentFormData) => mutation.mutate(data);

  const handleEdit = (payment: Payment) => {
    setEditingPayment(payment);
    form.reset({
      client_id: payment.client_id,
      amount: payment.amount,
      payment_date: new Date(payment.payment_date),
      billing_month: payment.billing_month,
      payment_method: payment.payment_method,
      notes: payment.notes || '',
    });
    setEvidenceFile(null);
    setOpenDialog(true);
  };

  const handleAddNew = () => {
    setEditingPayment(null);
    form.reset({
      client_id: '',
      amount: 0,
      payment_date: new Date(),
      billing_month: format(new Date(), 'yyyy-MM'),
      payment_method: 'efectivo',
      notes: '',
    });
    setEvidenceFile(null);
    setGenerateReceipt(false);
    setOpenDialog(true);
  };

  const handleGenerateExistingReceipt = async (payment: Payment) => {
    const paymentData: PaymentFormData = {
      client_id: payment.client_id,
      amount: payment.amount,
      payment_date: new Date(payment.payment_date),
      billing_month: payment.billing_month,
      payment_method: payment.payment_method,
      notes: payment.notes,
    };
    await generateReceiptPDF(payment.id, paymentData);
    queryClient.invalidateQueries({ queryKey: ['payments'] });
  };

  const getMethodBadge = (method: string) => {
    const map: Record<string, string> = {
      efectivo: 'Efectivo',
      transferencia: 'Transferencia',
      tarjeta: 'Tarjeta',
      otro: 'Otro',
    };
    return map[method] || method;
  };

  const getEvidenceUrl = (path: string | null) => {
    if (!path) return null;
    const { data } = supabase.storage.from('payment_evidences').getPublicUrl(path);
    return data.publicUrl;
  };

  useEffect(() => {
    if (preselectedClientId && clients) {
      setClientFilter(preselectedClientId);
    }
  }, [preselectedClientId, clients]);

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-light tracking-tight">Pagos</h1>
          <p className="text-muted-foreground">
            Registra y consulta los pagos de tus clientes
          </p>
        </div>
        {canEdit && (
          <Button onClick={handleAddNew}>
            <Plus className="mr-2 h-4 w-4" />
            Registrar Pago
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por cliente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Cliente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los clientes</SelectItem>
                  {clients?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={methodFilter} onValueChange={setMethodFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Método" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[240px] justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, 'dd/MM/yy')} - {format(dateRange.to, 'dd/MM/yy')}
                        </>
                      ) : (
                        format(dateRange.from, 'dd/MM/yy')
                      )
                    ) : (
                      'Filtrar por fecha'
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={dateRange}
                    onSelect={(range: any) => setDateRange(range)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {(searchTerm || clientFilter !== 'all' || methodFilter !== 'all' || dateRange) && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSearchTerm('');
                    setClientFilter('all');
                    setMethodFilter('all');
                    setDateRange(undefined);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Button variant="outline" size="icon" disabled>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Fecha de pago</TableHead>
                <TableHead>Mes facturado</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Comprobante</TableHead>
                <TableHead>Recibo</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{payment.client?.full_name || 'Cliente no encontrado'}</p>
                      <p className="text-xs text-muted-foreground">{payment.client?.id_number || '—'}</p>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">${payment.amount.toFixed(2)}</TableCell>
                  <TableCell>{format(new Date(payment.payment_date), 'dd/MM/yyyy')}</TableCell>
                  <TableCell>{payment.billing_month}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{getMethodBadge(payment.payment_method)}</Badge>
                  </TableCell>
                  <TableCell>
                    {payment.evidence_url ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => payment.evidence_url && window.open(getEvidenceUrl(payment.evidence_url), '_blank')}
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        Ver
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {payment.receipt_url ? (
                      <Button variant="ghost" size="sm" onClick={() => payment.receipt_url && window.open(payment.receipt_url, '_blank')}>
                        <Printer className="mr-1 h-3 w-3" />
                        Ver
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleGenerateExistingReceipt(payment)}
                        disabled={!canEdit}
                      >
                        <Printer className="mr-1 h-3 w-3" />
                        Generar
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(payment)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="icon" onClick={() => setPaymentToDelete(payment)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {payments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No se encontraron pagos
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {totalCount > pageSize && (
            <div className="flex items-center justify-end space-x-2 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {page + 1} de {Math.ceil(totalCount / pageSize)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * pageSize >= totalCount}
              >
                Siguiente
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Formulario */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingPayment ? 'Editar Pago' : 'Registrar Pago'}</DialogTitle>
            <DialogDescription>
              Completa los datos del pago
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client_id">Cliente *</Label>
              <Select
                value={form.watch('client_id')}
                onValueChange={(value) => form.setValue('client_id', value, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cliente" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {clients?.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.full_name} - {client.id_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.client_id && (
                <p className="text-sm text-destructive">{form.formState.errors.client_id.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Monto ($) *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  {...form.register('amount')}
                />
                {form.formState.errors.amount && (
                  <p className="text-sm text-destructive">{form.formState.errors.amount.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment_date">Fecha de pago *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !form.watch('payment_date') && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.watch('payment_date') ? (
                        format(form.watch('payment_date'), 'PPP', { locale: es })
                      ) : (
                        <span>Seleccionar fecha</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={form.watch('payment_date')}
                      onSelect={(date) => date && form.setValue('payment_date', date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="billing_month">Mes facturado *</Label>
              <Select
                value={form.watch('billing_month')}
                onValueChange={(value) => form.setValue('billing_month', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar mes" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_method">Método de pago *</Label>
              <Select
                value={form.watch('payment_method')}
                onValueChange={(value: 'efectivo' | 'transferencia' | 'tarjeta' | 'otro') => form.setValue('payment_method', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notas (opcional)</Label>
              <Textarea id="notes" {...form.register('notes')} placeholder="Observaciones..." />
            </div>

            <div className="space-y-2">
              <Label>Comprobante (opcional)</Label>
              <div
                {...getRootProps()}
                className="cursor-pointer rounded-lg border-2 border-dashed border-muted-foreground/25 p-4 text-center transition-colors hover:border-primary/50"
              >
                <input {...getInputProps()} />
                <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {isDragActive
                    ? 'Suelta el archivo aquí'
                    : evidenceFile
                    ? `Archivo: ${evidenceFile.name}`
                    : editingPayment?.evidence_url
                    ? 'Comprobante actual. Haz clic o arrastra para cambiar.'
                    : 'Arrastra una imagen/PDF o haz clic para seleccionar'}
                </p>
                {editingPayment?.evidence_url && !evidenceFile && (
                  <Button
                    variant="link"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      editingPayment?.evidence_url && window.open(getEvidenceUrl(editingPayment.evidence_url), '_blank');
                    }}
                  >
                    Ver comprobante actual
                  </Button>
                )}
              </div>
            </div>

            {!editingPayment && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="generate_receipt"
                  checked={generateReceipt}
                  onCheckedChange={(checked) => setGenerateReceipt(checked as boolean)}
                />
                <Label htmlFor="generate_receipt" className="text-sm cursor-pointer">
                  Generar recibo simple automáticamente
                </Label>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending || uploading}>
                {(mutation.isPending || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingPayment ? 'Guardar cambios' : 'Registrar pago'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Diálogo de eliminación blindado contra nulos en cierres asíncronos */}
      <AlertDialog open={!!paymentToDelete} onOpenChange={() => setPaymentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar pago?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará el pago de{' '}
              <span className="font-semibold">{paymentToDelete?.client?.full_name || 'este cliente'}</span>
              {paymentToDelete?.amount !== undefined ? ` por $${paymentToDelete.amount.toFixed(2)}.` : '.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => paymentToDelete && deleteMutation.mutate(paymentToDelete.id)}
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}