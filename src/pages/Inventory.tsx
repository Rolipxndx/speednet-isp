import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card'; // CardTitle eliminado
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
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Loader2,
  Search,
  Filter,
  Pencil,
  Trash2,
} from 'lucide-react'; // Iconos no usados eliminados (Package, UserCheck, Wrench, X)
import { format } from 'date-fns'; // 'es' eliminado porque no se usaba

// Esquema de validación
const inventorySchema = z.object({
  type: z.string().min(1, 'Tipo requerido'),
  model: z.string().min(1, 'Modelo requerido'),
  serial: z.string().min(1, 'Serial requerido'),
  status: z.enum(['instalado', 'dañado', 'disponible']).default('disponible'),
  assigned_to: z.string().uuid('Cliente inválido').optional().nullable(),
  installation_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type InventoryFormData = z.infer<typeof inventorySchema>;

type Equipment = {
  id: string;
  type: string;
  model: string;
  serial: string;
  status: 'disponible' | 'instalado' | 'dañado';
  assigned_to: string | null;
  installation_date: string | null;
  notes: string | null;
  client?: { full_name: string };
};

type ClientOption = {
  id: string;
  full_name: string;
  id_number: string;
};

export default function Inventory() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const preselectedClientId = searchParams.get('client');

  const [openDialog, setOpenDialog] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [equipmentToDelete, setEquipmentToDelete] = useState<Equipment | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const [hasPreselected, setHasPreselected] = useState(false);

  const isAdmin = profile?.role === 'admin';
  const canManage = isAdmin;

  // Obtener clientes para selector
  const { data: clients } = useQuery({
    queryKey: ['clients-select'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, full_name, id_number')
        .order('full_name');
      if (error) throw error;
      return data as ClientOption[];
    },
  });

  // Obtener equipos con filtros
  const { data: equipmentData, isLoading } = useQuery({
    queryKey: ['inventory', debouncedSearch, statusFilter, page],
    queryFn: async () => {
      let query = supabase
        .from('inventory')
        .select('*, client:clients(full_name)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (debouncedSearch) {
        query = query.or(
          `serial.ilike.%${debouncedSearch}%,model.ilike.%${debouncedSearch}%,type.ilike.%${debouncedSearch}%`
        );
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data as any[], count: count || 0 };
    },
  });

  const equipment = equipmentData?.data || [];
  const totalCount = equipmentData?.count || 0;

  // Formulario
  const form = useForm<InventoryFormData>({
    resolver: zodResolver(inventorySchema),
    defaultValues: {
      type: '',
      model: '',
      serial: '',
      status: 'disponible',
      assigned_to: null,
      installation_date: null,
      notes: '',
    },
  });

  // Efecto para preseleccionar cliente SOLO UNA VEZ al cargar la página
  useEffect(() => {
    if (preselectedClientId && clients && !hasPreselected && !openDialog && !editingEquipment) {
      const client = clients.find(c => c.id === preselectedClientId);
      if (client) {
        form.reset({
          type: '',
          model: '',
          serial: '',
          status: 'disponible',
          assigned_to: client.id,
          installation_date: null,
          notes: '',
        });
        setEditingEquipment(null);
        setOpenDialog(true);
        setHasPreselected(true);
      }
    }
  }, [preselectedClientId, clients, hasPreselected, openDialog, editingEquipment, form]);

  // Mutación crear/editar
  const mutation = useMutation({
    mutationFn: async (data: InventoryFormData) => {
      const payload = {
        ...data,
        assigned_to: data.assigned_to || null,
      };

      if (editingEquipment) {
        const { error } = await supabase
          .from('inventory')
          .update(payload)
          .eq('id', editingEquipment.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('inventory').insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setOpenDialog(false);
      setEditingEquipment(null);
      form.reset();
    },
    onError: (error) => {
      alert('Error al guardar equipo: ' + error.message);
    },
  });

  // Mutación eliminar
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('inventory').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setEquipmentToDelete(null);
    },
  });

  const onSubmit = (data: InventoryFormData) => mutation.mutate(data);

  const handleEdit = (eq: Equipment) => {
    setEditingEquipment(eq);
    form.reset({
      type: eq.type,
      model: eq.model,
      serial: eq.serial,
      status: eq.status,
      assigned_to: eq.assigned_to,
      installation_date: eq.installation_date,
      notes: eq.notes,
    });
    setOpenDialog(true);
  };

  const handleAddNew = () => {
    setEditingEquipment(null);
    form.reset({
      type: '',
      model: '',
      serial: '',
      status: 'disponible',
      assigned_to: null,
      installation_date: null,
      notes: '',
    });
    setOpenDialog(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'disponible': return <Badge variant="default">Disponible</Badge>;
      case 'instalado': return <Badge variant="secondary">Instalado</Badge>;
      case 'dañado': return <Badge variant="destructive">Dañado</Badge>;
      default: return null;
    }
  };

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
          <h1 className="text-3xl font-light tracking-tight">Inventario</h1>
          <p className="text-muted-foreground">
            Equipos registrados y su asignación
          </p>
        </div>
        {canManage && (
          <Button onClick={handleAddNew}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Equipo
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por serial, modelo o tipo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="disponible">Disponible</SelectItem>
                  <SelectItem value="instalado">Instalado</SelectItem>
                  <SelectItem value="dañado">Dañado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <CardDescription>
              {totalCount} equipo(s) en total
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Asignado a</TableHead>
                <TableHead>Instalación</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {equipment.map((eq) => (
                <TableRow key={eq.id}>
                  <TableCell className="font-medium">{eq.type}</TableCell>
                  <TableCell>{eq.model}</TableCell>
                  <TableCell>{eq.serial}</TableCell>
                  <TableCell>{getStatusBadge(eq.status)}</TableCell>
                  <TableCell>
                    {eq.client?.full_name || '—'}
                  </TableCell>
                  <TableCell>
                    {eq.installation_date
                      ? format(new Date(eq.installation_date), 'dd/MM/yyyy')
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {canManage && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(eq)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setEquipmentToDelete(eq)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {equipment.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No hay equipos registrados
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
            <DialogTitle>{editingEquipment ? 'Editar Equipo' : 'Nuevo Equipo'}</DialogTitle>
            <DialogDescription>
              Completa los datos del equipo
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Tipo *</Label>
                <Input id="type" {...form.register('type')} placeholder="Router, Antena, ONT..." />
                {form.formState.errors.type && (
                  <p className="text-sm text-destructive">{form.formState.errors.type.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Modelo *</Label>
                <Input id="model" {...form.register('model')} />
                {form.formState.errors.model && (
                  <p className="text-sm text-destructive">{form.formState.errors.model.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="serial">Serial *</Label>
              <Input id="serial" {...form.register('serial')} />
              {form.formState.errors.serial && (
                <p className="text-sm text-destructive">{form.formState.errors.serial.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select
                value={form.watch('status')}
                onValueChange={(value: 'disponible' | 'instalado' | 'dañado') =>
                  form.setValue('status', value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="disponible">Disponible</SelectItem>
                  <SelectItem value="instalado">Instalado</SelectItem>
                  <SelectItem value="dañado">Dañado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assigned_to">Asignar a cliente</Label>
              <Select
                value={form.watch('assigned_to') || 'none'}
                onValueChange={(value) =>
                  form.setValue('assigned_to', value === 'none' ? null : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {clients?.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.full_name} ({client.id_number})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="installation_date">Fecha de instalación</Label>
              <Input id="installation_date" type="date" {...form.register('installation_date')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea id="notes" {...form.register('notes')} placeholder="Observaciones..." />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingEquipment ? 'Guardar cambios' : 'Crear equipo'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Diálogo de eliminación */}
      <AlertDialog open={!!equipmentToDelete} onOpenChange={() => setEquipmentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar equipo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el equipo <strong>{equipmentToDelete?.type} {equipmentToDelete?.model} (SN: {equipmentToDelete?.serial})</strong> permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => equipmentToDelete && deleteMutation.mutate(equipmentToDelete.id)}
              className="bg-destructive hover:bg-destructive/90"
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